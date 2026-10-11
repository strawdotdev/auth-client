import { asRecord, asRecords, getActionState, requireAvailable, useCommittedRef, } from "../shared/action.js";
import { recoveryAction, useIdentityAction, withRecoveryFeedback, } from "../shared/identity-action.js";
import { resultIdentity, synchronizeAuthenticated, } from "../shared/identity-sync.js";
import { defineWorkflow } from "../shared/root.js";
import { leaveSession, observedIdentity, signOutContext, } from "../authentication/workflows.js";
import { guestSession } from "../authentication/guest.js";
const call = (endpoint, values) => endpoint(values, { throw: true, retry: 0 });
export function createAccountsWorkflows(auth, runtime, reads) {
    const scope = "accounts";
    const receipts = new Map();
    const guests = guestSession(runtime) !== undefined;
    const afterSignOut = guests ? "guest" : "synchronization";
    // On demand, a visitor holds no session until they become a guest, so a signed-out context may.
    const onDemandGuests = runtime.features.guests === "on-demand";
    function useAccounts(options = {}) {
        const query = reads.useDeviceAccounts(undefined, { enabled: options.enabled });
        const session = runtime.auth.useSession();
        const action = useIdentityAction(runtime, scope, "settled", options.enabled !== false, options, {
            onRetire: () => receipts.delete(scope),
        });
        const receipt = receipts.get(scope);
        const latest = useCommittedRef({ query, options });
        const guestOf = (rows) => {
            const user = asRecords(rows)
                .map((entry) => asRecord(entry.user))
                .find((entry) => entry?.isAnonymous === true);
            return typeof user?.id === "string" ? user.id : undefined;
        };
        const tokenOf = (userId, rows) => {
            const row = asRecords(rows).find((entry) => asRecord(entry.user)?.id === userId);
            const token = asRecord(row?.session)?.token;
            return typeof token === "string" ? token : undefined;
        };
        async function finishSignOut(transaction) {
            const current = receipts.get(scope);
            requireAvailable(current);
            await leaveSession(runtime, current, transaction);
            receipts.delete(scope);
            const completion = { outcome: "signedOut", userId: current.userId };
            await transaction.complete(() => latest.current.options.onSignedOut?.(completion));
            return completion;
        }
        /** Makes this context the identity `write` chose or created, once its session is observed. */
        async function becomeIdentity(transaction, write) {
            const { userId: previous, sessionToken } = runtime.authObservation;
            const identity = await synchronizeAuthenticated(runtime, transaction, await write(), {
                userId: previous,
                token: sessionToken,
            });
            const completion = { outcome: "switched", ...identity };
            await transaction.complete(() => latest.current.options.onSwitched?.(completion));
            return completion;
        }
        /** Chooses a listed account; choosing is local to this context, nothing is written. */
        const select = (transaction, userId) => {
            const token = tokenOf(userId, latest.current.query.data);
            requireAvailable(token);
            return becomeIdentity(transaction, async () => {
                await transaction.write(async () => auth.deviceAccounts.select(token));
                return { userId, token };
            });
        };
        function switchTo(userId) {
            return action.run({ operation: "switchAccount" }, (transaction) => select(transaction, userId));
        }
        /** The device's guest, if it keeps one; else a new guest beside the device's accounts. */
        function switchToGuest() {
            return action.run({ operation: "signInAsGuest" }, (transaction) => {
                const guest = guestOf(latest.current.query.data);
                if (guest)
                    return select(transaction, guest);
                return becomeIdentity(transaction, async () => resultIdentity(await transaction.write(() => call(auth.signIn.anonymous, {}))));
            });
        }
        function signOut(userId) {
            const target = { operation: "signOutAccount" };
            return action.run(target, async (transaction) => {
                const token = tokenOf(userId, latest.current.query.data);
                requireAvailable(token);
                if (userId !== runtime.authObservation.userId) {
                    // Another account: this context stays as it is.
                    await transaction.write(() => call(auth.multiSession.revoke, { sessionToken: token }));
                    transaction.phase("synchronization");
                    await latest.current.query.refetch();
                    const completion = { outcome: "signedOut", userId };
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
            const target = { operation: "signOut" };
            return action.run(target, async (transaction) => {
                const original = observedIdentity(runtime);
                requireAvailable(original.userId);
                await transaction.write(() => call(auth.signOut, {}));
                auth.deviceAccounts.select(null);
                receipts.set(scope, { target, stage: afterSignOut, original, userId: original.userId });
                return finishSignOut(transaction);
            });
        }
        const listed = (userId) => tokenOf(userId, query.data) !== undefined;
        const currentUserId = session.data?.user.id;
        const recoveryTarget = receipt?.target ?? { operation: "signOutAccount" };
        const state = {
            ...(({ error: queryError, isPending: isLoading, ...read }) => ({
                ...read,
                isLoading,
                queryError,
            }))(query),
            ...getActionState(action),
            currentUserId,
            account: (userId) => {
                const blocked = receipt ? { code: "recovery" } : null;
                return {
                    switch: {
                        ...action.control({ operation: "switchAccount" }, blocked ??
                            (!listed(userId) || userId === currentUserId ? { code: "unavailable" } : null)),
                        run: () => switchTo(userId),
                    },
                    signOut: {
                        ...action.control({ operation: "signOutAccount" }, blocked ?? (listed(userId) ? null : { code: "unavailable" })),
                        run: () => signOut(userId),
                    },
                };
            },
            actions: {
                signOutAll: {
                    ...action.control({ operation: "signOut" }, receipt ? { code: "recovery" } : currentUserId ? null : { code: "unavailable" }),
                    run: () => signOutAll(),
                },
                ...((guests || onDemandGuests) && {
                    switchToGuest: {
                        ...action.control({ operation: "signInAsGuest" }, receipt
                            ? { code: "recovery" }
                            : runtime.authObservation.isAnonymous ||
                                // The device's guest is found among its accounts. A signed-out context lists
                                // none (the device holds no session), so on demand it makes a new guest.
                                (currentUserId ? !query.data : !onDemandGuests)
                                ? { code: "unavailable" }
                                : null),
                        run: () => switchToGuest(),
                    },
                }),
            },
        };
        return withRecoveryFeedback(state, action, recoveryTarget, recoveryAction(action, recoveryTarget, finishSignOut), receipt !== undefined);
    }
    const accounts = defineWorkflow(useAccounts);
    return {
        useAccounts,
        Accounts: accounts.Root,
        useAccountsContext: accounts.useWorkflowContext,
    };
}
//# sourceMappingURL=workflows.js.map