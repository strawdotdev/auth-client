import type { CacheRuntime } from "../../cache/query-cache.js";
import { type ActionExecution } from "./action.js";
export declare const identityOperationObsolete: unique symbol;
export type ExpectedIdentity = {
    userId?: string;
    token?: string;
};
export declare function resultIdentity(result: unknown): ExpectedIdentity;
export declare const textValue: (value: unknown) => string;
/**
 * Waits for the expected session. `previous` is the identity being left: its session may still be
 * observed for a moment (a guest signing in is linked, not replaced by an unrelated account).
 */
export declare function synchronizeAuthenticated(runtime: CacheRuntime, transaction: ActionExecution, expected: ExpectedIdentity, previous?: ExpectedIdentity): Promise<{
    userId: string;
    sessionId: string;
}>;
//# sourceMappingURL=identity-sync.d.ts.map