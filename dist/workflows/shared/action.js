import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { workflowLocks } from "./locks.js";
import { useMutation } from "@tanstack/react-query";
import { useClientBoundary } from "../../client/provider-context.js";
export const asRecord = (value) => value !== null && typeof value === "object" ? value : undefined;
export const asRecords = (value) => Array.isArray(value) ? value.map(asRecord).filter((row) => !!row) : [];
/** Better Auth's error code (`INVALID_EMAIL_OR_PASSWORD`, ...) from a thrown or returned error. */
export function getAuthErrorCode(cause) {
    const row = asRecord(cause);
    if (!row)
        return;
    if (typeof row.code === "string")
        return row.code;
    return getAuthErrorCode(row.error) ?? getAuthErrorCode(row.body);
}
export const ignored = (reason) => ({ status: "ignored", reason });
const conflict = Symbol("workflow conflict");
const unavailable = Symbol("workflow unavailable");
const handledFailure = Symbol("handled workflow failure");
/** Marks a failure already represented by workflow-owned state, such as form validation. */
export const handledWorkflowFailure = (cause) => ({
    [handledFailure]: true,
    cause,
});
export function classifyWorkflowFailure(cause) {
    const handled = typeof cause === "object" && cause !== null && handledFailure in cause
        ? cause
        : null;
    return { cause: handled?.cause ?? cause, isHandled: handled !== null };
}
export function requireAvailable(condition) {
    if (!condition)
        throw unavailable;
}
export function enforcePolicy(decision) {
    if (!decision.allowed)
        throw { code: decision.code };
}
export const allowed = { allowed: true };
export const denied = (code) => ({ allowed: false, code });
export const policyReason = (decision) => decision.allowed ? null : { code: "policy", policyCode: decision.code };
export function useCommittedRef(value) {
    const ref = useRef(value);
    useLayoutEffect(() => {
        ref.current = value;
    });
    return ref;
}
export function getActionState(action) {
    return {
        feedback: action.feedback(),
        isPending: action.isBusy,
        diagnostics: { pendingAction: action.pendingAction, error: action.error },
        reset: () => action.reset(),
    };
}
// Recovery already presents its operation's error; don't render it a second time.
export function operationFeedback(state, recoveries) {
    if (!state?.error || !state.target)
        return recoveries;
    const { target, error } = state;
    const represented = recoveries.some((entry) => entry.target.operation === target.operation &&
        entry.target.invitationId === target.invitationId &&
        (target.invitationId !== undefined || entry.target.organizationId === target.organizationId));
    return represented
        ? recoveries
        : [...recoveries, { target, error: error.cause, diagnostics: error, recovery: null }];
}
export function actionControl(available, pending, target, conflicts, reason, unavailableReason = { code: "disabled" }) {
    const disabledReason = !available
        ? unavailableReason
        : pending != null || conflicts
            ? { code: "busy" }
            : reason;
    return {
        isDisabled: disabledReason !== null,
        isPending: pending != null &&
            Object.entries(target).every(([key, value]) => pending[key] === value),
        disabledReason,
    };
}
/** TanStack observes writes; this coordinator owns only locks and guarded continuations. */
export function useWorkflowAction(runtime, scope, enabled = true, options = {}) {
    const callbacks = useCommittedRef(options);
    const locks = workflowLocks(runtime);
    useSyncExternalStore(locks.subscribe, locks.getSnapshot, locks.getSnapshot);
    const { identity, disposed } = useClientBoundary(runtime);
    const key = JSON.stringify([identity, scope, disposed]);
    const [boundary, setBoundary] = useState(() => ({ key, owner: Symbol() }));
    if (boundary.key !== key)
        setBoundary({ key, owner: Symbol() });
    const { owner } = boundary;
    const lifecycle = useRef({
        owner,
        active: false,
        busy: false,
        available: false,
        suspension: 0,
        controllers: new Set(),
    });
    // Organization, invitation, session and account workflows need an account, not a guest.
    const available = enabled && identity.ready && !identity.isAnonymous && !disposed;
    const unavailableReason = enabled && identity.ready && identity.isAnonymous && !disposed
        ? { code: "accountRequired" }
        : { code: "disabled" };
    const { reset: resetMutation, mutateAsync } = useMutation({
        mutationFn: (write) => write(),
        retry: false,
        gcTime: 0,
        networkMode: "always",
    }, runtime.cache);
    const [feedback, setFeedback] = useState();
    useLayoutEffect(() => {
        const lease = {
            owner,
            active: true,
            busy: false,
            available: false,
            suspension: 0,
            controllers: new Set(),
        };
        lifecycle.current = lease;
        resetMutation();
        return () => {
            lease.active = false;
            for (const controller of lease.controllers)
                controller.abort();
            resetMutation();
        };
    }, [owner, resetMutation]);
    useLayoutEffect(() => {
        lifecycle.current.available = available;
        if (!available) {
            lifecycle.current.suspension++;
            for (const controller of lifecycle.current.controllers)
                controller.abort();
        }
    }, [owner, available]);
    const current = () => lifecycle.current.active && lifecycle.current.owner === owner && !runtime.disposed;
    const busy = () => lifecycle.current.owner === owner && lifecycle.current.busy;
    function reset() {
        if (current() && !busy()) {
            resetMutation();
            setFeedback(undefined);
        }
    }
    async function run(pending, work, alreadyWritten = false) {
        if (!current())
            return ignored("obsolete");
        if (!lifecycle.current.available)
            return ignored("disabled");
        if (busy())
            return ignored("busy");
        const generation = runtime.generation;
        const lock = locks.acquire(pending, generation);
        if (!lock)
            return ignored("busy");
        const lease = lifecycle.current;
        lease.busy = true;
        const controller = new AbortController();
        lease.controllers.add(controller);
        const suspension = lease.suspension;
        setFeedback({ owner, pending, error: null });
        let phase = "write";
        let writeSucceeded = alreadyWritten;
        let completionDelivered = false;
        const valid = () => current() &&
            lifecycle.current === lease &&
            lease.available &&
            lease.suspension === suspension &&
            generation === runtime.generation;
        try {
            const data = await work({
                current: valid,
                signal: controller.signal,
                phase: (next) => {
                    phase = next;
                },
                complete: async (callback) => {
                    if (!valid())
                        throw new Error("Obsolete workflow completion");
                    phase = "callback";
                    completionDelivered = true;
                    await callback();
                },
                write: async (fn, target) => {
                    if (!valid())
                        throw new Error("Obsolete workflow");
                    if (target) {
                        pending = {
                            ...pending,
                            ...(typeof target === "string" ? { invitationId: target } : target),
                        };
                        if (!lock.extend(pending))
                            throw conflict;
                        setFeedback({ owner, pending, error: null });
                    }
                    const result = await mutateAsync(() => {
                        if (!valid())
                            throw new Error("Obsolete workflow");
                        return fn();
                    });
                    writeSucceeded = true;
                    return result;
                },
            });
            if (!valid() && !completionDelivered)
                return ignored("obsolete");
            return { status: "success", data };
        }
        catch (cause) {
            if (!valid() && !completionDelivered)
                return ignored("obsolete");
            if (cause === conflict)
                return ignored("busy");
            if (cause === unavailable)
                return ignored("unavailable");
            const failure = classifyWorkflowFailure(cause);
            const error = { phase, cause: failure.cause, writeSucceeded };
            if (valid() && !failure.isHandled) {
                setFeedback({ owner, pending: null, error, target: pending });
                callbacks.current.onError?.({
                    target: pending,
                    error: failure.cause,
                    diagnostics: error,
                });
            }
            return { status: "error", error };
        }
        finally {
            lock.release();
            lease.controllers.delete(controller);
            if (current() && lifecycle.current === lease) {
                lease.busy = false;
                resetMutation();
                setFeedback((previous) => previous?.owner === owner ? { ...previous, pending: null } : previous);
            }
        }
    }
    const visible = available && feedback?.owner === owner ? feedback : undefined;
    function control(target, reason = null) {
        return actionControl(available, visible?.pending, target, locks.conflicts(target, runtime.generation), reason, unavailableReason);
    }
    return {
        control,
        feedback: (recoveries = []) => operationFeedback(visible, recoveries),
        owner,
        actorId: identity.userId,
        available,
        current,
        busy,
        canEdit: () => current() && lifecycle.current.available && !busy(),
        run,
        reset,
        isBusy: visible?.pending != null,
        pendingAction: visible?.pending ?? null,
        error: visible?.error ?? null,
    };
}
//# sourceMappingURL=action.js.map