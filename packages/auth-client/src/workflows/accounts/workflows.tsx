import type { CacheRuntime } from "../../cache/query-cache.js";
import type { AccountsClient, GuestClient, Result } from "../../client/types.js";
import {
  asRecord,
  asRecords,
  getActionState,
  requireAvailable,
  useCommittedRef,
  type ActionExecution,
  type Values,
} from "../shared/action.js";
import {
  recoveryAction,
  useIdentityAction,
  withRecoveryFeedback,
} from "../shared/identity-action.js";
import {
  resultIdentity,
  synchronizeAuthenticated,
  type ExpectedIdentity,
} from "../shared/identity-sync.js";
import { defineWorkflow } from "../shared/root.js";
import type { WorkflowFeedbackOptions, WorkflowPendingAction } from "../shared/types.js";
import {
  leaveSession,
  observedIdentity,
  signOutContext,
  type LeaveStage,
  type ObservedIdentity,
} from "../authentication/workflows.js";
import { guestSession } from "../authentication/guest.js";

type Write = (body: Values, options: { throw: true; retry: 0 }) => Promise<unknown>;
type Callback<T> = ((value: T) => void | Promise<void>) | undefined;
type Options = WorkflowFeedbackOptions & {
  enabled?: boolean;
  onSwitched?: Callback<{ outcome: "switched"; userId: string; sessionId: string }>;
  onSignedOut?: Callback<{ outcome: "signedOut"; userId: string }>;
};
/** A written sign-out whose context has yet to settle on the identity it moves on to. */
type Receipt = {
  target: WorkflowPendingAction;
  stage: LeaveStage;
  original: ObservedIdentity;
  userId: string;
};
export type AccountsReads = {
  useDeviceAccounts(query?: undefined, options?: { enabled?: boolean }): Result<unknown>;
};

const call = (endpoint: unknown, values: Values) =>
  (endpoint as Write)(values, { throw: true, retry: 0 });

export function createAccountsWorkflows(
  auth: AccountsClient,
  runtime: CacheRuntime,
  reads: AccountsReads,
) {
  const scope = "accounts";
  const receipts = new Map<string, Receipt>();
  const guests = guestSession(runtime) !== undefined;
  const afterSignOut: LeaveStage = guests ? "guest" : "synchronization";

  function useAccounts(options: Options = {}) {
    const query = reads.useDeviceAccounts(undefined, { enabled: options.enabled });
    const session = runtime.auth.useSession();
    const action = useIdentityAction(
      runtime,
      scope,
      "settled",
      options.enabled !== false,
      options,
      {
        onRetire: () => receipts.delete(scope),
      },
    );
    const receipt = receipts.get(scope);
    const latest = useCommittedRef({ query, options });
    const guestOf = (rows: unknown) => {
      const user = asRecords(rows)
        .map((entry) => asRecord(entry.user))
        .find((entry) => entry?.isAnonymous === true);
      return typeof user?.id === "string" ? user.id : undefined;
    };
    const tokenOf = (userId: string, rows: unknown) => {
      const row = asRecords(rows).find((entry) => asRecord(entry.user)?.id === userId);
      const token = asRecord(row?.session)?.token;
      return typeof token === "string" ? token : undefined;
    };

    async function finishSignOut(transaction: ActionExecution) {
      const current = receipts.get(scope);
      requireAvailable(current);
      await leaveSession(runtime, current, transaction);
      receipts.delete(scope);
      const completion = { outcome: "signedOut" as const, userId: current.userId };
      await transaction.complete(() => latest.current.options.onSignedOut?.(completion));
      return completion;
    }

    /** Makes this context the identity `write` chose or created, once its session is observed. */
    async function becomeIdentity(
      transaction: ActionExecution,
      write: () => Promise<ExpectedIdentity>,
    ) {
      const { userId: previous, sessionToken } = runtime.authObservation;
      const identity = await synchronizeAuthenticated(runtime, transaction, await write(), {
        userId: previous,
        token: sessionToken,
      });
      const completion = { outcome: "switched" as const, ...identity };
      await transaction.complete(() => latest.current.options.onSwitched?.(completion));
      return completion;
    }

    /** Chooses a listed account; choosing is local to this context, nothing is written. */
    const select = (transaction: ActionExecution, userId: string) => {
      const token = tokenOf(userId, latest.current.query.data);
      requireAvailable(token);
      return becomeIdentity(transaction, async () => {
        await transaction.write(async () => auth.deviceAccounts.select(token));
        return { userId, token };
      });
    };

    function switchTo(userId: string) {
      return action.run({ operation: "switchAccount" }, (transaction) =>
        select(transaction, userId),
      );
    }

    /** The device's guest, if it keeps one; else a new guest beside the device's accounts. */
    function switchToGuest() {
      return action.run({ operation: "signInAsGuest" }, (transaction) => {
        const guest = guestOf(latest.current.query.data);
        if (guest) return select(transaction, guest);
        return becomeIdentity(transaction, async () =>
          resultIdentity(
            await transaction.write(() =>
              call((auth as unknown as GuestClient).signIn.anonymous, {}),
            ),
          ),
        );
      });
    }

    function signOut(userId: string) {
      const target = { operation: "signOutAccount" as const };
      return action.run(target, async (transaction) => {
        const token = tokenOf(userId, latest.current.query.data);
        requireAvailable(token);
        if (userId !== runtime.authObservation.userId) {
          // Another account: this context stays as it is.
          await transaction.write(() => call(auth.multiSession.revoke, { sessionToken: token }));
          transaction.phase("synchronization");
          await latest.current.query.refetch();
          const completion = { outcome: "signedOut" as const, userId };
          await transaction.complete(() => latest.current.options.onSignedOut?.(completion));
          return completion;
        }
        const original = observedIdentity(runtime);
        await transaction.write(() => signOutContext(auth, runtime));
        receipts.set(scope, { target, stage: afterSignOut, original, userId });
        return finishSignOut(transaction);
      });
    }

    function signOutAll() {
      const target = { operation: "signOut" as const };
      return action.run(target, async (transaction) => {
        const original = observedIdentity(runtime);
        requireAvailable(original.userId);
        await transaction.write(() => call(auth.signOut, {}));
        auth.deviceAccounts.select(null);
        receipts.set(scope, { target, stage: afterSignOut, original, userId: original.userId });
        return finishSignOut(transaction);
      });
    }

    const listed = (userId: string) => tokenOf(userId, query.data) !== undefined;
    const currentUserId = session.data?.user.id;
    const recoveryTarget = receipt?.target ?? { operation: "signOutAccount" as const };
    const state = {
      ...(({ error: queryError, isPending: isLoading, ...read }) => ({
        ...read,
        isLoading,
        queryError,
      }))(query),
      ...getActionState(action),
      currentUserId,
      account: (userId: string) => {
        const blocked = receipt ? { code: "recovery" as const } : null;
        return {
          switch: {
            ...action.control(
              { operation: "switchAccount" },
              blocked ??
                (!listed(userId) || userId === currentUserId ? { code: "unavailable" } : null),
            ),
            run: () => switchTo(userId),
          },
          signOut: {
            ...action.control(
              { operation: "signOutAccount" },
              blocked ?? (listed(userId) ? null : { code: "unavailable" }),
            ),
            run: () => signOut(userId),
          },
        };
      },
      actions: {
        signOutAll: {
          ...action.control(
            { operation: "signOut" },
            receipt ? { code: "recovery" } : currentUserId ? null : { code: "unavailable" },
          ),
          run: () => signOutAll(),
        },
        ...(guests && {
          switchToGuest: {
            ...action.control(
              { operation: "signInAsGuest" },
              receipt
                ? { code: "recovery" }
                : !currentUserId || runtime.authObservation.isAnonymous || !query.data
                  ? { code: "unavailable" }
                  : null,
            ),
            run: () => switchToGuest(),
          },
        }),
      },
    };
    return withRecoveryFeedback(
      state,
      action,
      recoveryTarget,
      recoveryAction(action, recoveryTarget, finishSignOut),
      receipt !== undefined,
    );
  }

  const accounts = defineWorkflow(useAccounts);
  return {
    useAccounts,
    Accounts: accounts.Root,
    useAccountsContext: accounts.useWorkflowContext,
  };
}
