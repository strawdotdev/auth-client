import { asRecord, asRecords, getActionState, getAuthErrorCode, requireAvailable, useCommittedRef, useWorkflowAction, } from "../shared/action.js";
import { defineWorkflow } from "../shared/root.js";
import { passkeyCancelled } from "../authentication/workflows.js";
/** The account's passkeys: the list, adding one (the browser makes it) and removing one. */
export function createPasskeyWorkflows(client, runtime) {
    function usePasskeys(options = {}) {
        const query = client.useListPasskeys(undefined, { enabled: options.enabled });
        const action = useWorkflowAction(runtime, "passkeys", options.enabled, options);
        const latest = useCommittedRef({ query, options });
        const add = (body = {}) => action.run({ operation: "addPasskey" }, async (transaction) => {
            let passkey;
            try {
                // Better Auth's passkey client answers the ceremony's failures as `{ error }`.
                const result = asRecord(await transaction.write(() => client.passkey.addPasskey(body)));
                if (result?.error)
                    throw result.error;
                passkey = result && "data" in result ? result.data : result;
            }
            catch (cause) {
                if (!passkeyCancelled(cause))
                    throw cause;
                return { outcome: "cancelled" };
            }
            if (!transaction.current())
                throw new Error("Obsolete passkey action");
            await transaction.complete(() => latest.current.options.onAdded?.({ passkey }));
            return { outcome: "added", passkey };
        });
        const remove = (passkeyId) => action.run({ operation: "deletePasskey", passkeyId }, async (transaction) => {
            requireAvailable(asRecords(latest.current.query.data).some((row) => row.id === passkeyId));
            await transaction.write(() => client.passkey.deletePasskey({ id: passkeyId }, { throw: true, retry: 0 }));
            if (!transaction.current())
                throw new Error("Obsolete passkey action");
            await transaction.complete(() => latest.current.options.onDeleted?.({ passkeyId }));
            return { outcome: "deleted" };
        });
        const { error: queryError, isPending: isLoading, ...read } = query;
        return {
            ...read,
            isLoading,
            queryError,
            ...getActionState(action),
            passkey: (passkeyId) => ({
                remove: {
                    ...action.control({ operation: "deletePasskey", passkeyId }, asRecords(query.data).some((row) => row.id === passkeyId)
                        ? null
                        : { code: "unavailable" }),
                    run: () => remove(passkeyId),
                },
            }),
            actions: {
                add: { ...action.control({ operation: "addPasskey" }), run: add },
            },
            /** Adding a passkey needs a recent sign-in; reauthenticate, then add again. */
            needsFreshSession: getAuthErrorCode(action.error?.cause) === "SESSION_NOT_FRESH",
        };
    }
    const passkeys = defineWorkflow(usePasskeys);
    return { usePasskeys, Passkeys: passkeys.Root, usePasskeysContext: passkeys.useWorkflowContext };
}
//# sourceMappingURL=workflows.js.map