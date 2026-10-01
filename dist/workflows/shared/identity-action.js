import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { useClientBoundary } from "../../client/provider-context.js";
import { workflowLocks } from "./locks.js";
import { actionControl, classifyWorkflowFailure, ignored, operationFeedback, useCommittedRef, } from "./action.js";
import { identityOperationObsolete } from "./identity-sync.js";
function retireCallback(callbacks, scope, owner) {
    const retirement = callbacks.get(scope);
    if (retirement?.owner !== owner)
        return;
    retirement.callback?.();
    callbacks.delete(scope);
}
function retireLease(active, scope, owner) {
    const lease = active.get(scope);
    if (lease?.owner !== owner)
        return;
    lease.callbackAllowed = false;
    lease.controller.abort();
}
function retireVisibleState(visible, scope, owner) {
    if (visible.get(scope)?.owner === owner)
        visible.delete(scope);
}
function createIdentityOperations() {
    const listeners = new Set();
    const visible = new Map();
    const active = new Map();
    const retireCallbacks = new Map();
    let revision = 0;
    const changed = () => {
        revision++;
        for (const listener of listeners)
            listener();
    };
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot: () => revision,
        configure(scope, owner, onRetire) {
            retireCallbacks.set(scope, { owner, callback: onRetire });
        },
        view(scope) {
            return visible.get(scope);
        },
        begin(scope, owner, target) {
            if (active.has(scope))
                return null;
            const lease = {
                owner,
                scope,
                controller: new AbortController(),
                active: true,
                callbackAllowed: true,
            };
            active.set(scope, lease);
            visible.set(scope, { owner, pending: target, error: null });
            changed();
            return lease;
        },
        adopt(scope, owner) {
            const lease = active.get(scope);
            if (!lease)
                return;
            lease.owner = owner;
            const state = visible.get(scope);
            if (state)
                visible.set(scope, { ...state, owner });
            changed();
        },
        pending(lease, target) {
            if (active.get(lease.scope) !== lease)
                return;
            const state = visible.get(lease.scope);
            visible.set(lease.scope, {
                owner: lease.owner,
                pending: target,
                error: state?.error ?? null,
                target: state?.target,
            });
            changed();
        },
        fail(lease, target, error) {
            if (active.get(lease.scope) !== lease)
                return;
            visible.set(lease.scope, { owner: lease.owner, pending: null, error, target });
            changed();
        },
        finish(lease) {
            if (active.get(lease.scope) !== lease)
                return;
            lease.active = false;
            active.delete(lease.scope);
            const state = visible.get(lease.scope);
            if (state?.pending)
                visible.set(lease.scope, { ...state, pending: null });
            changed();
        },
        reset(scope) {
            if (active.has(scope))
                return;
            if (visible.delete(scope))
                changed();
        },
        retire(scope, owner) {
            const lease = active.get(scope);
            const state = visible.get(scope);
            if (lease?.owner !== owner && state?.owner !== owner)
                return;
            retireCallback(retireCallbacks, scope, owner);
            retireLease(active, scope, owner);
            retireVisibleState(visible, scope, owner);
            changed();
        },
        clearReceipt(scope, owner) {
            const retirement = retireCallbacks.get(scope);
            if (retirement?.owner !== owner)
                return;
            retirement.callback?.();
            retireCallbacks.delete(scope);
        },
    };
}
const stores = new WeakMap();
const conflict = Symbol("identity workflow conflict");
function identityOperations(runtime) {
    let store = stores.get(runtime);
    if (!store) {
        store = createIdentityOperations();
        stores.set(runtime, store);
    }
    return store;
}
function useIdentityOwner(runtime, scope, store, onRetire) {
    const [owner] = useState(() => Symbol());
    const providerRevision = runtime.attachmentRevision;
    store.configure(scope, owner, onRetire);
    useLayoutEffect(() => {
        store.adopt(scope, owner);
        return () => {
            queueMicrotask(() => {
                if (runtime.attachmentRevision === providerRevision || runtime.attached === 0)
                    store.retire(scope, owner);
            });
        };
    }, [runtime, scope, owner, providerRevision, store]);
    return owner;
}
function isAvailable(runtime, availability, enabled, disposed, view) {
    const observation = runtime.authObservation;
    if (!enabled)
        return false;
    if (disposed)
        return false;
    if (viewHasRecovery(view))
        return true;
    if (observation.sessionPending)
        return false;
    if (availability === "settled")
        return true;
    // A guest (Better Auth anonymous user) signs in or up from their session and is linked.
    if (availability === "guest")
        return !observation.userId || observation.isAnonymous;
    if (guestRequiresAccount(runtime, availability))
        return false;
    if (availability === "session")
        return Boolean(observation.userId && observation.sessionId);
    return observation.ready;
}
/** Reauthentication needs an account; so does signing out when the app keeps guests. */
function guestRequiresAccount(runtime, availability) {
    return (runtime.authObservation.isAnonymous &&
        (availability === "authenticated" || (availability === "session" && !!runtime.features.guests)));
}
function viewHasRecovery(view) {
    if (!view)
        return false;
    if (view.pending !== null)
        return true;
    return view.error?.writeSucceeded === true;
}
function beginIdentityExecution(locks, store, scope, owner, target, generation) {
    const lock = locks.acquire(target, generation);
    if (!lock)
        return;
    const lease = store.begin(scope, owner, target);
    if (lease)
        return { lease, lock };
    lock.release();
}
function identityTransaction(store, execution, state, valid) {
    return {
        current: valid,
        signal: execution.lease.controller.signal,
        phase: (next) => {
            state.phase = next;
        },
        complete: async (callback) => {
            if (!valid())
                throw new Error("Obsolete workflow completion");
            state.phase = "callback";
            state.completionDelivered = true;
            await callback();
        },
        write: async (write, nextTarget) => {
            if (!valid())
                throw new Error("Obsolete workflow");
            if (nextTarget) {
                state.target = {
                    ...state.target,
                    ...(typeof nextTarget === "string" ? { invitationId: nextTarget } : nextTarget),
                };
                if (!execution.lock.extend(state.target))
                    throw conflict;
                store.pending(execution.lease, state.target);
            }
            const result = await write();
            state.writeSucceeded = true;
            return result;
        },
    };
}
function identityFailure(cause, valid, state, store, scope, owner, lease, onError) {
    if (!valid() && !state.completionDelivered)
        return ignored("obsolete");
    if (cause === conflict)
        return ignored("busy");
    if (cause === identityOperationObsolete) {
        store.clearReceipt(scope, owner);
        return ignored("obsolete");
    }
    const failure = classifyWorkflowFailure(cause);
    const error = {
        phase: state.phase,
        cause: failure.cause,
        writeSucceeded: state.writeSucceeded,
    };
    if (!failure.isHandled) {
        store.fail(lease, state.target, error);
        onError?.({ target: state.target, error: failure.cause, diagnostics: error });
    }
    return { status: "error", error };
}
async function executeIdentityAction(context, initialTarget, work, alreadyWritten) {
    if (!context.current())
        return ignored("obsolete");
    if (!context.available)
        return ignored("disabled");
    if (context.store.view(context.scope)?.pending != null)
        return ignored("busy");
    const execution = beginIdentityExecution(context.locks, context.store, context.scope, context.owner, initialTarget, context.generation);
    if (!execution)
        return ignored("busy");
    const state = {
        completionDelivered: false,
        phase: "write",
        target: initialTarget,
        writeSucceeded: alreadyWritten,
    };
    const valid = () => context.current() && execution.lease.active && execution.lease.callbackAllowed;
    try {
        const data = await work(identityTransaction(context.store, execution, state, valid));
        return !valid() && !state.completionDelivered
            ? ignored("obsolete")
            : { status: "success", data };
    }
    catch (cause) {
        return identityFailure(cause, valid, state, context.store, context.scope, context.owner, execution.lease, context.callbacks.onError);
    }
    finally {
        execution.lock.release();
        context.store.finish(execution.lease);
    }
}
/** Coordinates operations whose successful result intentionally changes session identity. */
export function useIdentityAction(runtime, scope, availability, enabled = true, options = {}, lifecycleOptions = {}) {
    const callbacks = useCommittedRef(options);
    const { identity, disposed } = useClientBoundary(runtime);
    const locks = workflowLocks(runtime);
    const store = identityOperations(runtime);
    useSyncExternalStore(locks.subscribe, locks.getSnapshot, locks.getSnapshot);
    useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    useSyncExternalStore(runtime.subscribeAuth, runtime.getAuthRevision, runtime.getAuthRevision);
    const observation = runtime.authObservation;
    const view = store.view(scope);
    const owner = useIdentityOwner(runtime, scope, store, lifecycleOptions.onRetire);
    const available = isAvailable(runtime, availability, enabled, disposed, view);
    const unavailableReason = guestRequiresAccount(runtime, availability)
        ? { code: "accountRequired" }
        : { code: "disabled" };
    const current = () => !runtime.disposed;
    const busy = () => store.view(scope)?.pending != null;
    function reset() {
        store.reset(scope);
    }
    const run = (target, work, alreadyWritten = false) => executeIdentityAction({
        callbacks: callbacks.current,
        current,
        available,
        generation: runtime.generation,
        locks,
        owner,
        scope,
        store,
    }, target, work, alreadyWritten);
    function control(target, reason = null) {
        const visible = store.view(scope);
        return actionControl(available, visible?.pending, target, locks.conflicts(target, runtime.generation), reason, unavailableReason);
    }
    return {
        control,
        feedback: (recoveries = []) => operationFeedback(view, recoveries),
        owner,
        actorId: observation.userId ?? identity.userId,
        available,
        current,
        busy,
        canEdit: () => current() && available && !busy(),
        run,
        reset,
        isBusy: view?.pending != null,
        pendingAction: view?.pending ?? null,
        error: view?.error ?? null,
    };
}
//# sourceMappingURL=identity-action.js.map