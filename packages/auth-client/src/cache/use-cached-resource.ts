import { useContext, useEffect, useState, useMemo, useSyncExternalStore } from "react";
import { useQuery, hashKey, type QueryKey } from "@tanstack/react-query";
import type { Endpoint, ResourceDependency } from "../client/types.js";
import { dependencies, nextExpiry } from "./resource-dependencies.js";
import type { CacheRuntime } from "./query-cache.js";
import { AuthDataContext } from "../client/provider-context.js";
export function useCachedResource(
  runtime: CacheRuntime,
  endpoint: string,
  fn: Endpoint,
  query: Record<string, unknown> = {},
  options: { enabled?: boolean } = {},
) {
  const context = useContext(AuthDataContext);
  if (!context || context.runtime !== runtime)
    throw new Error("Matching AuthDataProvider is required");
  const { identity } = context;
  const enabled = options.enabled !== false;
  if (enabled) validateScope(endpoint, query);
  const disposed = useSyncExternalStore(runtime.subscribe, runtime.getDisposed);
  // HTTP reads need only the Better Auth session; freshness signals need Convex authentication.
  const fetchable = enabled && Boolean(identity.userId && identity.sessionId) && !disposed;
  const ready = fetchable && identity.ready;
  const keyString = hashKey(["auth", identity.userId, identity.sessionId, endpoint, query]);
  // Subscription effects use TanStack's value equality rather than the caller's
  // object identity. The original query object still goes to Better Auth.
  const key = useMemo<QueryKey>(() => JSON.parse(keyString), [keyString]);
  const [sync, setSync] = useState<{ key: string; error: unknown; denied: boolean }>({
    key: "",
    error: null,
    denied: false,
  });
  const result = useQuery(
    {
      queryKey: key,
      enabled: fetchable,
      queryFn: async ({ signal }) => {
        if (runtime.disposed) throw new Error("Adapter is disposed");
        const generation = runtime.generation;
        const data = await fn({
          query,
          fetchOptions: { signal, throw: true, disableSignal: true, retry: 0 },
        });
        if (signal.aborted || generation !== runtime.generation)
          throw new Error("Obsolete auth response");
        return data;
      },
    },
    runtime.cache,
  );
  const depKey = hashKey(dependencies(endpoint, query, result.data, identity.userId ?? ""));
  const deps = useMemo<ResourceDependency[]>(() => JSON.parse(depKey), [depKey]);
  useEffect(() => {
    if (!ready) return;
    const stops: Array<() => void> = [];
    const states = new Map<number, { error: unknown; denied: boolean }>();
    let active = true;
    for (let i = 0; i < deps.length; i += 100)
      stops.push(
        runtime.watch(deps.slice(i, i + 100), (error, denied) => {
          if (!active) return;
          states.set(i, { error, denied });
          const all = [...states.values()];
          setSync({
            key: keyString,
            error: all.find((state) => state.error != null)?.error ?? null,
            denied: all.some((state) => state.denied),
          });
          if (error) return;
          void runtime.invalidate([key]).catch(() => {});
        }),
      );
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [runtime, ready, keyString, key, deps]);
  useEffect(() => {
    const expiry = nextExpiry(result.data, Date.now());
    if (!ready || expiry === undefined) return;
    return runtime.observeExpiry(key, expiry);
  }, [runtime, ready, result.data, key]);
  const error = result.error ?? (sync.key === keyString ? sync.error : null);
  const denied =
    (sync.key === keyString && (sync.denied || sync.error != null)) ||
    isProtectedReadFailure(error);
  return {
    data: fetchable && !denied ? result.data : undefined,
    error,
    isPending: enabled && !disposed && (!fetchable || result.isPending),
    isFetching: fetchable && result.isFetching,
    refetch: async () => {
      if (fetchable && !runtime.disposed) {
        const generation = runtime.generation;
        for (let i = 0; i < deps.length; i += 100)
          runtime.watches.get(hashKey(deps.slice(i, i + 100)))?.read();
        const refreshed = await runtime.refreshResource(key);
        if (runtime.disposed || generation !== runtime.generation) return;
        return { data: refreshed.data, error: refreshed.error };
      }
    },
  };
}
// Better Auth uses 400 for invalid/expired invitations and a removed inviter.
// These responses must not leave an earlier successful private result visible.
function isProtectedReadFailure(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 429;
}
function validateScope(endpoint: string, query: Record<string, unknown>) {
  const id = typeof query.organizationId === "string" && query.organizationId.length > 0;
  const slug = typeof query.organizationSlug === "string" && query.organizationSlug.length > 0;
  if ((endpoint === "listMembers" || endpoint === "listInvitations") && !id)
    throw new Error(`${endpoint} requires an explicit organizationId`);
  if ((endpoint === "getFullOrganization" || endpoint === "getActiveMemberRole") && !id && !slug)
    throw new Error(`${endpoint} requires an explicit organizationId or organizationSlug`);
  if (endpoint === "getInvitation" && (typeof query.id !== "string" || !query.id))
    throw new Error("getInvitation requires an explicit id");
}
