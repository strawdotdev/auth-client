import { useLayoutEffect, useRef, useState } from "react";
import { useWorkflowAction, useCommittedRef, requireAvailable, } from "../shared/action.js";
import { useInvitationFormState } from "./form.js";
import { defineWorkflow } from "../shared/root.js";
function ignored(reason) {
    return { status: "ignored", reason };
}
function asRecord(value) {
    return value !== null && typeof value === "object" ? value : undefined;
}
function asRecords(value) {
    return Array.isArray(value)
        ? value.map(asRecord).filter((item) => item !== undefined)
        : [];
}
/** Read state for workflows; `isPending` stays reserved for owned actions. */
function readState({ error, isPending, ...state }) {
    return { ...state, isLoading: isPending, queryError: error };
}
function validateValues(values) {
    const errors = {};
    if (typeof values.email !== "string" || !values.email.trim())
        errors.email = { code: "required" };
    const role = values.role;
    if (!(typeof role === "string" && role.trim()) &&
        !(Array.isArray(role) &&
            role.length &&
            role.every((item) => typeof item === "string" && item.trim())))
        errors.role = { code: "required" };
    return errors;
}
function invitationBody(values, organizationId, resend) {
    const { fetchOptions: _fetch, teamId: _team, organizationId: _org, resend: _resend, ...body } = values;
    return { ...body, organizationId, resend };
}
function resendId(data, values) {
    const email = typeof values.email === "string" ? values.email.toLowerCase() : undefined;
    const row = asRecords(data).find((item) => typeof item.email === "string" &&
        item.email.toLowerCase() === email &&
        item.status === "pending");
    return typeof row?.id === "string" ? row.id : undefined;
}
export function createInvitationWorkflows(client, runtime) {
    function useResponses(options, scope, data) {
        const action = useWorkflowAction(runtime, scope, options.enabled, options);
        const latestData = useCommittedRef(data);
        const observed = (invitationId, source) => (Array.isArray(source) ? asRecords(source) : [asRecord(source)]).find((row) => row?.id === invitationId);
        const subject = (invitationId, source) => {
            const row = (Array.isArray(source) ? asRecords(source) : [asRecord(source)]).find((item) => item?.id === invitationId);
            return typeof row?.organizationId === "string" ? { organizationId: row.organizationId } : {};
        };
        const directory = client.useListOrganizations(undefined, { enabled: options.enabled });
        const receipt = useRef(new Map());
        const [recoveries, setRecoveries] = useState({
            owner: action.owner,
            entries: [],
        });
        const publish = () => setRecoveries({ owner: action.owner, entries: [...receipt.current.values()] });
        const activeReceipt = (id) => (action.current() ? receipt.current.get(id) : undefined);
        useLayoutEffect(() => {
            const entries = receipt.current;
            entries.clear();
            return () => {
                entries.clear();
                setRecoveries({ owner: action.owner, entries: [] });
            };
        }, [action.owner]);
        async function complete(value, transaction) {
            transaction.phase("synchronization");
            let organization;
            try {
                const refreshed = await directory.refetch();
                if (!transaction.current())
                    throw new Error("Obsolete invitation completion");
                organization = asRecords(refreshed?.data).find((item) => item.id === value.organizationId);
                if (!organization)
                    throw new Error("The accepted organization was not present in the refreshed directory.");
            }
            catch (cause) {
                if (transaction.current()) {
                    receipt.current.set(value.invitationId, {
                        ...value,
                        error: { phase: "synchronization", cause, writeSucceeded: true },
                    });
                    publish();
                }
                throw cause;
            }
            const accepted = { invitationId: value.invitationId, organization };
            // Clear the recovery receipt before the application callback: it must not be replayed by retrySync.
            receipt.current.delete(value.invitationId);
            publish();
            await transaction.complete(() => options.onAccepted?.(accepted));
            return accepted;
        }
        function accept(invitationId) {
            if (!invitationId)
                return Promise.resolve(ignored("unavailable"));
            if (activeReceipt(invitationId))
                return Promise.resolve(ignored("unavailable"));
            return action.run({ operation: "accept", invitationId, ...subject(invitationId, latestData.current) }, async (transaction) => {
                requireAvailable(observed(invitationId, latestData.current)?.status === "pending");
                const result = await transaction.write(() => client.organization.acceptInvitation({ invitationId }, { throw: true, retry: 0 }));
                if (!transaction.current())
                    throw new Error("Obsolete invitation acceptance");
                transaction.phase("synchronization");
                const organizationId = asRecord(asRecord(result)?.member)?.organizationId;
                if (typeof organizationId !== "string")
                    throw new Error("Acceptance did not return a membership organization ID.");
                const value = { invitationId, organizationId };
                receipt.current.set(invitationId, { ...value, error: null });
                publish();
                return complete(value, transaction);
            });
        }
        function retrySync(invitationId) {
            const value = activeReceipt(invitationId);
            if (!value)
                return Promise.resolve(ignored("unavailable"));
            return action.run({ operation: "accept", invitationId: value.invitationId }, (transaction) => complete(value, transaction), true);
        }
        function reject(invitationId) {
            if (!invitationId || activeReceipt(invitationId))
                return Promise.resolve(ignored("unavailable"));
            return action.run({ operation: "reject", invitationId, ...subject(invitationId, latestData.current) }, async (transaction) => {
                requireAvailable(observed(invitationId, latestData.current)?.status === "pending");
                const result = await transaction.write(() => client.organization.rejectInvitation({ invitationId }, { throw: true, retry: 0 }));
                if (!transaction.current())
                    throw new Error("Obsolete invitation rejection");
                await transaction.complete(() => options.onRejected?.({ invitationId, result }));
                return result;
            });
        }
        const pendingSync = action.available && recoveries.owner === action.owner ? recoveries.entries : [];
        return {
            feedback: action.feedback(pendingSync.map((entry) => ({
                target: {
                    operation: "accept",
                    invitationId: entry.invitationId,
                    organizationId: entry.organizationId,
                },
                error: entry.error?.cause,
                diagnostics: entry.error,
                recovery: {
                    ...action.control({ operation: "accept", invitationId: entry.invitationId }),
                    run: () => retrySync(entry.invitationId),
                },
            }))),
            invitation: (invitationId) => {
                const row = (Array.isArray(data) ? asRecords(data) : [asRecord(data)]).find((row) => row?.id === invitationId);
                const reason = pendingSync.some((entry) => entry.invitationId === invitationId)
                    ? { code: "recovery" }
                    : row?.status === "pending"
                        ? null
                        : { code: "unavailable" };
                return {
                    accept: {
                        ...action.control({ operation: "accept", invitationId, ...subject(invitationId, data) }, reason),
                        run: () => accept(invitationId),
                    },
                    reject: {
                        ...action.control({ operation: "reject", invitationId, ...subject(invitationId, data) }, reason),
                        run: () => reject(invitationId),
                    },
                };
            },
            isPending: action.isBusy,
            diagnostics: { pendingAction: action.pendingAction, error: action.error },
            reset: action.reset,
        };
    }
    function useReceivedInvitations(options = {}) {
        const query = client.useListUserInvitations(undefined, { enabled: options.enabled });
        const responses = useResponses(options, "received", query.data);
        return { ...readState(query), ...responses };
    }
    function useInvitationResponse(options) {
        const enabled = options.enabled !== false && Boolean(options.invitationId);
        const query = client.useInvitation({ id: options.invitationId }, { enabled });
        const responses = useResponses({ ...options, enabled }, `invitation:${options.invitationId}`, query.data);
        const { data: invitation, ...read } = readState(query);
        return {
            ...read,
            ...responses,
            invitation,
            actions: responses.invitation(options.invitationId),
        };
    }
    function useOrganizationInvitations(options) {
        const enabled = options.enabled !== false && Boolean(options.organizationId);
        const query = client.useListInvitations({ organizationId: options.organizationId }, { enabled });
        const action = useWorkflowAction(runtime, `outgoing:${options.organizationId}`, enabled, options);
        const latest = useCommittedRef(query.data);
        function cancel(invitationId) {
            if (!invitationId)
                return Promise.resolve(ignored("unavailable"));
            return action.run({ operation: "cancel", invitationId, organizationId: options.organizationId }, async (transaction) => {
                requireAvailable(asRecords(latest.current).some((row) => row.id === invitationId && row.status === "pending"));
                const result = await transaction.write(() => client.organization.cancelInvitation({ invitationId }, { throw: true, retry: 0 }));
                if (!transaction.current())
                    throw new Error("Obsolete invitation cancellation");
                await transaction.complete(() => options.onCancelled?.({ invitationId, result }));
                return result;
            });
        }
        function resend(invitationId) {
            return action.run({
                operation: "resend",
                invitationId,
                organizationId: options.organizationId,
            }, async (transaction) => {
                const observed = asRecords(latest.current).find((row) => row.id === invitationId);
                requireAvailable(observed?.status === "pending");
                const { id: _id, status: _status, inviterId: _inviter, createdAt: _created, expiresAt: _expires, ...values } = observed;
                transaction.phase("validation");
                const errors = validateValues(values);
                if (Object.keys(errors).length)
                    throw errors;
                transaction.phase("write");
                const result = await transaction.write(() => client.organization.inviteMember(invitationBody(values, options.organizationId, true), {
                    throw: true,
                    retry: 0,
                }));
                if (!transaction.current())
                    throw new Error("Obsolete invitation resend");
                await transaction.complete(() => options.onResent?.(result));
                return result;
            });
        }
        return {
            ...readState(query),
            feedback: action.feedback(),
            invitation: (invitationId) => {
                const row = asRecords(query.data).find((row) => row.id === invitationId);
                const reason = row?.status === "pending" ? null : { code: "unavailable" };
                return {
                    cancel: {
                        ...action.control({ operation: "cancel", invitationId, organizationId: options.organizationId }, reason),
                        run: () => cancel(invitationId),
                    },
                    resend: {
                        ...action.control({ operation: "resend", invitationId, organizationId: options.organizationId }, reason),
                        run: () => resend(invitationId),
                    },
                };
            },
            isPending: action.isBusy,
            diagnostics: { pendingAction: action.pendingAction, error: action.error },
            reset: action.reset,
        };
    }
    function useInvitationForm(options) {
        const enabled = options.enabled !== false && Boolean(options.organizationId);
        const action = useWorkflowAction(runtime, `form:${options.organizationId}:${options.mode ?? "invite"}`, enabled, options);
        const outgoing = client.useListInvitations({ organizationId: options.organizationId }, { enabled: enabled && options.mode === "resend" });
        return useInvitationFormState(options, action, (values) => client.organization.inviteMember(invitationBody(values, options.organizationId, options.mode === "resend"), { throw: true, retry: 0 }), (values) => (options.mode === "resend" ? resendId(outgoing.data, values) : undefined));
    }
    const form = defineWorkflow(useInvitationForm);
    const received = defineWorkflow(useReceivedInvitations);
    const response = defineWorkflow(useInvitationResponse);
    const outgoing = defineWorkflow(useOrganizationInvitations);
    return {
        useInvitationForm,
        defineInvitationForm: (schema) => defineWorkflow((options) => useInvitationForm({ ...options, schema: options.schema ?? schema })),
        useReceivedInvitations,
        useInvitationResponse,
        useOrganizationInvitations,
        InvitationForm: form.Root,
        useInvitationFormContext: form.useWorkflowContext,
        ReceivedInvitations: received.Root,
        useReceivedInvitationsContext: received.useWorkflowContext,
        InvitationResponse: response.Root,
        useInvitationResponseContext: response.useWorkflowContext,
        OrganizationInvitations: outgoing.Root,
        useOrganizationInvitationsContext: outgoing.useWorkflowContext,
    };
}
//# sourceMappingURL=workflows.js.map