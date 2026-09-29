import { defineWorkflow } from "../shared/root.js";
import { getActionState, asRecord, asRecords, requireAvailable, useWorkflowAction, useCommittedRef, } from "../shared/action.js";
function errorCode(error) {
    const row = asRecord(error);
    return row?.code ?? asRecord(row?.error)?.code;
}
export function createSessionWorkflows(client, runtime) {
    function useSessions(options = {}) {
        const query = client.useListSessions(undefined, { enabled: options.enabled });
        const session = runtime.auth.useSession();
        const action = useWorkflowAction(runtime, "sessions", options.enabled, options);
        const latest = useCommittedRef({ query, options });
        function perform(operation, sessionId) {
            return action.run({ operation, ...(sessionId ? { sessionId } : {}) }, async (transaction) => {
                requireAvailable(latest.current.query.data !== undefined);
                const row = asRecords(latest.current.query.data).find((value) => value.id === sessionId);
                if (operation === "revokeSession")
                    requireAvailable(row && typeof row.token === "string");
                const result = await transaction.write(() => client[operation](operation === "revokeSession" ? { token: row.token } : {}, {
                    throw: true,
                    retry: 0,
                }));
                if (!transaction.current())
                    throw new Error("Obsolete session action");
                await transaction.complete(() => latest.current.options.onRevoked?.({
                    operation,
                    ...(sessionId ? { sessionId } : {}),
                    result,
                }));
                return result;
            });
        }
        const { error: queryError, isPending: isLoading, ...read } = query;
        return {
            ...read,
            isLoading,
            queryError,
            ...getActionState(action),
            session: (sessionId) => ({
                revoke: {
                    ...action.control({ operation: "revokeSession", sessionId }, asRecords(query.data).some((row) => row.id === sessionId)
                        ? null
                        : { code: "unavailable" }),
                    run: () => perform("revokeSession", sessionId),
                },
            }),
            actions: {
                revokeOthers: {
                    ...action.control({ operation: "revokeOtherSessions" }, query.data === undefined ? { code: "unavailable" } : null),
                    run: () => perform("revokeOtherSessions"),
                },
                revokeAll: {
                    ...action.control({ operation: "revokeSessions" }, query.data === undefined ? { code: "unavailable" } : null),
                    run: () => perform("revokeSessions"),
                },
            },
            currentSession: action.available ? session.data?.session : undefined,
            currentSessionId: action.available ? session.data?.session.id : undefined,
            needsFreshSession: errorCode(queryError) === "SESSION_NOT_FRESH" ||
                errorCode(action.error?.cause) === "SESSION_NOT_FRESH",
        };
    }
    const sessions = defineWorkflow(useSessions);
    return { useSessions, Sessions: sessions.Root, useSessionsContext: sessions.useWorkflowContext };
}
//# sourceMappingURL=workflows.js.map