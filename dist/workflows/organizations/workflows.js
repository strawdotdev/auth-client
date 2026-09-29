import { useLayoutEffect, useRef, useState } from "react";
import { hashKey } from "@tanstack/react-query";
import { looseObject, string } from "zod";
import { useClientBoundary } from "../../client/provider-context.js";
import { useWorkflowForm } from "../shared/form.js";
import { allowed, getActionState, denied, enforcePolicy, ignored, asRecord, requireAvailable, asRecords, useWorkflowAction, useCommittedRef, policyReason, } from "../shared/action.js";
import { defineWorkflow } from "../shared/root.js";
const writeOptions = { throw: true, retry: 0 };
const required = string().refine((value) => !!value.trim(), "Required");
const createMinimum = looseObject({ name: required, slug: required });
const updateMinimum = looseObject({
    name: required.optional(),
    slug: required.optional(),
});
const getOrganizationScopeKey = (options) => hashKey([options.organizationId, options.organizationSlug]);
/** Read state for workflows; `isPending` stays reserved for owned actions. */
function readState({ error, isPending, ...query }) {
    return { ...query, isLoading: isPending, queryError: error };
}
function editableOrganizationFields(values) {
    const { fetchOptions: _fetch, organizationId: _org, userId: _user, teamId: _team, keepCurrentActiveOrganization: _active, ...body } = values;
    return body;
}
function useOrganizationResource(client, options, runtime) {
    const { identity } = useClientBoundary(runtime);
    const key = hashKey([getOrganizationScopeKey(options), identity.userId, identity.sessionId]);
    const [resolved, setResolved] = useState({ key });
    const id = resolved.key === key ? resolved.id : undefined;
    const enabled = options.enabled !== false && !!(options.organizationId || options.organizationSlug);
    const scope = id
        ? { organizationId: id }
        : options.organizationId !== undefined
            ? { organizationId: options.organizationId }
            : { organizationSlug: options.organizationSlug };
    const query = client.useOrganization(scope, { enabled });
    const organization = asRecord(query.data);
    // Store only scope metadata; all organization data remains in the query cache.
    if (organization && typeof organization.id === "string" && (resolved.key !== key || !id))
        setResolved({ key, id: organization.id });
    const memberRole = client.useMemberRole(scope, { enabled });
    const role = asRecord(memberRole.data)?.role;
    return {
        organization,
        role: typeof role === "string" ? role : undefined,
        query,
        memberRole,
        enabled,
        identityKey: key,
    };
}
function useOrganizationRecovery(action, directory, detail, callback) {
    const receipt = useRef(null);
    const [visible, setVisible] = useState({
        owner: action.owner,
        value: null,
    });
    const latest = useCommittedRef({ directory, detail, callback });
    const publish = (value) => {
        receipt.current = value;
        setVisible({ owner: action.owner, value });
    };
    useLayoutEffect(() => {
        receipt.current = null;
        return () => {
            receipt.current = null;
            setVisible({ owner: action.owner, value: null });
        };
    }, [action.owner]);
    async function complete(value, transaction) {
        transaction.phase("synchronization");
        let organization;
        try {
            const refreshed = await latest.current.directory.refetch();
            if (!transaction.current())
                throw new Error("Obsolete organization completion");
            if (!refreshed || !Array.isArray(refreshed.data))
                throw new Error("Organization directory unavailable");
            organization = asRecords(refreshed.data).find((row) => row.id === value.organizationId);
            if (value.operation === "create" || value.operation === "update") {
                if (!organization)
                    throw new Error("Organization missing from the refreshed directory");
                if (latest.current.detail) {
                    const refreshedDetail = await latest.current.detail.refetch();
                    if (!transaction.current())
                        throw new Error("Obsolete organization completion");
                    if (asRecord(refreshedDetail?.data)?.id !== value.organizationId)
                        throw new Error("Organization detail unavailable");
                }
            }
            else if (organization)
                throw new Error("Organization remains in the refreshed directory");
        }
        catch (cause) {
            if (transaction.current())
                publish({
                    operation: value.operation,
                    organizationId: value.organizationId,
                    error: { phase: "synchronization", cause, writeSucceeded: true },
                });
            throw cause;
        }
        if (!transaction.current())
            throw new Error("Obsolete organization completion");
        const result = {
            operation: value.operation,
            organizationId: value.organizationId,
            ...(organization ? { organization } : {}),
        };
        publish(null);
        await transaction.complete(() => latest.current.callback(result));
        return result;
    }
    return {
        pendingSync: action.available && visible.owner === action.owner ? visible.value : null,
        feedback: () => action.feedback(action.available && visible.owner === action.owner && visible.value
            ? [
                {
                    target: {
                        operation: visible.value.operation,
                        organizationId: visible.value.organizationId,
                    },
                    error: visible.value.error?.cause,
                    diagnostics: visible.value.error,
                    recovery: {
                        ...action.control({
                            operation: visible.value.operation,
                            organizationId: visible.value.organizationId,
                        }),
                        run: retrySync,
                    },
                },
            ]
            : []),
        blocked: () => action.current() && receipt.current !== null,
        finish: (operation, organizationId, transaction) => {
            if (!transaction.current())
                throw new Error("Obsolete organization completion");
            const value = { operation, organizationId, error: null };
            publish(value);
            return complete(value, transaction);
        },
        retrySync,
    };
    function retrySync() {
        const value = action.current() ? receipt.current : null;
        return value
            ? action.run({ operation: value.operation, organizationId: value.organizationId }, (transaction) => complete(value, transaction), true)
            : Promise.resolve(ignored("unavailable"));
    }
}
export function createOrganizationWorkflows(client, runtime) {
    function useOrganizationDirectory(options = {}) {
        const query = client.useListOrganizations(undefined, { enabled: options.enabled });
        const action = useWorkflowAction(runtime, "directory", options.enabled, options);
        const latest = useCommittedRef({ query, options });
        const list = asRecords(query.data);
        const organization = options.selection
            ? (list.find((row) => "organizationId" in options.selection
                ? row.id === options.selection.organizationId
                : row.slug === options.selection.organizationSlug) ?? null)
            : options.fallback === "first"
                ? (list[0] ?? null)
                : null;
        const status = query.isPending
            ? "loading"
            : query.error
                ? "error"
                : options.selection && !organization
                    ? "unavailable"
                    : !list.length
                        ? "empty"
                        : organization
                            ? "ready"
                            : "unselected";
        function selectOrganization(id) {
            return action.run({ operation: "select" }, async (transaction) => {
                const selected = asRecords(latest.current.query.data).find((row) => row.id === id);
                requireAvailable(selected);
                await transaction.complete(() => latest.current.options.onSelect?.(selected));
                return selected;
            });
        }
        return {
            ...readState(query),
            ...getActionState(action),
            organization,
            status,
            select: (id) => ({
                ...action.control({ operation: "select" }, list.some((row) => row.id === id) ? null : { code: "unavailable" }),
                run: () => selectOrganization(id),
            }),
        };
    }
    function useOrganizationCreateForm(options) {
        const action = useWorkflowAction(runtime, "organization-create", options.enabled, options);
        const directory = client.useListOrganizations(undefined, { enabled: options.enabled });
        const recovery = useOrganizationRecovery(action, directory, undefined, async (result) => {
            await options.onCreated?.(result);
        });
        const form = useWorkflowForm(options, action, {
            operation: "create",
            minimum: createMinimum,
            blocked: !!recovery.pendingSync,
            disabledReason: recovery.pendingSync ? { code: "recovery" } : null,
            write: (values, transaction) => {
                requireAvailable(!recovery.blocked());
                return transaction.write(() => client.organization.create({
                    ...editableOrganizationFields(values),
                    keepCurrentActiveOrganization: options.keepCurrentActiveOrganization ?? true,
                }, writeOptions));
            },
            complete: async (result, transaction) => {
                const id = asRecord(result)?.id;
                transaction.phase("synchronization");
                if (typeof id !== "string")
                    throw new Error("Creation did not return an organization ID");
                return recovery.finish("create", id, transaction);
            },
        });
        return {
            ...form,
            feedback: recovery.feedback(),
            isLoading: directory.isPending,
            isFetching: directory.isFetching,
            queryError: directory.error,
            refetch: () => directory.refetch(),
        };
    }
    function useOrganizationSettings(options) {
        const resource = useOrganizationResource(client, options, runtime);
        const action = useWorkflowAction(runtime, `settings:${getOrganizationScopeKey(options)}`, resource.enabled, options);
        const directory = client.useListOrganizations(undefined, { enabled: resource.enabled });
        const latest = useCommittedRef({ options, resource });
        const recovery = useOrganizationRecovery(action, directory, resource.query, async (result) => {
            if (result.operation === "update")
                await options.onUpdated?.(result);
            else if (result.operation === "leave")
                await options.onLeft?.(result);
            else if (result.operation === "delete")
                await options.onDeleted?.(result);
        });
        function decision(operation) {
            const { organization, role } = resource;
            if (!organization || !role || !action.available)
                return denied("unavailable");
            return (options.policy?.[operation]?.({ organization, role, actorId: action.actorId ?? "" }) ??
                allowed);
        }
        const latestDecision = useCommittedRef(decision);
        async function write(operation, values, transaction) {
            requireAvailable(!recovery.blocked());
            const organizationId = latest.current.resource.organization?.id;
            requireAvailable(typeof organizationId === "string");
            transaction.phase("validation");
            enforcePolicy(latestDecision.current(operation));
            if (operation === "update")
                await updateMinimum.parseAsync(values);
            if (operation === "delete" && latest.current.options.beforeDelete) {
                transaction.phase("preparation");
                await latest.current.options.beforeDelete({ organizationId, signal: transaction.signal });
                if (!transaction.current())
                    throw new Error("Obsolete deletion preparation");
                transaction.phase("validation");
                enforcePolicy(latestDecision.current(operation));
            }
            transaction.phase("write");
            await transaction.write(() => client.organization[operation](operation === "update"
                ? { organizationId, data: editableOrganizationFields(values) }
                : { organizationId }, writeOptions), { organizationId });
            return organizationId;
        }
        const organization = resource.organization;
        const organizationId = typeof organization?.id === "string" ? organization.id : undefined;
        const readiness = (operation) => recovery.pendingSync ? { code: "recovery" } : policyReason(decision(operation));
        const control = (operation) => action.control({ operation, organizationId }, readiness(operation));
        const updateDisabledReason = readiness("update");
        const initialValues = organization ? options.getInitialValues(organization) : {};
        const form = useWorkflowForm({ ...options, initialValues }, action, {
            operation: "update",
            organizationId,
            minimum: updateMinimum,
            resetToDraft: true,
            syncDefaults: true,
            blocked: updateDisabledReason !== null,
            disabledReason: updateDisabledReason,
            write: (values, transaction) => write("update", values, transaction),
            complete: (id, transaction) => {
                if (typeof id !== "string")
                    throw new Error("Missing organization ID");
                return recovery.finish("update", id, transaction);
            },
        });
        function perform(operation, data = {}) {
            if (recovery.blocked())
                return Promise.resolve(ignored("unavailable"));
            const id = organization?.id;
            return action.run({ operation, ...(typeof id === "string" ? { organizationId: id } : {}) }, async (transaction) => {
                const organizationId = await write(operation, data, transaction);
                return recovery.finish(operation, organizationId, transaction);
            });
        }
        return {
            ...getActionState(action),
            feedback: recovery.feedback(),
            actions: {
                update: {
                    ...control("update"),
                    run: (data) => perform("update", data),
                },
                leave: {
                    ...control("leave"),
                    run: () => perform("leave"),
                },
                delete: {
                    ...control("delete"),
                    run: () => perform("delete"),
                },
            },
            organization,
            role: resource.role,
            form: organization && action.available ? form : null,
            hasServerChanges: !!organization && form.hasServerChanges,
            isLoading: resource.query.isPending || resource.memberRole.isPending,
            isFetching: resource.query.isFetching || resource.memberRole.isFetching,
            queryError: resource.query.error ?? resource.memberRole.error,
            refetch: async () => {
                await Promise.all([
                    resource.query.refetch(),
                    resource.memberRole.refetch(),
                    directory.refetch(),
                ]);
            },
        };
    }
    function useOrganizationMembers(options) {
        if (!Number.isSafeInteger(options.pageSize) || options.pageSize <= 0)
            throw new Error("pageSize must be a positive integer");
        const resource = useOrganizationResource(client, options, runtime);
        const key = hashKey([resource.identityKey, options.query, options.pageSize]);
        const [pagination, setPagination] = useState({ key, page: 0 });
        const page = pagination.key === key ? pagination.page : 0;
        if (pagination.key !== key)
            setPagination({ key, page: 0 });
        const organizationId = resource.organization?.id;
        const query = client.useListMembers({
            ...options.query,
            organizationId: typeof organizationId === "string" ? organizationId : "",
            // The supported Convex Better Auth adapter rejects nonzero offsets.
            // Fetch the ordered prefix through the public endpoint, then page its records.
            limit: (page + 1) * options.pageSize,
        }, { enabled: resource.enabled && typeof organizationId === "string" });
        const total = typeof asRecord(query.data)?.total === "number" ? asRecord(query.data).total : 0;
        const finalPage = Math.max(0, Math.ceil(total / options.pageSize) - 1);
        const outOfBounds = query.data !== undefined && page > finalPage;
        if (outOfBounds)
            setPagination({ key, page: finalPage });
        const action = useWorkflowAction(runtime, `members:${getOrganizationScopeKey(options)}`, resource.enabled, options);
        const members = outOfBounds
            ? []
            : asRecords(asRecord(query.data)?.members).slice(page * options.pageSize, (page + 1) * options.pageSize);
        const latest = useCommittedRef({ resource, options, members });
        function availability(memberId, nextRole) {
            const member = members.find((row) => row.id === memberId);
            if (!member || !resource.organization || !resource.role || !action.available)
                return {
                    remove: denied("unavailable"),
                    updateRole: denied("unavailable"),
                    assignableRoles: undefined,
                };
            const context = {
                member,
                organization: resource.organization,
                role: resource.role,
                actorId: action.actorId ?? "",
            };
            const assignableRoles = options.policy?.assignableRoles?.(context);
            const selectable = nextRole === undefined ||
                !assignableRoles ||
                assignableRoles.some((role) => hashKey([role]) === hashKey([nextRole]));
            return {
                remove: options.policy?.removeMember?.(context) ?? allowed,
                updateRole: !selectable
                    ? denied("role-not-assignable")
                    : nextRole === undefined
                        ? allowed
                        : (options.policy?.updateMemberRole?.({ ...context, nextRole }) ?? allowed),
                assignableRoles,
            };
        }
        const latestAvailability = useCommittedRef(availability);
        function perform(operation, memberId, role) {
            return action.run({ operation, memberId, ...(typeof organizationId === "string" ? { organizationId } : {}) }, async (transaction) => {
                const current = latest.current;
                requireAvailable(current.members.some((member) => member.id === memberId));
                const id = current.resource.organization?.id;
                requireAvailable(typeof id === "string");
                transaction.phase("validation");
                const decisions = latestAvailability.current(memberId, role);
                enforcePolicy(operation === "removeMember" ? decisions.remove : decisions.updateRole);
                transaction.phase("write");
                const result = await transaction.write(() => client.organization[operation](operation === "removeMember"
                    ? { organizationId: id, memberIdOrEmail: memberId }
                    : { organizationId: id, memberId, role }, writeOptions));
                if (!transaction.current())
                    throw new Error("Obsolete member action");
                await transaction.complete(() => (operation === "removeMember"
                    ? current.options.onRemoved
                    : current.options.onRoleUpdated)?.({ memberId, result }));
                return result;
            });
        }
        function setPage(next) {
            if (!Number.isSafeInteger(next) || next < 0)
                throw new Error("page must be a nonnegative integer");
            if (action.current())
                setPagination({ key, page: query.data === undefined ? page : Math.min(next, finalPage) });
        }
        return {
            ...getActionState(action),
            refetch: async () => {
                await query.refetch();
            },
            organization: resource.organization,
            role: resource.role,
            members,
            total,
            page,
            pageSize: options.pageSize,
            isLoading: resource.query.isPending || resource.memberRole.isPending || query.isPending || outOfBounds,
            isFetching: resource.query.isFetching || resource.memberRole.isFetching || query.isFetching,
            queryError: resource.query.error ?? resource.memberRole.error ?? query.error,
            hasNextPage: query.data !== undefined && page < finalPage,
            hasPreviousPage: page > 0,
            setPage,
            nextPage: () => setPage(page + 1),
            previousPage: () => setPage(Math.max(0, page - 1)),
            member: (memberId) => {
                const decisions = availability(memberId);
                const target = {
                    organizationId: typeof organizationId === "string" ? organizationId : undefined,
                    memberId,
                };
                return {
                    assignableRoles: decisions.assignableRoles,
                    remove: {
                        ...action.control({ ...target, operation: "removeMember" }, policyReason(decisions.remove)),
                        run: () => perform("removeMember", memberId),
                    },
                    updateRole: (role) => ({
                        ...action.control({ ...target, operation: "updateMemberRole" }, policyReason(availability(memberId, role).updateRole)),
                        run: () => perform("updateMemberRole", memberId, role),
                    }),
                };
            },
        };
    }
    const directory = defineWorkflow(useOrganizationDirectory);
    const creation = defineWorkflow(useOrganizationCreateForm);
    const settings = defineWorkflow(useOrganizationSettings);
    const members = defineWorkflow(useOrganizationMembers);
    return {
        useOrganizationDirectory,
        useOrganizationCreateForm,
        useOrganizationSettings,
        useOrganizationMembers,
        defineOrganizationCreateForm: (schema) => defineWorkflow((options) => useOrganizationCreateForm({ ...options, schema: options.schema ?? schema })),
        defineOrganizationSettings: (schema) => defineWorkflow((options) => useOrganizationSettings({ ...options, schema: options.schema ?? schema })),
        OrganizationDirectory: directory.Root,
        useOrganizationDirectoryContext: directory.useWorkflowContext,
        OrganizationCreateForm: creation.Root,
        useOrganizationCreateFormContext: creation.useWorkflowContext,
        OrganizationSettings: settings.Root,
        useOrganizationSettingsContext: settings.useWorkflowContext,
        OrganizationMembers: members.Root,
        useOrganizationMembersContext: members.useWorkflowContext,
    };
}
//# sourceMappingURL=workflows.js.map