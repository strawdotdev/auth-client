import { QueryClient, hashKey } from "@tanstack/react-query";
export class CacheRuntime {
    auth;
    api;
    features;
    cache = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 5000,
                gcTime: 300000,
                retry: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
                networkMode: "always",
            },
        },
    });
    convex;
    disposed = false;
    listeners = new Set();
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    getDisposed = () => this.disposed;
    identity = "";
    generation = 0;
    attached = 0;
    attachmentRevision = 0;
    authObservation = {
        ready: false,
        sessionPending: true,
        convexAuthenticated: false,
        convexLoading: true,
    };
    authSession = null;
    authRevision = 0;
    authListeners = new Set();
    sessionRefetch;
    timers = new Set();
    deadlines = new Map();
    observeExpiry(key, expiry) {
        const hash = hashKey(key);
        let entry = this.deadlines.get(hash);
        if (!entry || entry.expiry !== expiry) {
            entry?.stop();
            let timer;
            const generation = this.generation;
            const arm = () => {
                timer = setTimeout(() => {
                    this.timers.delete(timer);
                    if (this.disposed || generation !== this.generation)
                        return;
                    if (Date.now() < expiry)
                        arm();
                    else {
                        if (this.deadlines.get(hash) === entry)
                            this.deadlines.delete(hash);
                        void this.invalidate([key]).catch(() => { });
                    }
                }, Math.min(2147483647, Math.max(1, expiry - Date.now() + 1)));
                this.timers.add(timer);
            };
            entry = {
                expiry,
                observers: 0,
                stop: () => {
                    clearTimeout(timer);
                    this.timers.delete(timer);
                },
            };
            this.deadlines.set(hash, entry);
            arm();
        }
        entry.observers++;
        return () => {
            if (--entry.observers === 0) {
                entry.stop();
                if (this.deadlines.get(hash) === entry)
                    this.deadlines.delete(hash);
            }
        };
    }
    userId;
    signalErrors = new Map();
    pending = new Map();
    scheduled;
    scheduledKeys;
    inFlight = new Map();
    invalidate(keys) {
        for (const key of keys)
            this.pending.set(hashKey(key), key);
        if (this.scheduled) {
            for (const key of keys)
                this.scheduledKeys?.add(hashKey(key));
            return this.scheduled;
        }
        const taskKeys = new Set(keys.map(hashKey));
        const generation = this.generation;
        const pending = this.pending;
        const task = Promise.resolve().then(async () => {
            const batch = new Set(pending.keys());
            pending.clear();
            if (this.scheduled === task)
                this.scheduled = undefined;
            if (!batch.size || this.disposed || generation !== this.generation)
                return;
            const filters = {
                predicate: (query) => batch.has(hashKey(query.queryKey)),
            };
            await this.cache.cancelQueries(filters);
            if (this.disposed || generation !== this.generation)
                return;
            // Settle every resource even if one HTTP endpoint fails immediately.
            const attempts = await Promise.allSettled([...batch].map((hash) => this.cache.invalidateQueries({ predicate: (query) => hashKey(query.queryKey) === hash }, { throwOnError: true })));
            const failure = attempts.find((attempt) => attempt.status === "rejected");
            if (failure?.status === "rejected")
                throw failure.reason;
        });
        this.scheduled = task;
        this.scheduledKeys = taskKeys;
        this.inFlight.set(task, taskKeys);
        void task.then(() => {
            this.inFlight.delete(task);
        }, () => {
            this.inFlight.delete(task);
        });
        return task;
    }
    /**
     * A resource's first freshness signal cannot tell whether a request already in flight read the
     * signalled state. Let that request finish and show its result, then refetch once.
     */
    refreshAfterFetch(key) {
        const hash = hashKey(key);
        const queries = this.cache.getQueryCache();
        if (queries.get(hash)?.state.fetchStatus !== "fetching") {
            void this.invalidate([key]).catch(() => { });
            return () => { };
        }
        const generation = this.generation;
        const stop = queries.subscribe(({ query }) => {
            if (query.queryHash !== hash || query.state.fetchStatus === "fetching")
                return;
            stop();
            if (!this.disposed && generation === this.generation)
                void this.invalidate([key]).catch(() => { });
        });
        return stop;
    }
    async refreshResource(key) {
        // Invalidation cancels obsolete requests. Waiting for its replacement work
        // avoids returning TanStack's reverted, pre-write data from observer.refetch.
        const hash = hashKey(key);
        void this.invalidate([key]).catch(() => { });
        for (;;) {
            const attempts = [...this.inFlight]
                .filter(([, keys]) => keys.has(hash))
                .map(([task]) => task);
            if (!attempts.length)
                break;
            await Promise.allSettled(attempts);
        }
        const state = this.cache.getQueryState(key);
        if (state?.error)
            throw state.error;
        return { data: state?.data, error: null };
    }
    watches = new Map();
    constructor(auth, api, features) {
        this.auth = auth;
        this.api = api;
        this.features = features;
    }
    attach(convex) {
        if (this.disposed)
            throw new Error("Adapter is disposed");
        if (this.convex && this.convex !== convex && this.attached)
            throw new Error("Adapter already attached to another Convex client");
        if (this.convex && this.convex !== convex) {
            this.generation++;
            void this.cache.cancelQueries();
            this.cache.clear();
        }
        this.convex = convex;
        this.attached++;
        this.attachmentRevision++;
        return () => {
            if (--this.attached === 0) {
                this.attachmentRevision++;
                for (const w of this.watches.values())
                    w.stop();
                this.watches.clear();
                void this.cache.cancelQueries();
            }
        };
    }
    subscribeAuth = (listener) => {
        this.authListeners.add(listener);
        return () => {
            this.authListeners.delete(listener);
        };
    };
    getAuthRevision = () => this.authRevision;
    async refreshSession() {
        if (!this.sessionRefetch)
            throw new Error("The configured session hook cannot be refreshed");
        const result = await this.sessionRefetch();
        if (result && typeof result === "object" && "error" in result && result.error)
            throw result.error;
    }
    waitForAuth(predicate, signal, timeout = 10_000, rejectWhen) {
        if (signal.aborted)
            return Promise.reject(new DOMException("Authentication synchronization was cancelled", "AbortError"));
        if (predicate(this.authObservation))
            return Promise.resolve(this.authObservation);
        const initialFailure = rejectWhen?.(this.authObservation);
        if (initialFailure !== undefined)
            return Promise.reject(initialFailure);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error("Authentication synchronization timed out")), timeout);
            const unsubscribe = this.subscribeAuth(() => {
                if (predicate(this.authObservation))
                    finish(null, this.authObservation);
                else {
                    const failure = rejectWhen?.(this.authObservation);
                    if (failure !== undefined)
                        finish(failure);
                }
            });
            const abort = () => finish(new DOMException("Authentication synchronization was cancelled", "AbortError"));
            const finish = (error, value) => {
                clearTimeout(timer);
                unsubscribe();
                signal.removeEventListener("abort", abort);
                if (error)
                    reject(error);
                else
                    resolve(value);
            };
            signal.addEventListener("abort", abort, { once: true });
        });
    }
    /** Private data belongs to one user session; readiness and token refreshes keep it. */
    setIdentity(identity) {
        const key = JSON.stringify([identity.userId ?? null, identity.sessionId ?? null]);
        if (this.identity === key)
            return;
        this.identity = key;
        this.userId = identity.userId;
        for (const watch of this.watches.values())
            watch.stop();
        this.watches.clear();
        for (const timer of this.timers)
            clearTimeout(timer);
        this.timers.clear();
        this.deadlines.clear();
        this.pending = new Map();
        this.scheduled = undefined;
        this.signalErrors.clear();
        this.generation++;
        void this.cache.cancelQueries();
        this.cache.clear();
    }
    watch(deps, listener) {
        const key = hashKey(deps);
        let entry = this.watches.get(key);
        if (!entry) {
            const generation = this.generation;
            const watch = this.convex.watchQuery(this.api.signals, { dependencies: deps });
            const listeners = new Set();
            const read = (only) => {
                if (stopped || generation !== this.generation)
                    return;
                const targets = only ? [only] : listeners;
                try {
                    const result = watch.localQueryResult();
                    if (!result)
                        return;
                    if (result.userId !== this.userId)
                        throw new Error("Auth data identity mismatch");
                    this.signalErrors.delete(key);
                    if (result.protocol !== 1 ||
                        (this.features.organization && !result.features.organization) ||
                        (this.features.sessions && !result.features.sessions))
                        throw new Error("Auth data backend capability mismatch");
                    for (const fn of targets)
                        fn(null, result.denied);
                }
                catch (error) {
                    this.signalErrors.set(key, error);
                    for (const fn of targets)
                        fn(error, false);
                }
            };
            let stopped = false;
            const unsubscribe = watch.onUpdate(() => read());
            entry = {
                stop: () => {
                    if (!stopped) {
                        stopped = true;
                        unsubscribe();
                    }
                },
                listeners,
                read,
            };
            this.watches.set(key, entry);
        }
        entry.listeners.add(listener);
        entry.read(listener);
        return () => {
            entry.listeners.delete(listener);
            if (!entry.listeners.size) {
                entry.stop();
                if (this.watches.get(key) === entry) {
                    this.watches.delete(key);
                    this.signalErrors.delete(key);
                }
            }
        };
    }
    async refresh() {
        if (this.disposed)
            throw new Error("Adapter is disposed");
        for (const w of this.watches.values())
            w.read();
        const failures = [];
        void this.invalidate(this.cache
            .getQueryCache()
            .getAll()
            .map((query) => query.queryKey)).catch(() => { });
        while (this.inFlight.size) {
            const attempts = await Promise.allSettled([...this.inFlight.keys()]);
            for (const attempt of attempts)
                if (attempt.status === "rejected")
                    failures.push(attempt.reason);
        }
        if (failures.length)
            throw failures[0];
        if (this.signalErrors.size)
            throw this.signalErrors.values().next().value;
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const listener of this.listeners)
            listener();
        for (const timer of this.timers)
            clearTimeout(timer);
        this.timers.clear();
        this.deadlines.clear();
        this.pending = new Map();
        this.scheduled = undefined;
        this.signalErrors.clear();
        this.generation++;
        for (const w of this.watches.values())
            w.stop();
        this.watches.clear();
        void this.cache.cancelQueries();
        this.cache.clear();
        this.authRevision++;
        for (const listener of this.authListeners)
            listener();
        this.authListeners.clear();
    }
}
export function observeAuth(runtime, observation, refetch, session) {
    runtime.sessionRefetch = refetch;
    runtime.authSession = session;
    const changed = JSON.stringify(runtime.authObservation) !== JSON.stringify(observation);
    runtime.authObservation = observation;
    runtime.setIdentity(observation);
    if (!changed)
        return;
    runtime.authRevision++;
    for (const listener of runtime.authListeners)
        listener();
}
//# sourceMappingURL=query-cache.js.map