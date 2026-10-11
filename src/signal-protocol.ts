import type { FunctionReference } from "convex/server";

/** Shared wire contract: no dependency on React or frontend workflow types. */
export type Features = {
  organization?: boolean;
  sessions?: boolean;
  authentication?: boolean;
  account?: boolean;
  /**
   * Client-only: Better Auth anonymous sessions (guests). `true` keeps one for every visitor;
   * `"on-demand"` (with `accounts`) makes a visitor a guest only through `switchToGuest`.
   */
  guests?: boolean | "on-demand";
  /**
   * Client-only: several accounts signed in on one device, each context (a browser tab) acting as
   * one of them (Better Auth's `multiSession()` and `bearer()`, with `deviceAccounts()`).
   */
  accounts?: boolean;
  /** Passkeys beside the password (Better Auth's `passkey()` plugin): signing in and managing them. */
  passkeys?: boolean;
};
export type ResourceDependency = {
  scope:
    | "directory"
    | "organization"
    | "profile"
    | "invitations"
    | "sessions"
    | "invitation"
    | "passkeys";
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
