import { useLayoutEffect, useState } from "react";
import { looseObject, string } from "zod";
import { asRecord, getActionState, requireAvailable, useWorkflowAction, } from "../shared/action.js";
import { useWorkflowForm } from "../shared/form.js";
import { useIdentityAction } from "../shared/identity-action.js";
import { resultIdentity, synchronizeAuthenticated, textValue } from "../shared/identity-sync.js";
import { defineSchemaWorkflow, defineWorkflow, exposeWorkflow } from "../shared/root.js";
const required = string().refine((value) => Boolean(value.trim()), "Required");
const emailMinimum = looseObject({ newEmail: required });
const passwordMinimum = looseObject({
    currentPassword: required,
    newPassword: required,
});
const reauthenticationMinimum = looseObject({ password: required });
const secretFields = ["password", "confirmPassword", "currentPassword", "newPassword"];
function preserveRecoveryReset(state, pending) {
    return pending ? { ...state, reset() { } } : state;
}
function createUserObserver() {
    let current = {
        data: undefined,
        identity: undefined,
        isPending: true,
        error: null,
    };
    const listeners = new Set();
    return {
        get current() {
            return current;
        },
        observe(next) {
            current = next;
            for (const listener of listeners)
                listener();
        },
        waitFor(predicate, signal, timeout = 10_000) {
            if (signal.aborted)
                return Promise.reject(new DOMException("Profile synchronization was cancelled", "AbortError"));
            if (current.data && predicate(current.data))
                return Promise.resolve(current.data);
            if (current.error)
                return Promise.reject(current.error);
            return new Promise((resolve, reject) => {
                const finish = (error, user) => {
                    clearTimeout(timer);
                    listeners.delete(check);
                    signal.removeEventListener("abort", abort);
                    if (error)
                        reject(error);
                    else
                        resolve(user);
                };
                const check = () => {
                    if (current.error)
                        finish(current.error);
                    else if (current.data && predicate(current.data))
                        finish(null, current.data);
                };
                const abort = () => finish(new DOMException("Profile synchronization was cancelled", "AbortError"));
                const timer = setTimeout(() => finish(new Error("Profile synchronization timed out")), timeout);
                listeners.add(check);
                signal.addEventListener("abort", abort, { once: true });
            });
        },
    };
}
function matches(user, values) {
    const row = asRecord(user);
    return (!!row &&
        Object.entries(values).every(([key, value]) => value === undefined || Object.is(row[key], value)));
}
function useProfileUpdates(auth, users, action, onUpdated) {
    const [receipt, setReceipt] = useState();
    const pending = receipt?.owner === action.owner ? receipt : undefined;
    const publish = (value) => setReceipt(value ? { owner: action.owner, ...value } : undefined);
    async function synchronize(values, transaction) {
        transaction.phase("synchronization");
        const canonical = await users.waitFor((candidate) => matches(candidate, values), transaction.signal);
        publish(undefined);
        return { outcome: "updated", user: canonical };
    }
    async function write(target, values, transaction) {
        await transaction.write(() => auth.updateUser(values, { throw: true, retry: 0 }));
        publish({ target, values });
        return synchronize(values, transaction);
    }
    async function complete(completion, transaction) {
        await transaction.complete(() => onUpdated?.(completion));
        return completion;
    }
    const recoveryTarget = { operation: pending?.target ?? "updateProfile" };
    const recovery = {
        ...action.control(recoveryTarget),
        run: () => pending
            ? action.run(recoveryTarget, async (transaction) => complete(await synchronize(pending.values, transaction), transaction), true)
            : Promise.resolve({ status: "ignored", reason: "unavailable" }),
    };
    const recoveries = pending && action.error?.writeSucceeded
        ? [
            {
                target: recoveryTarget,
                error: action.error.cause,
                diagnostics: action.error,
                recovery,
            },
        ]
        : [];
    return { pending, feedback: action.feedback(recoveries), write, complete };
}
function profileAction(action, updates, target, values) {
    const operation = { operation: target };
    return {
        ...action.control(operation, updates.pending ? { code: "recovery" } : null),
        run: (...args) => updates.pending
            ? Promise.resolve({ status: "ignored", reason: "disabled" })
            : action.run(operation, async (transaction) => updates.complete(await updates.write(target, values(...args), transaction), transaction)),
    };
}
function profileInitialValues(user, options) {
    return user ? options.getInitialValues(user) : {};
}
export function createAccountWorkflows(auth, runtime, currentUser) {
    const users = createUserObserver();
    const reauthenticationReceipts = new Map();
    function useUser() {
        const state = currentUser.useCurrentUser();
        useLayoutEffect(() => users.observe(state), [state]);
        return state;
    }
    function useProfileSettings(options) {
        const source = useUser();
        const user = source.data ?? undefined;
        const enabled = options.enabled !== false &&
            !!user &&
            source.identity !== undefined &&
            source.identity === runtime.authObservation.userId;
        const action = useWorkflowAction(runtime, "profile-settings", enabled, options);
        const updates = useProfileUpdates(auth, users, action, options.onUpdated);
        const workflowForm = useWorkflowForm({ ...options, initialValues: profileInitialValues(user, options) }, action, {
            operation: "updateProfile",
            minimum: looseObject({}),
            syncDefaults: true,
            blocked: !user || updates.pending !== undefined,
            disabledReason: updates.pending ? { code: "recovery" } : null,
            write: (values, transaction) => updates.write("updateProfile", values, transaction),
            complete: (completion, transaction) => updates.complete(completion, transaction),
        });
        const form = preserveRecoveryReset({ ...workflowForm, feedback: updates.feedback }, updates.pending !== undefined);
        const state = preserveRecoveryReset({ ...getActionState(action), feedback: updates.feedback }, updates.pending !== undefined);
        return {
            ...state,
            user,
            isLoading: source.isPending,
            queryError: source.error,
            form: user ? form : null,
            actions: {
                update: profileAction(action, updates, "updateProfile", (values) => values),
                updateImage: profileAction(action, updates, "updateProfileImage", (image) => ({
                    image,
                })),
            },
        };
    }
    function useEmailChangeForm(options) {
        const action = useWorkflowAction(runtime, "email-change", options.enabled !== false, options);
        return useWorkflowForm(options, action, {
            operation: "changeEmail",
            minimum: emailMinimum,
            syncDefaults: true,
            write: async (values, transaction) => {
                await transaction.write(() => auth.changeEmail({ ...values, callbackURL: options.callbackURL }, { throw: true, retry: 0 }));
                return { outcome: "confirmationRequired", email: textValue(values.newEmail) };
            },
            complete: async (completion, transaction) => {
                await transaction.complete(() => options.onRequested?.(completion));
                return completion;
            },
        });
    }
    function usePasswordChangeForm(options) {
        const action = useWorkflowAction(runtime, "password-change", options.enabled !== false, options);
        return useWorkflowForm(options, action, {
            operation: "changePassword",
            minimum: passwordMinimum,
            secretFields,
            write: async (values, transaction) => {
                await transaction.write(() => auth.changePassword({ ...values, revokeOtherSessions: options.revokeOtherSessions }, { throw: true, retry: 0 }));
                return { outcome: "changed" };
            },
            complete: async (completion, transaction) => {
                await transaction.complete(() => options.onChanged?.(completion));
                return completion;
            },
        });
    }
    function useReauthenticationForm(options = { initialValues: { password: "" } }) {
        const source = useUser();
        const scope = "reauthentication";
        const action = useIdentityAction(runtime, scope, "authenticated", options.enabled !== false && !!source.data, options, { onRetire: () => reauthenticationReceipts.delete(scope) });
        const receipt = reauthenticationReceipts.get(scope);
        const finish = async (transaction) => {
            const current = reauthenticationReceipts.get(scope);
            requireAvailable(current);
            if (current.stage === "synchronization") {
                await synchronizeAuthenticated(runtime, transaction, current.expected, {
                    token: current.displacedToken,
                });
                if (runtime.authObservation.userId !== current.originalUserId)
                    throw new Error("Reauthentication changed the authenticated user");
                const { userId, sessionId } = runtime.authObservation;
                requireAvailable(userId && sessionId);
                current.userId = userId;
                current.sessionId = sessionId;
                current.stage = "cleanup";
            }
            if (current.displacedToken &&
                current.displacedToken !== runtime.authObservation.sessionToken) {
                transaction.phase("cleanup");
                await auth.revokeSession({ token: current.displacedToken }, { throw: true, retry: 0 });
            }
            requireAvailable(current.userId && current.sessionId);
            const completion = {
                outcome: "reauthenticated",
                userId: current.userId,
                sessionId: current.sessionId,
            };
            reauthenticationReceipts.delete(scope);
            await transaction.complete(() => options.onReauthenticated?.(completion));
            return completion;
        };
        const recovery = {
            ...action.control({ operation: "reauthenticate" }),
            run: () => action.run({ operation: "reauthenticate" }, finish, true),
        };
        const form = useWorkflowForm({
            ...options,
            initialValues: options.initialValues ?? { password: "" },
        }, action, {
            operation: "reauthenticate",
            minimum: reauthenticationMinimum,
            secretFields,
            blocked: receipt !== undefined,
            disabledReason: receipt !== undefined ? { code: "recovery" } : null,
            write: async (values, transaction) => {
                const user = users.current.data;
                requireAvailable(user);
                const originalUserId = users.current.identity;
                const displacedToken = runtime.authObservation.sessionToken;
                const result = await transaction.write(() => auth.signIn.email({ email: user.email, password: values.password }, { throw: true, retry: 0 }));
                requireAvailable(originalUserId);
                const expected = resultIdentity(result);
                reauthenticationReceipts.set(scope, {
                    displacedToken,
                    expected: { userId: originalUserId, token: expected.token },
                    originalUserId,
                    stage: "synchronization",
                });
                return finish(transaction);
            },
        });
        const error = action.error;
        const recoveries = receipt !== undefined && error?.writeSucceeded
            ? [
                {
                    target: { operation: "reauthenticate" },
                    error: error.cause,
                    diagnostics: error,
                    recovery,
                },
            ]
            : [];
        return preserveRecoveryReset({ ...form, feedback: action.feedback(recoveries) }, receipt !== undefined);
    }
    const profile = defineWorkflow(useProfileSettings);
    const email = defineWorkflow(useEmailChangeForm);
    const password = defineWorkflow(usePasswordChangeForm);
    const reauthentication = defineWorkflow(useReauthenticationForm);
    return {
        ...exposeWorkflow("ProfileSettings", profile, (schema) => defineSchemaWorkflow(useProfileSettings, schema)),
        ...exposeWorkflow("EmailChangeForm", email, (schema) => defineSchemaWorkflow(useEmailChangeForm, schema)),
        ...exposeWorkflow("PasswordChangeForm", password, (schema) => defineSchemaWorkflow(usePasswordChangeForm, schema)),
        ...exposeWorkflow("ReauthenticationForm", reauthentication, (schema) => defineSchemaWorkflow(useReauthenticationForm, schema)),
    };
}
//# sourceMappingURL=workflows.js.map