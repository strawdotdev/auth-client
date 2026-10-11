import type { CacheRuntime } from "../../cache/query-cache.js";
import { type ActionExecution, type WorkflowActionController } from "./action.js";
import type { WorkflowAction, WorkflowFeedback, WorkflowFeedbackOptions, WorkflowPendingAction } from "./types.js";
type Availability = "guest" | "authenticated" | "session" | "settled";
/** Coordinates operations whose successful result intentionally changes session identity. */
export declare function useIdentityAction(runtime: CacheRuntime, scope: string, availability: Availability, enabled?: boolean, options?: WorkflowFeedbackOptions, lifecycleOptions?: {
    onRetire?: () => void;
}): WorkflowActionController;
/** An identity workflow's feedback, with read-only recovery once its write succeeded. */
export declare function withRecoveryFeedback<T extends {
    reset(): void;
}>(state: T, action: WorkflowActionController, target: WorkflowPendingAction, recovery: WorkflowAction, hasReceipt: boolean): T & {
    feedback: WorkflowFeedback[];
};
/** Finishes a written identity operation again (synchronization, cleanup) without its write. */
export declare function recoveryAction(action: WorkflowActionController, target: WorkflowPendingAction, finish: (transaction: ActionExecution) => Promise<unknown>): WorkflowAction;
export {};
//# sourceMappingURL=identity-action.d.ts.map