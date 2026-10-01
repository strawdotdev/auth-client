import { looseObject, string } from "zod";
import { getActionState, getAuthErrorCode, requireAvailable, } from "../shared/action.js";
import { useWorkflowForm } from "../shared/form.js";
import { useIdentityAction } from "../shared/identity-action.js";
import { identityOperationObsolete, resultIdentity, synchronizeAuthenticated, textValue, } from "../shared/identity-sync.js";
import { defineSchemaWorkflow, defineWorkflow, exposeWorkflow } from "../shared/root.js";
import { guestSession } from "./guest.js";
const required = string().refine((value) => Boolean(value.trim()), "Required");
const signInMinimum = looseObject({ email: required, password: required });
const signUpMinimum = looseObject({
    email: required,
    name: required,
    password: required,
});
const emailMinimum = looseObject({ email: required });
const resetMinimum = looseObject({ newPassword: required });
const secretFields = ["password", "confirmPassword", "currentPassword", "newPassword"];
async function synchronizeSignedOut(runtime, transaction, original, guests) {
    transaction.phase("synchronization");
    await runtime.refreshSession();
    // With guests, the new guest is the expected identity; any other account is unrelated.
    const isNewGuest = (state) => guests && state.isAnonymous && state.userId !== original.userId;
    await runtime.waitForAuth((state) => guests
        ? state.ready && isNewGuest(state)
        : !state.sessionPending &&
            !state.userId &&
            !state.convexLoading &&
            !state.convexAuthenticated, transaction.signal, 10_000, (state) => state.userId &&
        !isNewGuest(state) &&
        (state.userId !== original.userId || state.sessionId !== original.sessionId)
        ? identityOperationObsolete
        : undefined);
}
function recoveryFeedback(action, target, recovery, hasReceipt) {
    const error = action.error;
    return hasReceipt && error?.writeSucceeded
        ? [{ target, error: error.cause, diagnostics: error, recovery }]
        : [];
}
function preserveRecoveryReset(state, pending) {
    return pending ? { ...state, reset() { } } : state;
}
function withRecoveryFeedback(state, action, target, recovery, hasReceipt) {
    return preserveRecoveryReset({
        ...state,
        feedback: action.feedback(recoveryFeedback(action, target, recovery, hasReceipt)),
    }, hasReceipt);
}
function recoveryAction(action, target, finish) {
    return {
        ...action.control(target),
        run: () => action.run(target, finish, true),
    };
}
function observedIdentity(runtime) {
    const { userId, sessionId, isAnonymous } = runtime.authObservation;
    return { userId, sessionId, isAnonymous };
}
/** A guest signing in or up is linked to the account (Better Auth's anonymous plugin). */
function departingGuest(runtime) {
    const { userId, isAnonymous } = runtime.authObservation;
    return isAnonymous ? userId : undefined;
}
export function createAuthenticationWorkflows(auth, runtime) {
    const receipts = new Map();
    const call = (endpoint, values) => endpoint(values, { throw: true, retry: 0 });
    const guests = guestSession(runtime);
    const afterSignOut = guests ? "guest" : "synchronization";
    async function leaveSession(receipt, transaction) {
        if (guests && receipt.stage === "guest") {
            transaction.phase("cleanup");
            const { userId, isAnonymous } = runtime.authObservation;
            // The provider may already have made the signed-out visitor a guest.
            if (!isAnonymous || userId === receipt.original.userId)
                await guests.ensure();
            receipt.stage = "synchronization";
        }
        await synchronizeSignedOut(runtime, transaction, receipt.original, guests !== undefined);
    }
    function useReceiptAction(scope, availability, options) {
        const action = useIdentityAction(runtime, scope, availability, options.enabled !== false, options, { onRetire: () => receipts.delete(scope) });
        return { action, receipt: receipts.get(scope) };
    }
    async function finishAuthentication(scope, kind, options, transaction) {
        const receipt = receipts.get(scope);
        requireAvailable(receipt?.kind === kind);
        const { guestUserId } = receipt;
        const identity = await synchronizeAuthenticated(runtime, transaction, receipt.expected, {
            userId: guestUserId,
        });
        receipts.delete(scope);
        const completion = {
            outcome: "authenticated",
            ...identity,
            ...(guestUserId && guestUserId !== identity.userId ? { guestUserId } : {}),
        };
        await transaction.complete(() => options.onAuthenticated?.(completion));
        return completion;
    }
    function useAuthenticationEntry(scope, kind, operation, options) {
        const { action, receipt } = useReceiptAction(scope, "guest", options);
        const finish = (transaction) => finishAuthentication(scope, kind, options, transaction);
        const target = { operation };
        const recovery = recoveryAction(action, target, finish);
        return { action, finish, hasReceipt: receipt !== undefined, recovery, target };
    }
    function useSignInForm(options) {
        const entry = useAuthenticationEntry("sign-in", "signIn", "signIn", options);
        const { action, finish, hasReceipt, recovery, target } = entry;
        const form = useWorkflowForm(options, action, {
            operation: "signIn",
            minimum: signInMinimum,
            secretFields,
            blocked: hasReceipt,
            disabledReason: hasReceipt ? { code: "recovery" } : null,
            write: async (values, transaction) => {
                try {
                    const guestUserId = departingGuest(runtime);
                    const result = await transaction.write(() => call(auth.signIn.email, values));
                    receipts.set("sign-in", {
                        kind: "signIn",
                        expected: resultIdentity(result),
                        guestUserId,
                    });
                    return finish(transaction);
                }
                catch (cause) {
                    if (getAuthErrorCode(cause) !== "EMAIL_NOT_VERIFIED")
                        throw cause;
                    const completion = {
                        outcome: "verificationRequired",
                        email: textValue(values.email),
                    };
                    await transaction.complete(() => options.onVerificationRequired?.(completion));
                    return completion;
                }
            },
        });
        return withRecoveryFeedback(form, action, target, recovery, hasReceipt);
    }
    function useSignUpForm(options) {
        const entry = useAuthenticationEntry("sign-up", "signUp", "signUp", options);
        const { action, finish, hasReceipt, recovery, target } = entry;
        const form = useWorkflowForm(options, action, {
            operation: "signUp",
            minimum: signUpMinimum,
            secretFields,
            blocked: hasReceipt,
            disabledReason: hasReceipt ? { code: "recovery" } : null,
            write: async (values, transaction) => {
                const callbackURL = textValue(options.callbackURL) || undefined;
                const guestUserId = departingGuest(runtime);
                const result = await transaction.write(() => call(auth.signUp.email, {
                    ...values,
                    ...(callbackURL ? { callbackURL } : {}),
                }));
                const expected = resultIdentity(result);
                if (expected.token) {
                    receipts.set("sign-up", { kind: "signUp", expected, guestUserId });
                    return finish(transaction);
                }
                const completion = {
                    outcome: "verificationRequired",
                    email: textValue(values.email),
                };
                await transaction.complete(() => options.onVerificationRequired?.(completion));
                return completion;
            },
        });
        return withRecoveryFeedback(form, action, target, recovery, hasReceipt);
    }
    function usePasswordResetRequestForm(options) {
        return useEmailRequest("password-reset-request", "requestPasswordReset", auth.requestPasswordReset, "redirectTo", options);
    }
    function useEmailRequest(scope, operation, endpoint, callbackKey, options) {
        const action = useIdentityAction(runtime, scope, "settled", options.enabled !== false, options);
        return useWorkflowForm(options, action, {
            operation,
            minimum: emailMinimum,
            write: async (values, transaction) => {
                const callback = textValue(options[callbackKey]) || undefined;
                await transaction.write(() => call(endpoint, {
                    ...values,
                    ...(callback ? { [callbackKey]: callback } : {}),
                }));
                const completion = { outcome: "requested", email: textValue(values.email) };
                await transaction.complete(() => options.onRequested?.(completion));
                return completion;
            },
        });
    }
    function usePasswordResetForm(options) {
        const scope = "password-reset";
        const { action, receipt } = useReceiptAction(scope, "settled", options);
        const finish = async (transaction) => {
            const current = receipts.get(scope);
            requireAvailable(current?.kind === "passwordReset");
            // A guest resetting an account's password keeps their own session.
            const signsOut = options.signOutAfterReset !== false && !current.original.isAnonymous;
            if (signsOut && current.stage === "signOut") {
                transaction.phase("cleanup");
                await call(auth.signOut, {});
                current.stage = afterSignOut;
            }
            if (signsOut)
                await leaveSession(current, transaction);
            receipts.delete(scope);
            const completion = { outcome: "reset" };
            await transaction.complete(() => options.onReset?.(completion));
            return completion;
        };
        const target = { operation: "resetPassword" };
        const recovery = recoveryAction(action, target, finish);
        const form = useWorkflowForm(options, action, {
            operation: "resetPassword",
            minimum: resetMinimum,
            secretFields,
            blocked: receipt !== undefined,
            disabledReason: receipt ? { code: "recovery" } : null,
            write: async (values, transaction) => {
                const original = observedIdentity(runtime);
                await transaction.write(() => call(auth.resetPassword, { ...values, token: options.token }));
                receipts.set(scope, { kind: "passwordReset", stage: "signOut", original });
                return finish(transaction);
            },
        });
        return withRecoveryFeedback(form, action, target, recovery, receipt !== undefined);
    }
    function useEmailVerification(options) {
        return useEmailRequest("email-verification", "sendVerificationEmail", auth.sendVerificationEmail, "callbackURL", options);
    }
    function useSignOut(options = { initialValues: {} }) {
        const scope = "sign-out";
        const { action, receipt } = useReceiptAction(scope, "session", options);
        const finish = async (transaction) => {
            const current = receipts.get(scope);
            requireAvailable(current?.kind === "signOut");
            await leaveSession(current, transaction);
            receipts.delete(scope);
            const completion = { outcome: "signedOut" };
            await transaction.complete(() => options.onSignedOut?.(completion));
            return completion;
        };
        const target = { operation: "signOut" };
        const recovery = recoveryAction(action, target, finish);
        const state = {
            ...getActionState(action),
            actions: {
                signOut: {
                    ...action.control(target, receipt ? { code: "recovery" } : null),
                    run: () => receipt
                        ? Promise.resolve({ status: "ignored", reason: "disabled" })
                        : action.run(target, async (transaction) => {
                            const original = observedIdentity(runtime);
                            await transaction.write(() => call(auth.signOut, {}));
                            receipts.set(scope, { kind: "signOut", stage: afterSignOut, original });
                            return finish(transaction);
                        }),
                },
            },
        };
        return withRecoveryFeedback(state, action, target, recovery, receipt !== undefined);
    }
    const signIn = defineWorkflow(useSignInForm);
    const signUp = defineWorkflow(useSignUpForm);
    const requestReset = defineWorkflow(usePasswordResetRequestForm);
    const reset = defineWorkflow(usePasswordResetForm);
    const verification = defineWorkflow(useEmailVerification);
    const signOut = defineWorkflow(useSignOut);
    return {
        ...exposeWorkflow("SignInForm", signIn, (schema) => defineSchemaWorkflow(useSignInForm, schema)),
        ...exposeWorkflow("SignUpForm", signUp, (schema) => defineSchemaWorkflow(useSignUpForm, schema)),
        ...exposeWorkflow("PasswordResetRequestForm", requestReset, (schema) => defineSchemaWorkflow(usePasswordResetRequestForm, schema)),
        ...exposeWorkflow("PasswordResetForm", reset, (schema) => defineSchemaWorkflow(usePasswordResetForm, schema)),
        ...exposeWorkflow("EmailVerification", verification, (schema) => defineSchemaWorkflow(useEmailVerification, schema)),
        ...exposeWorkflow("SignOut", signOut),
    };
}
//# sourceMappingURL=workflows.js.map