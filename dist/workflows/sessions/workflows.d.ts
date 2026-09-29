import type { CacheRuntime } from "../../cache/query-cache.js";
import type { Result } from "../../client/types.js";
import type { WorkflowFeedbackOptions } from "../shared/types.js";
type Operation = "revokeSession" | "revokeOtherSessions" | "revokeSessions";
export type SessionReads = {
    useListSessions(query?: undefined, options?: {
        enabled?: boolean;
    }): Result<unknown>;
} & Record<Operation, (body: {
    token?: string;
}, options: {
    throw: true;
    retry: 0;
}) => Promise<unknown>>;
type Options = WorkflowFeedbackOptions & {
    enabled?: boolean;
    onRevoked?: (result: {
        operation: Operation;
        sessionId?: string;
        result: unknown;
    }) => void | Promise<void>;
};
export declare function createSessionWorkflows(client: SessionReads, runtime: CacheRuntime): {
    useSessions: (options?: Options) => {
        session: (sessionId: string) => {
            revoke: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        actions: {
            revokeOthers: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            revokeAll: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        currentSession: {
            id: string;
            token?: string;
        } | undefined;
        currentSessionId: string | undefined;
        needsFreshSession: boolean;
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
        reset: () => void;
        isLoading: boolean;
        queryError: unknown;
        data: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    };
    Sessions: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
        onRevoked?: (result: {
            operation: Operation;
            sessionId?: string;
            result: unknown;
        }) => void | Promise<void>;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useSessionsContext: () => {
        session: (sessionId: string) => {
            revoke: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        actions: {
            revokeOthers: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            revokeAll: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        currentSession: {
            id: string;
            token?: string;
        } | undefined;
        currentSessionId: string | undefined;
        needsFreshSession: boolean;
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
        reset: () => void;
        isLoading: boolean;
        queryError: unknown;
        data: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    };
};
export {};
//# sourceMappingURL=workflows.d.ts.map