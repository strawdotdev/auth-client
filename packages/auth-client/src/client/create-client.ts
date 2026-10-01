import type {
  Features,
  SessionClient,
  OrganizationClient,
  SessionsClient,
  AuthDataClient,
  AuthDataClientConfig,
  Endpoint,
  GuestClient,
} from "./types.js";
import { CacheRuntime } from "../cache/query-cache.js";
import { useCachedResource } from "../cache/use-cached-resource.js";
import { runtimeByClient } from "./provider-context.js";
import {
  createInvitationWorkflows,
  type InvitationReads,
} from "../workflows/invitations/workflows.js";
import {
  createOrganizationWorkflows,
  type OrganizationReads,
} from "../workflows/organizations/workflows.js";
import { createSessionWorkflows, type SessionReads } from "../workflows/sessions/workflows.js";
import { createAuthenticationWorkflows } from "../workflows/authentication/workflows.js";
import { createAccountWorkflows } from "../workflows/account/workflows.js";
import { createGuestSession } from "../workflows/authentication/guest.js";
export function createAuthDataClient<
  C extends SessionClient,
  F extends Features,
  U extends { email: string } = never,
>(config: AuthDataClientConfig<C, F, U>): AuthDataClient<C, F, U> {
  const runtime = new CacheRuntime(
    config.authClient,
    config.api,
    Object.freeze({ ...config.features }),
  );
  const client: Record<string, unknown> = {
    refresh: () => runtime.refresh(),
    dispose: () => runtime.dispose(),
  };
  const auth = config.authClient as unknown as C &
    OrganizationClient &
    SessionsClient &
    GuestClient &
    import("./types.js").AccountClient;
  function write(fn: Endpoint, endpoints: readonly string[]) {
    return async (...args: unknown[]) => {
      if (runtime.disposed) throw new Error("Adapter is disposed");
      const generation = runtime.generation;
      const result = await fn(...args);
      if (!runtime.disposed && generation === runtime.generation && !hasMutationError(result))
        void runtime
          .invalidate(
            runtime.cache
              .getQueryCache()
              .getAll()
              .filter((query) => endpoints.includes(String(query.queryKey[3])))
              .map((query) => query.queryKey),
          )
          .catch(() => {});
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
    } as const;
    for (const [hook, method] of Object.entries(hooks))
      client[hook] = (query?: Record<string, unknown>, options?: { enabled?: boolean }) =>
        useCachedResource(runtime, method, auth.organization[method], query, options);
    const mutations: Record<string, unknown> = {};
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
    ] as const)
      mutations[method] = write(auth.organization[method], Object.values(hooks));
  }
  if (config.features.sessions) {
    client.useListSessions = (query?: Record<string, unknown>, options?: { enabled?: boolean }) =>
      useCachedResource(runtime, "listSessions", auth.listSessions, query, options);
    for (const method of ["revokeSession", "revokeOtherSessions", "revokeSessions"] as const)
      client[method] = write(auth[method], ["listSessions"]);
  }
  if (config.features.organization)
    Object.assign(
      client,
      createInvitationWorkflows(client as unknown as InvitationReads, runtime),
      createOrganizationWorkflows(client as unknown as OrganizationReads, runtime),
    );
  if (config.features.sessions)
    Object.assign(client, createSessionWorkflows(client as unknown as SessionReads, runtime));
  if (config.features.guests) {
    if (!config.features.authentication)
      throw new Error("The guests capability requires the authentication capability");
    Object.assign(client, createGuestSession(auth, runtime, config.hasStoredSession));
  }
  if (config.features.authentication)
    Object.assign(client, createAuthenticationWorkflows(auth, runtime));
  if (config.features.account)
    Object.assign(client, createAccountWorkflows(auth, runtime, config.currentUser!));
  runtimeByClient.set(client, runtime);
  // Only the explicitly selected capabilities are assembled above. TypeScript
  // cannot narrow generic F from runtime booleans; retain C's exact signatures.
  return client as unknown as AuthDataClient<C, F, U>;
}

function hasMutationError(result: unknown) {
  return (
    typeof result === "object" && result !== null && "error" in result && Boolean(result.error)
  );
}
