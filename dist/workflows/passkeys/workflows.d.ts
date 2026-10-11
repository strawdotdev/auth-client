import type { CacheRuntime } from "../../cache/query-cache.js";
import type { Result } from "../../client/types.js";
import type { WorkflowFeedbackOptions } from "../shared/types.js";
type Write = (body: unknown, options?: {
    throw: true;
    retry: 0;
}) => Promise<unknown>;
export type PasskeyReads = {
    useListPasskeys(query?: undefined, options?: {
        enabled?: boolean;
    }): Result<unknown>;
    passkey: {
        addPasskey: Write;
        deletePasskey: Write;
    };
};
type Options = WorkflowFeedbackOptions & {
    enabled?: boolean;
    onAdded?: (result: {
        passkey: unknown;
    }) => void | Promise<void>;
    onDeleted?: (result: {
        passkeyId: string;
    }) => void | Promise<void>;
};
/** The account's passkeys: the list, adding one (the browser makes it) and removing one. */
export declare function createPasskeyWorkflows(client: PasskeyReads, runtime: CacheRuntime): {
    usePasskeys: (options?: Options) => {
        passkey: (passkeyId: string) => {
            remove: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "deleted";
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        actions: {
            add: {
                run: (body?: {
                    name?: string;
                }) => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "cancelled";
                    passkey?: undefined;
                } | {
                    outcome: "added";
                    passkey: unknown;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        /** Adding a passkey needs a recent sign-in; reauthenticate, then add again. */
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
    Passkeys: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
        onAdded?: (result: {
            passkey: unknown;
        }) => void | Promise<void>;
        onDeleted?: (result: {
            passkeyId: string;
        }) => void | Promise<void>;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    usePasskeysContext: () => {
        passkey: (passkeyId: string) => {
            remove: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "deleted";
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        actions: {
            add: {
                run: (body?: {
                    name?: string;
                }) => Promise<import("../shared/types.js").WorkflowOutcome<{
                    outcome: "cancelled";
                    passkey?: undefined;
                } | {
                    outcome: "added";
                    passkey: unknown;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        /** Adding a passkey needs a recent sign-in; reauthenticate, then add again. */
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