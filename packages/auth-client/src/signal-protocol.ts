import type { FunctionReference } from "convex/server";

/** Shared wire contract: no dependency on React or frontend workflow types. */
export type Features = {
  organization?: boolean;
  sessions?: boolean;
  authentication?: boolean;
  account?: boolean;
  /** Client-only: keep a Better Auth anonymous session for every visitor. */
  guests?: boolean;
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
  signals: FunctionReference<
    "query",
    "public",
    { dependencies: ResourceDependency[] },
    InvalidationSnapshot
  >;
};
