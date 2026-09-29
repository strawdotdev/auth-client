import { QueryClient, type QueryKey } from "@tanstack/react-query";
import type { ConvexReactClient } from "convex/react";
import type { SessionClient, InvalidationApi, Features, ResourceDependency } from "../client/types.js";
export type Identity = {
    userId?: string;
    sessionId?: string;
    ready: boolean;
};
export type AuthObservation = Identity & {
    sessionToken?: string;
    sessionPending: boolean;
    convexAuthenticated: boolean;
    convexLoading: boolean;
};
export declare class CacheRuntime {
    readonly auth: SessionClient;
    readonly api: InvalidationApi;
    readonly features: Features;
    readonly cache: QueryClient;
    convex?: ConvexReactClient;
    disposed: boolean;
    private listeners;
    subscribe: (listener: () => void) => () => void;
    getDisposed: () => boolean;
    identity: string;
    generation: number;
    attached: number;
    attachmentRevision: number;
    authObservation: AuthObservation;
    authSession: unknown;
    authRevision: number;
    authListeners: Set<() => void>;
    sessionRefetch?: () => Promise<unknown>;
    timers: Set<number>;
    private deadlines;
    observeExpiry(key: QueryKey, expiry: number): () => void;
    userId?: string;
    signalErrors: Map<string, unknown>;
    pending: Map<string, readonly unknown[]>;
    scheduled?: Promise<void>;
    private scheduledKeys?;
    inFlight: Map<Promise<void>, Set<string>>;
    invalidate(keys: readonly QueryKey[]): Promise<void>;
    refreshResource(key: QueryKey): Promise<{
        data: unknown;
        error: null;
    }>;
    watches: Map<string, {
        stop: () => void;
        listeners: Set<(error: unknown, denied: boolean) => void>;
        read: (listener?: (error: unknown, denied: boolean) => void) => void;
    }>;
    constructor(auth: SessionClient, api: InvalidationApi, features: Features);
    attach(convex: ConvexReactClient): () => void;
    subscribeAuth: (listener: () => void) => () => void;
    getAuthRevision: () => number;
    refreshSession(): Promise<void>;
    waitForAuth(predicate: (observation: AuthObservation) => boolean, signal: AbortSignal, timeout?: number, rejectWhen?: (observation: AuthObservation) => unknown): Promise<AuthObservation>;
    /** Private data belongs to one user session; readiness and token refreshes keep it. */
    setIdentity(identity: Identity): void;
    watch(deps: ResourceDependency[], listener: (error: unknown, denied: boolean) => void): () => void;
    refresh(): Promise<void>;
    dispose(): void;
}
export declare function observeAuth(runtime: CacheRuntime, observation: AuthObservation, refetch?: () => Promise<unknown>, session?: unknown): void;
//# sourceMappingURL=query-cache.d.ts.map