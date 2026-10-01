import type { CacheRuntime } from "../../cache/query-cache.js";
import type { WorkflowError, WorkflowOutcome, WorkflowPendingAction, PolicyDecision, WorkflowDisabledReason, WorkflowFeedback, WorkflowFeedbackOptions } from "./types.js";
export type Values = Record<string, unknown>;
export declare const asRecord: (value: unknown) => Values | undefined;
export declare const asRecords: (value: unknown) => Values[];
/** Better Auth's error code (`INVALID_EMAIL_OR_PASSWORD`, ...) from a thrown or returned error. */
export declare function getAuthErrorCode(cause: unknown): string | undefined;
export declare const ignored: (reason: "disabled" | "busy" | "obsolete" | "unavailable") => WorkflowOutcome<never>;
declare const handledFailure: unique symbol;
type HandledFailure = {
    [handledFailure]: true;
    cause: unknown;
};
/** Marks a failure already represented by workflow-owned state, such as form validation. */
export declare const handledWorkflowFailure: (cause: unknown) => HandledFailure;
export declare function classifyWorkflowFailure(cause: unknown): {
    cause: unknown;
    isHandled: boolean;
};
export declare function requireAvailable(condition: unknown): asserts condition;
export declare function enforcePolicy(decision: PolicyDecision): void;
export declare const allowed: PolicyDecision;
export declare const denied: (code: string) => PolicyDecision;
export declare const policyReason: (decision: PolicyDecision) => WorkflowDisabledReason | null;
export declare function useCommittedRef<T>(value: T): import("react").RefObject<T>;
export declare function getActionState(action: WorkflowActionController): {
    feedback: WorkflowFeedback[];
    isPending: boolean;
    diagnostics: {
        pendingAction: WorkflowPendingAction | null;
        error: WorkflowError | null;
    };
    reset: () => void;
};
export type ActionExecution = {
    write(fn: () => Promise<unknown>, target?: string | Partial<WorkflowPendingAction>): Promise<unknown>;
    current(): boolean;
    complete(callback: () => void | Promise<void>): Promise<void>;
    phase(phase: WorkflowError["phase"]): void;
    signal: AbortSignal;
};
export type WorkflowActionController = {
    control(target: WorkflowPendingAction, reason?: WorkflowDisabledReason | null): {
        isDisabled: boolean;
        isPending: boolean;
        disabledReason: WorkflowDisabledReason | null;
    };
    feedback(recoveries?: WorkflowFeedback[]): WorkflowFeedback[];
    readonly owner: symbol;
    readonly actorId?: string;
    readonly available: boolean;
    readonly isBusy: boolean;
    readonly pendingAction: WorkflowPendingAction | null;
    readonly error: WorkflowError | null;
    current(): boolean;
    busy(): boolean;
    canEdit(): boolean;
    run<T>(pending: WorkflowPendingAction, work: (transaction: ActionExecution) => Promise<T>, alreadyWritten?: boolean): Promise<WorkflowOutcome<T>>;
    reset(): void;
};
type OperationState = {
    owner: symbol;
    pending: WorkflowPendingAction | null;
    error: WorkflowError | null;
    target?: WorkflowPendingAction;
};
export declare function operationFeedback(state: OperationState | undefined, recoveries: WorkflowFeedback[]): WorkflowFeedback[];
export declare function actionControl(available: boolean, pending: WorkflowPendingAction | null | undefined, target: WorkflowPendingAction, conflicts: boolean, reason: WorkflowDisabledReason | null, unavailableReason?: WorkflowDisabledReason): {
    isDisabled: boolean;
    isPending: boolean;
    disabledReason: WorkflowDisabledReason | null;
};
/** TanStack observes writes; this coordinator owns only locks and guarded continuations. */
export declare function useWorkflowAction(runtime: CacheRuntime, scope: string, enabled?: boolean, options?: WorkflowFeedbackOptions): {
    control: (target: WorkflowPendingAction, reason?: WorkflowDisabledReason | null) => {
        isDisabled: boolean;
        isPending: boolean;
        disabledReason: WorkflowDisabledReason | null;
    };
    feedback: (recoveries?: WorkflowFeedback[]) => WorkflowFeedback[];
    owner: symbol;
    actorId: string | undefined;
    available: boolean;
    current: () => boolean;
    busy: () => boolean;
    canEdit: () => boolean;
    run: <T>(pending: WorkflowPendingAction, work: (transaction: ActionExecution) => Promise<T>, alreadyWritten?: boolean) => Promise<WorkflowOutcome<T>>;
    reset: () => void;
    isBusy: boolean;
    pendingAction: WorkflowPendingAction | null;
    error: WorkflowError | null;
};
export {};
//# sourceMappingURL=action.d.ts.map