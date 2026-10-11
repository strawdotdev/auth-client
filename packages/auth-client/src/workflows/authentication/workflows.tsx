import { useEffect } from "react";
import { looseObject, string, type ZodType } from "zod";
import type { CacheRuntime } from "../../cache/query-cache.js";
import type { AccountsClient, AuthenticationClient, PasskeyClient } from "../../client/types.js";
import {
  asRecord,
  asRecords,
  getActionState,
  getAuthErrorCode,
  requireAvailable,
  useCommittedRef,
  type ActionExecution,
  type Values,
} from "../shared/action.js";
import { useWorkflowForm, type FormOptions } from "../shared/form.js";
import {
  recoveryAction,
  useIdentityAction,
  withRecoveryFeedback,
} from "../shared/identity-action.js";
import {
  identityOperationObsolete,
  resultIdentity,
  synchronizeAuthenticated,
  textValue,
  type ExpectedIdentity,
} from "../shared/identity-sync.js";
import { defineSchemaWorkflow, defineWorkflow, exposeWorkflow } from "../shared/root.js";
import { guestSession } from "./guest.js";

type Write = (body: Values, options: { throw: true; retry: 0 }) => Promise<unknown>;
type Options = FormOptions & Record<string, unknown>;
export type ObservedIdentity = { userId?: string; sessionId?: string; isAnonymous: boolean };
/** With guests, a signed-out visitor becomes a guest again before synchronization. */
export type LeaveStage = "guest" | "synchronization";
type AuthReceipt =
  | {
      kind: "signIn" | "signUp";
      expected: ExpectedIdentity;
      /** The identity being left: a guest (linked) or, with accounts, the account added beside. */
      previous: ExpectedIdentity;
      guestUserId?: string;
    }
  | { kind: "signOut"; stage: LeaveStage; original: ObservedIdentity }
  | { kind: "passwordReset"; stage: "signOut" | LeaveStage; original: ObservedIdentity };

const required = string().refine((value) => Boolean(value.trim()), "Required");
const signInMinimum: ZodType<Values, Values> = looseObject({ email: required, password: required });
const signUpMinimum: ZodType<Values, Values> = looseObject({
  email: required,
  name: required,
  password: required,
});
const emailMinimum: ZodType<Values, Values> = looseObject({ email: required });
const resetMinimum: ZodType<Values, Values> = looseObject({ newPassword: required });
const secretFields = ["password", "confirmPassword", "currentPassword", "newPassword"];
export async function synchronizeSignedOut(
  runtime: CacheRuntime,
  transaction: ActionExecution,
  original: ObservedIdentity,
  guests: boolean,
) {
  transaction.phase("synchronization");
  await runtime.refreshSession();
  // With guests, the new guest is the expected identity; with accounts, so is any other account
  // the device keeps (the context moves on to it). Otherwise any other account is unrelated.
  const isNewGuest = (state: ObservedIdentity) =>
    guests && state.isAnonymous && state.userId !== original.userId;
  const isOtherAccount = (state: ObservedIdentity) =>
    Boolean(runtime.features.accounts && state.userId && state.userId !== original.userId);
  await runtime.waitForAuth(
    (state) =>
      isOtherAccount(state)
        ? state.ready
        : guests
          ? state.ready && isNewGuest(state)
          : !state.sessionPending &&
            !state.userId &&
            !state.convexLoading &&
            !state.convexAuthenticated,
    transaction.signal,
    10_000,
    (state) =>
      state.userId &&
      !isNewGuest(state) &&
      !isOtherAccount(state) &&
      (state.userId !== original.userId || state.sessionId !== original.sessionId)
        ? identityOperationObsolete
        : undefined,
  );
}

/**
 * Signs this context out of its own account. With accounts, that is the one account (the
 * multi-session plugin revokes it; the others stay signed in and the context moves on to the
 * device's next one); otherwise Better Auth's sign-out.
 */
export async function signOutContext(auth: AuthenticationClient, runtime: CacheRuntime) {
  if (!runtime.features.accounts) return call(auth.signOut as Write, {});
  const accounts = auth as AccountsClient;
  const { sessionToken, userId } = runtime.authObservation;
  requireAvailable(sessionToken);
  // The context moves on before its account goes, so nothing it shows (its Convex queries) runs
  // as a signed-out account for a moment; an account (rather than a guest) where there is one.
  const others = asRecords(responseValue(await call(accounts.deviceAccounts.list as Write, {})))
    .filter((entry) => asRecord(entry.user)?.id !== userId)
    .sort(
      (a, b) => Number(!asRecord(b.user)?.isAnonymous) - Number(!asRecord(a.user)?.isAnonymous),
    );
  const next = asRecord(others[0]?.session)?.token;
  // The last account: Better Auth's sign-out, which leaves the device without one.
  if (typeof next !== "string") return call(auth.signOut as Write, {});
  accounts.deviceAccounts.select(next);
  await runtime.refreshSession();
  await call(accounts.multiSession.revoke as Write, { sessionToken });
}
const responseValue = (result: unknown) => {
  const row = asRecord(result);
  return row && "data" in row ? row.data : result;
};
const call = (endpoint: Write, values: Values) => endpoint(values, { throw: true, retry: 0 });
/**
 * Leaves the context's account after its sign-out was written: with guests, a fresh guest unless
 * the context moved on to another of the device's accounts; then waits for the identity it lands on.
 */
export async function leaveSession(
  runtime: CacheRuntime,
  receipt: { stage: "signOut" | LeaveStage; original: ObservedIdentity },
  transaction: ActionExecution,
) {
  const guests = guestSession(runtime);
  if (guests && receipt.stage === "guest") {
    transaction.phase("cleanup");
    if (runtime.features.accounts) await runtime.refreshSession();
    const { userId, isAnonymous } = runtime.authObservation;
    const onAnother = runtime.features.accounts && userId && userId !== receipt.original.userId;
    // The provider may already have made the signed-out visitor a guest.
    if (!onAnother && (!isAnonymous || userId === receipt.original.userId)) await guests.ensure();
    receipt.stage = "synchronization";
  }
  await synchronizeSignedOut(runtime, transaction, receipt.original, guests !== undefined);
}

export function observedIdentity(runtime: CacheRuntime): ObservedIdentity {
  const { userId, sessionId, isAnonymous } = runtime.authObservation;
  return { userId, sessionId, isAnonymous };
}

/** A guest signing in or up is linked to the account (Better Auth's anonymous plugin). */
function departingGuest(runtime: CacheRuntime) {
  const { userId, isAnonymous } = runtime.authObservation;
  return isAnonymous ? userId : undefined;
}

/** The identity a sign-in or sign-up leaves: a guest's, or with accounts the account beside it. */
function departingIdentity(runtime: CacheRuntime): ExpectedIdentity {
  const { userId, sessionToken } = runtime.authObservation;
  return { userId, token: sessionToken };
}

export function createAuthenticationWorkflows(auth: AuthenticationClient, runtime: CacheRuntime) {
  const receipts = new Map<string, AuthReceipt>();
  const passkeys = auth as PasskeyClient;
  const guests = guestSession(runtime);
  const afterSignOut: LeaveStage = guests ? "guest" : "synchronization";
  function useReceiptAction(
    scope: string,
    availability: "guest" | "authenticated" | "session" | "settled",
    options: Options,
  ) {
    const action = useIdentityAction(
      runtime,
      scope,
      availability,
      options.enabled !== false,
      options,
      { onRetire: () => receipts.delete(scope) },
    );
    return { action, receipt: receipts.get(scope) };
  }
  async function finishAuthentication(
    scope: string,
    kind: "signIn" | "signUp",
    options: Options,
    transaction: ActionExecution,
  ) {
    const receipt = receipts.get(scope);
    requireAvailable(receipt?.kind === kind);
    const { guestUserId } = receipt;
    const identity = await synchronizeAuthenticated(
      runtime,
      transaction,
      receipt.expected,
      receipt.previous,
    );
    receipts.delete(scope);
    const completion = {
      outcome: "authenticated" as const,
      ...identity,
      ...(guestUserId && guestUserId !== identity.userId ? { guestUserId } : {}),
    };
    await transaction.complete(() =>
      (options.onAuthenticated as ((value: unknown) => void | Promise<void>) | undefined)?.(
        completion,
      ),
    );
    return completion;
  }

  function useAuthenticationEntry(
    scope: "sign-in" | "sign-up" | "passkey-sign-in",
    kind: "signIn" | "signUp",
    operation: "signIn" | "signUp" | "signInWithPasskey",
    options: Options,
  ) {
    const { action, receipt } = useReceiptAction(scope, "guest", options);
    const finish = (transaction: ActionExecution) =>
      finishAuthentication(scope, kind, options, transaction);
    const target = { operation };
    const recovery = recoveryAction(action, target, finish);
    return { action, finish, hasReceipt: receipt !== undefined, recovery, target };
  }

  function useSignInForm(options: Options) {
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
          const previous = departingIdentity(runtime);
          const result = await transaction.write(() => call(auth.signIn.email as Write, values));
          receipts.set("sign-in", {
            kind: "signIn",
            expected: resultIdentity(result),
            previous,
            guestUserId,
          });
          return finish(transaction);
        } catch (cause) {
          if (getAuthErrorCode(cause) !== "EMAIL_NOT_VERIFIED") throw cause;
          const completion = {
            outcome: "verificationRequired" as const,
            email: textValue(values.email),
          };
          await transaction.complete(() =>
            (
              options.onVerificationRequired as
                | ((value: unknown) => void | Promise<void>)
                | undefined
            )?.(completion),
          );
          return completion;
        }
      },
    });
    return withRecoveryFeedback(form, action, target, recovery, hasReceipt);
  }

  /**
   * Signs in with a passkey: by `actions.signIn` (the browser asks for one), or with `autoFill`
   * from the browser's suggestions on a field marked `autocomplete="username webauthn"`, rendered
   * before this hook's effects run. The autofill ceremony waits outside the workflow until a
   * passkey is chosen, so it holds nothing; either way the sign-in finishes as a password's does.
   * A cancelled ceremony completes as `cancelled`, without an error.
   */
  function usePasskeySignIn(options: Options = { initialValues: {} }) {
    const entry = useAuthenticationEntry("passkey-sign-in", "signIn", "signInWithPasskey", options);
    const { action, finish, hasReceipt, recovery, target } = entry;
    const signIn = async (
      transaction: ActionExecution,
      ceremony: () => Promise<unknown>,
      departing = { guestUserId: departingGuest(runtime), previous: departingIdentity(runtime) },
    ) => {
      let result: unknown;
      try {
        result = await transaction.write(ceremony);
      } catch (cause) {
        if (!passkeyCancelled(cause)) throw cause;
        return { outcome: "cancelled" as const };
      }
      receipts.set("passkey-sign-in", {
        kind: "signIn",
        expected: resultIdentity(result),
        ...departing,
      });
      return finish(transaction);
    };
    const autoFill = options.autoFill === true && action.available && !hasReceipt;
    const latest = useCommittedRef({ action, target, signIn });
    useEffect(() => {
      if (!autoFill) return;
      let live = true;
      const departing = {
        guestUserId: departingGuest(runtime),
        previous: departingIdentity(runtime),
      };
      // Waits for a choice; another ceremony (the button's) aborts it, and it ends unanswered.
      passkeyCeremony(passkeys, { autoFill: true }).then(
        (result) => {
          const { action, target, signIn } = latest.current;
          if (live)
            void action.run(target, (transaction) =>
              signIn(transaction, async () => result, departing),
            );
        },
        () => {},
      );
      return () => {
        live = false;
      };
    }, [autoFill, latest]);
    const state = {
      ...getActionState(action),
      actions: {
        signIn: {
          ...action.control(target, hasReceipt ? { code: "recovery" } : null),
          run: () =>
            hasReceipt
              ? Promise.resolve({ status: "ignored" as const, reason: "disabled" as const })
              : action.run(target, (transaction) =>
                  signIn(transaction, () => passkeyCeremony(passkeys, {})),
                ),
        },
      },
    };
    return withRecoveryFeedback(state, action, target, recovery, hasReceipt);
  }

  function useSignUpForm(options: Options) {
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
        const previous = departingIdentity(runtime);
        const result = await transaction.write(() =>
          call(auth.signUp.email as Write, {
            ...values,
            ...(callbackURL ? { callbackURL } : {}),
          }),
        );
        const expected = resultIdentity(result);
        if (expected.token) {
          receipts.set("sign-up", { kind: "signUp", expected, previous, guestUserId });
          return finish(transaction);
        }
        const completion = {
          outcome: "verificationRequired" as const,
          email: textValue(values.email),
        };
        await transaction.complete(() =>
          (
            options.onVerificationRequired as ((value: unknown) => void | Promise<void>) | undefined
          )?.(completion),
        );
        return completion;
      },
    });
    return withRecoveryFeedback(form, action, target, recovery, hasReceipt);
  }

  function usePasswordResetRequestForm(options: Options) {
    return useEmailRequest(
      "password-reset-request",
      "requestPasswordReset",
      auth.requestPasswordReset as Write,
      "redirectTo",
      options,
    );
  }

  function useEmailRequest(
    scope: string,
    operation: "requestPasswordReset" | "sendVerificationEmail",
    endpoint: Write,
    callbackKey: "redirectTo" | "callbackURL",
    options: Options,
  ) {
    const action = useIdentityAction(runtime, scope, "settled", options.enabled !== false, options);
    return useWorkflowForm(options, action, {
      operation,
      minimum: emailMinimum,
      write: async (values, transaction) => {
        const callback = textValue(options[callbackKey]) || undefined;
        await transaction.write(() =>
          call(endpoint, {
            ...values,
            ...(callback ? { [callbackKey]: callback } : {}),
          }),
        );
        const completion = { outcome: "requested" as const, email: textValue(values.email) };
        await transaction.complete(() =>
          (options.onRequested as ((value: unknown) => void | Promise<void>) | undefined)?.(
            completion,
          ),
        );
        return completion;
      },
    });
  }

  function usePasswordResetForm(options: Options) {
    const scope = "password-reset";
    const { action, receipt } = useReceiptAction(scope, "settled", options);
    const finish = async (transaction: ActionExecution) => {
      const current = receipts.get(scope);
      requireAvailable(current?.kind === "passwordReset");
      // A guest resetting an account's password keeps their own session.
      const signsOut = options.signOutAfterReset !== false && !current.original.isAnonymous;
      if (signsOut && current.stage === "signOut") {
        transaction.phase("cleanup");
        await signOutContext(auth, runtime);
        current.stage = afterSignOut;
      }
      if (signsOut) await leaveSession(runtime, current, transaction);
      receipts.delete(scope);
      const completion = { outcome: "reset" as const };
      await transaction.complete(() =>
        (options.onReset as ((value: unknown) => void | Promise<void>) | undefined)?.(completion),
      );
      return completion;
    };
    const target = { operation: "resetPassword" as const };
    const recovery = recoveryAction(action, target, finish);
    const form = useWorkflowForm(options, action, {
      operation: "resetPassword",
      minimum: resetMinimum,
      secretFields,
      blocked: receipt !== undefined,
      disabledReason: receipt ? { code: "recovery" } : null,
      write: async (values, transaction) => {
        const original = observedIdentity(runtime);
        await transaction.write(() =>
          call(auth.resetPassword as Write, { ...values, token: options.token }),
        );
        receipts.set(scope, { kind: "passwordReset", stage: "signOut", original });
        return finish(transaction);
      },
    });
    return withRecoveryFeedback(form, action, target, recovery, receipt !== undefined);
  }

  function useEmailVerification(options: Options) {
    return useEmailRequest(
      "email-verification",
      "sendVerificationEmail",
      auth.sendVerificationEmail as Write,
      "callbackURL",
      options,
    );
  }

  function useSignOut(options: Options = { initialValues: {} }) {
    const scope = "sign-out";
    const { action, receipt } = useReceiptAction(scope, "session", options);
    const finish = async (transaction: ActionExecution) => {
      const current = receipts.get(scope);
      requireAvailable(current?.kind === "signOut");
      await leaveSession(runtime, current, transaction);
      receipts.delete(scope);
      const completion = { outcome: "signedOut" as const };
      await transaction.complete(() =>
        (options.onSignedOut as ((value: unknown) => void | Promise<void>) | undefined)?.(
          completion,
        ),
      );
      return completion;
    };
    const target = { operation: "signOut" as const };
    const recovery = recoveryAction(action, target, finish);
    const state = {
      ...getActionState(action),
      actions: {
        signOut: {
          ...action.control(target, receipt ? { code: "recovery" } : null),
          run: () =>
            receipt
              ? Promise.resolve({ status: "ignored" as const, reason: "disabled" as const })
              : action.run(target, async (transaction) => {
                  const original = observedIdentity(runtime);
                  await transaction.write(() => signOutContext(auth, runtime));
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
    ...exposeWorkflow("SignInForm", signIn, (schema: ZodType<Values, Values>) =>
      defineSchemaWorkflow(useSignInForm, schema),
    ),
    ...exposeWorkflow("SignUpForm", signUp, (schema: ZodType<Values, Values>) =>
      defineSchemaWorkflow(useSignUpForm, schema),
    ),
    ...exposeWorkflow("PasswordResetRequestForm", requestReset, (schema: ZodType<Values, Values>) =>
      defineSchemaWorkflow(usePasswordResetRequestForm, schema),
    ),
    ...exposeWorkflow("PasswordResetForm", reset, (schema: ZodType<Values, Values>) =>
      defineSchemaWorkflow(usePasswordResetForm, schema),
    ),
    ...exposeWorkflow("EmailVerification", verification, (schema: ZodType<Values, Values>) =>
      defineSchemaWorkflow(useEmailVerification, schema),
    ),
    ...exposeWorkflow("SignOut", signOut),
    ...(runtime.features.passkeys
      ? exposeWorkflow("PasskeySignIn", defineWorkflow(usePasskeySignIn))
      : {}),
  };
}

/**
 * Better Auth's passkey client answers its ceremony's failures (a cancelled prompt, an unknown
 * passkey) as `{ error }` rather than throwing; the workflow throws them as other writes do.
 */
async function passkeyCeremony(auth: PasskeyClient, body: { autoFill?: boolean }) {
  const result = await (auth.signIn.passkey as (body: unknown) => Promise<unknown>)(body);
  const error = asRecord(result)?.error;
  if (error) throw error;
  return result;
}

/**
 * The ceremony ended without a passkey: the person closed the browser's prompt or it timed out (a
 * `NotAllowedError`, passed through), another ceremony took its place, or the browser offers none.
 */
export function passkeyCancelled(cause: unknown) {
  const code = getAuthErrorCode(cause);
  return (
    code === "AUTH_CANCELLED" ||
    code === "ERROR_CEREMONY_ABORTED" ||
    code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"
  );
}
