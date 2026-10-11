import { asRecord, requireAvailable } from "./action.js";
export const identityOperationObsolete = Symbol("identity operation obsolete");
const responseValue = (result) => {
    const row = asRecord(result);
    return row && "data" in row && row.data !== undefined ? row.data : result;
};
export function resultIdentity(result) {
    const row = asRecord(responseValue(result));
    const user = asRecord(row?.user);
    // Email sign-in answers with the token; a passkey's with the session.
    const token = row?.token ?? asRecord(row?.session)?.token;
    return {
        userId: typeof user?.id === "string" ? user.id : undefined,
        token: typeof token === "string" ? token : undefined,
    };
}
export const textValue = (value) => (typeof value === "string" ? value : "");
/**
 * Waits for the expected session. `previous` is the identity being left: its session may still be
 * observed for a moment (a guest signing in is linked, not replaced by an unrelated account).
 */
export async function synchronizeAuthenticated(runtime, transaction, expected, previous = {}) {
    transaction.phase("synchronization");
    await runtime.refreshSession();
    await runtime.waitForAuth((state) => state.ready &&
        (!expected.userId || state.userId === expected.userId) &&
        (!expected.token || state.sessionToken === expected.token), transaction.signal, 10_000, (state) => state.userId &&
        state.userId !== previous.userId &&
        ((expected.userId && state.userId !== expected.userId) ||
            (expected.token &&
                state.sessionToken &&
                state.sessionToken !== expected.token &&
                state.sessionToken !== previous.token))
        ? identityOperationObsolete
        : undefined);
    const { userId, sessionId } = runtime.authObservation;
    requireAvailable(userId && sessionId);
    return { userId, sessionId };
}
//# sourceMappingURL=identity-sync.js.map