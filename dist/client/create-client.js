import { CacheRuntime } from "../cache/query-cache.js";
import { useCachedResource } from "../cache/use-cached-resource.js";
import { runtimeByClient } from "./provider-context.js";
import { createInvitationWorkflows, } from "../workflows/invitations/workflows.js";
import { createOrganizationWorkflows, } from "../workflows/organizations/workflows.js";
import { createSessionWorkflows } from "../workflows/sessions/workflows.js";
import { createAuthenticationWorkflows } from "../workflows/authentication/workflows.js";
import { createAccountWorkflows } from "../workflows/account/workflows.js";
import { createGuestSession } from "../workflows/authentication/guest.js";
export function createAuthDataClient(config) {
    const runtime = new CacheRuntime(config.authClient, config.api, Object.freeze({ ...config.features }));
    const client = {
        refresh: () => runtime.refresh(),
        dispose: () => runtime.dispose(),
    };
    const auth = config.authClient;
    function write(fn, endpoints) {
        return async (...args) => {
            if (runtime.disposed)
                throw new Error("Adapter is disposed");
            const generation = runtime.generation;
            const result = await fn(...args);
            if (!runtime.disposed && generation === runtime.generation && !hasMutationError(result))
                void runtime
                    .invalidate(runtime.cache
                    .getQueryCache()
                    .getAll()
                    .filter((query) => endpoints.includes(String(query.queryKey[3])))
                    .map((query) => query.queryKey))
                    .catch(() => { });
            return result;
        };
    }
    if (config.features.organization) {
        const hooks = {
            useListOrganizations: "list",
            useOrganization: "getFullOrganization",
            useListMembers: "listMembers",
            useMemberRole: "getActiveMemberRole",
            useListInvitations: "listInvitations",
            useListUserInvitations: "listUserInvitations",
            useInvitation: "getInvitation",
        };
        for (const [hook, method] of Object.entries(hooks))
            client[hook] = (query, options) => useCachedResource(runtime, method, auth.organization[method], query, options);
        const mutations = {};
        client.organization = mutations;
        for (const method of [
            "create",
            "update",
            "delete",
            "leave",
            "inviteMember",
            "cancelInvitation",
            "acceptInvitation",
            "rejectInvitation",
            "removeMember",
            "updateMemberRole",
        ])
            mutations[method] = write(auth.organization[method], Object.values(hooks));
    }
    if (config.features.sessions) {
        client.useListSessions = (query, options) => useCachedResource(runtime, "listSessions", auth.listSessions, query, options);
        for (const method of ["revokeSession", "revokeOtherSessions", "revokeSessions"])
            client[method] = write(auth[method], ["listSessions"]);
    }
    if (config.features.organization)
        Object.assign(client, createInvitationWorkflows(client, runtime), createOrganizationWorkflows(client, runtime));
    if (config.features.sessions)
        Object.assign(client, createSessionWorkflows(client, runtime));
    if (config.features.guests) {
        if (!config.features.authentication)
            throw new Error("The guests capability requires the authentication capability");
        Object.assign(client, createGuestSession(auth, runtime, config.hasStoredSession));
    }
    if (config.features.authentication)
        Object.assign(client, createAuthenticationWorkflows(auth, runtime));
    if (config.features.account)
        Object.assign(client, createAccountWorkflows(auth, runtime, config.currentUser));
    runtimeByClient.set(client, runtime);
    // Only the explicitly selected capabilities are assembled above. TypeScript
    // cannot narrow generic F from runtime booleans; retain C's exact signatures.
    return client;
}
function hasMutationError(result) {
    return (typeof result === "object" && result !== null && "error" in result && Boolean(result.error));
}
//# sourceMappingURL=create-client.js.map