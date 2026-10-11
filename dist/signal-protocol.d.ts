import type { FunctionReference } from "convex/server";
/** Shared wire contract: no dependency on React or frontend workflow types. */
export type Features = {
    organization?: boolean;
    sessions?: boolean;
    authentication?: boolean;
    account?: boolean;
    /** Client-only: keep a Better Auth anonymous session for every visitor. */
    guests?: boolean;
    /**
     * Client-only: several accounts signed in on one device, each context (a browser tab) acting as
     * one of them (Better Auth's `multiSession()` and `bearer()`, with `deviceAccounts()`).
     */
    accounts?: boolean;
};
export type ResourceDependency = {
    scope: "directory" | "organization" | "profile" | "invitations" | "sessions" | "invitation";
    subject: string;
    organizationId?: string;
};
export type InvalidationSnapshot = {
    protocol: 1;
    features: Features;
    userId: string;
    denied: boolean;
    revisions: number[];
};
export type InvalidationApi = {
    signals: FunctionReference<"query", "public", {
        dependencies: ResourceDependency[];
    }, InvalidationSnapshot>;
};
//# sourceMappingURL=signal-protocol.d.ts.map