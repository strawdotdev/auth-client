import { useContext, useEffect, useState, useMemo, useSyncExternalStore } from "react";
import { useQuery, hashKey } from "@tanstack/react-query";
import { dependencies, nextExpiry } from "./resource-dependencies.js";
import { AuthDataContext } from "../client/provider-context.js";
export function useCachedResource(runtime, endpoint, fn, query = {}, options = {}) {
    const context = useContext(AuthDataContext);
    if (!context || context.runtime !== runtime)
        throw new Error("Matching AuthDataProvider is required");
    const { identity } = context;
    const enabled = options.enabled !== false;
    if (enabled)
        validateScope(endpoint, query);
    const disposed = useSyncExternalStore(runtime.subscribe, runtime.getDisposed);
    // HTTP reads need only the Better Auth session; freshness signals need Convex authentication.
    const fetchable = enabled && Boolean(identity.userId && identity.sessionId) && !disposed;
    const ready = fetchable && identity.ready;
    const keyString = hashKey(["auth", identity.userId, identity.sessionId, endpoint, query]);
    // Subscription effects use TanStack's value equality rather than the caller's
    // object identity. The original query object still goes to Better Auth.
    const key = useMemo(() => JSON.parse(keyString), [keyString]);
    const [sync, setSync] = useState({
        key: "",
        error: null,
        denied: false,
    });
    const result = useQuery({
        queryKey: key,
        enabled: fetchable,
        queryFn: async ({ signal }) => {
            if (runtime.disposed)
                throw new Error("Adapter is disposed");
            const generation = runtime.generation;
            const data = await fn({
                query,
                fetchOptions: { signal, throw: true, disableSignal: true, retry: 0 },
            });
            if (signal.aborted || generation !== runtime.generation)
                throw new Error("Obsolete auth response");
            return data;
        },
    }, runtime.cache);
    const depKey = hashKey(dependencies(endpoint, query, result.data, identity.userId ?? ""));
    const deps = useMemo(() => JSON.parse(depKey), [depKey]);
    useEffect(() => {
        if (!ready)
            return;
        const stops = [];
        const states = new Map();
        const signalled = new Set();
        let active = true;
        for (let i = 0; i < deps.length; i += 100)
            stops.push(runtime.watch(deps.slice(i, i + 100), (error, denied) => {
                if (!active)
                    return;
                states.set(i, { error, denied });
                const all = [...states.values()];
                setSync({
                    key: keyString,
                    error: all.find((state) => state.error != null)?.error ?? null,
                    denied: all.some((state) => state.denied),
                });
                if (error)
                    return;
                if (signalled.has(i))
                    void runtime.invalidate([key]).catch(() => { });
                else {
                    signalled.add(i);
                    stops.push(runtime.refreshAfterFetch(key));
                }
            }));
        return () => {
            active = false;
            stops.forEach((stop) => stop());
        };
    }, [runtime, ready, keyString, key, deps]);
    useEffect(() => {
        const expiry = nextExpiry(result.data, Date.now());
        if (!ready || expiry === undefined)
            return;
        return runtime.observeExpiry(key, expiry);
    }, [runtime, ready, result.data, key]);
    const error = result.error ?? (sync.key === keyString ? sync.error : null);
    const denied = (sync.key === keyString && (sync.denied || sync.error != null)) ||
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
                if (runtime.disposed || generation !== runtime.generation)
                    return;
                return { data: refreshed.data, error: refreshed.error };
            }
        },
    };
}
// Better Auth uses 400 for invalid/expired invitations and a removed inviter.
// These responses must not leave an earlier successful private result visible.
function isProtectedReadFailure(error) {
    const status = error?.status;
    return status !== undefined && status >= 400 && status < 500 && status !== 429;
}
function validateScope(endpoint, query) {
    const id = typeof query.organizationId === "string" && query.organizationId.length > 0;
    const slug = typeof query.organizationSlug === "string" && query.organizationSlug.length > 0;
    if ((endpoint === "listMembers" || endpoint === "listInvitations") && !id)
        throw new Error(`${endpoint} requires an explicit organizationId`);
    if ((endpoint === "getFullOrganization" || endpoint === "getActiveMemberRole") && !id && !slug)
        throw new Error(`${endpoint} requires an explicit organizationId or organizationSlug`);
    if (endpoint === "getInvitation" && (typeof query.id !== "string" || !query.id))
        throw new Error("getInvitation requires an explicit id");
}
//# sourceMappingURL=use-cached-resource.js.map