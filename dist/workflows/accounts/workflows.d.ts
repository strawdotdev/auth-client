import type { CacheRuntime } from "../../cache/query-cache.js";
import type { AccountsClient, Result } from "../../client/types.js";
import type { WorkflowFeedbackOptions, WorkflowPendingAction } from "../shared/types.js";
type Callback<T> = ((value: T) => void | Promise<void>) | undefined;
type Options = WorkflowFeedbackOptions & {
    enabled?: boolean;
    onSwitched?: Callback<{
        outcome: "switched";
        userId: string;
        sessionId: string;
    }>;
    onSignedOut?: Callback<{
        outcome: "signedOut";
        userId: string;
    }>;
};
export type AccountsReads = {
    useDeviceAccounts(query?: undefined, options?: {
        enabled?: boolean;
    }): Result<unknown>;
};
export declare function createAccountsWorkflows(auth: AccountsClient, runtime: CacheRuntime, reads: AccountsReads): {
    useAccounts: (options?: Options) => {
        currentUserId: string | undefined;
        account: (userId: string) => {
            switch: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    userId: string;
                    sessionId: string;
                    outcome: "switched";
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            signOut: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "signedOut";
                    userId: string;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        actions: {
            signOutAll: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "signedOut";
                    userId: string;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
        reset: () => void;
        isLoading: boolean;
        queryError: unknown;
        data: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    } & {
        feedback: import("../shared/types.js").WorkflowFeedback[];
    };
    Accounts: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
        onSwitched?: Callback<{
            outcome: "switched";
            userId: string;
            sessionId: string;
        }>;
        onSignedOut?: Callback<{
            outcome: "signedOut";
            userId: string;
        }>;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useAccountsContext: () => {
        currentUserId: string | undefined;
        account: (userId: string) => {
            switch: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    userId: string;
                    sessionId: string;
                    outcome: "switched";
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            signOut: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "signedOut";
                    userId: string;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        actions: {
            signOutAll: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "signedOut";
                    userId: string;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
        reset: () => void;
        isLoading: boolean;
        queryError: unknown;
        data: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    } & {
        feedback: import("../shared/types.js").WorkflowFeedback[];
    };
};
export {};
//# sourceMappingURL=workflows.d.ts.map