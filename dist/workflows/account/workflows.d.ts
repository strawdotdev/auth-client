import { type ZodType } from "zod";
import type { CacheRuntime } from "../../cache/query-cache.js";
import type { AccountClient } from "../../client/types.js";
import { type Values } from "../shared/action.js";
import { type FormOptions } from "../shared/form.js";
import type { WorkflowAction, WorkflowFeedback } from "../shared/types.js";
import type { CurrentUserBinding } from "./types.js";
type Options = FormOptions & Record<string, unknown>;
export declare function createAccountWorkflows<U extends {
    email: string;
}>(auth: AccountClient, runtime: CacheRuntime, currentUser: CurrentUserBinding<U>): {
    [x: string]: ((schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<Options, {
        user: U | undefined;
        isLoading: boolean;
        queryError: unknown;
        form: {
            feedback: WorkflowFeedback[];
            actions: {
                submit: {
                    run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                    isDisabled: boolean;
                    isPending: boolean;
                    disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
                };
            };
            isPending: boolean;
            values: {
                [x: string]: unknown;
            };
            hasServerChanges: boolean;
            touched: {
                [k: string]: boolean | undefined;
            };
            fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
            validationError: {
                cause?: unknown;
                code: string;
                message?: string;
            } | null;
            isDirty: boolean;
            isValidating: boolean;
            field: (name: string) => {
                name: string;
                value: unknown;
                error: import("../shared/types.js").FormFieldIssue | undefined;
                isDisabled: boolean;
                onChange(value: unknown): void;
                onBlur(): void;
            };
            reset: () => void;
            diagnostics: {
                pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
                error: import("../shared/types.js").WorkflowError | null;
            };
        } | null;
        actions: {
            update: WorkflowAction<[values: Values], unknown>;
            updateImage: WorkflowAction<[image: string | null], unknown>;
        };
        feedback: WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
        reset: () => void;
    }>) | ((props: import("../shared/types.js").WorkflowFeedbackOptions & {
        initialValues: {
            [x: string]: unknown;
        };
        schema?: ZodType<{
            [x: string]: unknown;
        }, {
            [x: string]: unknown;
        }>;
        enabled?: boolean;
        validate?: (values: Readonly<{
            [x: string]: unknown;
        }>) => import("../shared/types.js").FormFieldErrors<{
            [x: string]: unknown;
        }> | Promise<import("../shared/types.js").FormFieldErrors<{
            [x: string]: unknown;
        }>>;
    } & Record<string, unknown> & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode) | ((options: Options) => {
        user: U | undefined;
        isLoading: boolean;
        queryError: unknown;
        form: {
            feedback: WorkflowFeedback[];
            actions: {
                submit: {
                    run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                    isDisabled: boolean;
                    isPending: boolean;
                    disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
                };
            };
            isPending: boolean;
            values: {
                [x: string]: unknown;
            };
            hasServerChanges: boolean;
            touched: {
                [k: string]: boolean | undefined;
            };
            fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
            validationError: {
                cause?: unknown;
                code: string;
                message?: string;
            } | null;
            isDirty: boolean;
            isValidating: boolean;
            field: (name: string) => {
                name: string;
                value: unknown;
                error: import("../shared/types.js").FormFieldIssue | undefined;
                isDisabled: boolean;
                onChange(value: unknown): void;
                onBlur(): void;
            };
            reset: () => void;
            diagnostics: {
                pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
                error: import("../shared/types.js").WorkflowError | null;
            };
        } | null;
        actions: {
            update: WorkflowAction<[values: Values], unknown>;
            updateImage: WorkflowAction<[image: string | null], unknown>;
        };
        feedback: WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
        reset: () => void;
    }) | ((schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<Options, {
        actions: {
            submit: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: WorkflowFeedback[];
        isPending: boolean;
        values: {
            [x: string]: unknown;
        };
        hasServerChanges: boolean;
        touched: {
            [k: string]: boolean | undefined;
        };
        fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
        validationError: {
            cause?: unknown;
            code: string;
            message?: string;
        } | null;
        isDirty: boolean;
        isValidating: boolean;
        field: (name: string) => {
            name: string;
            value: unknown;
            error: import("../shared/types.js").FormFieldIssue | undefined;
            isDisabled: boolean;
            onChange(value: unknown): void;
            onBlur(): void;
        };
        reset: () => void;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
    }>) | ((options: Options) => {
        actions: {
            submit: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: WorkflowFeedback[];
        isPending: boolean;
        values: {
            [x: string]: unknown;
        };
        hasServerChanges: boolean;
        touched: {
            [k: string]: boolean | undefined;
        };
        fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
        validationError: {
            cause?: unknown;
            code: string;
            message?: string;
        } | null;
        isDirty: boolean;
        isValidating: boolean;
        field: (name: string) => {
            name: string;
            value: unknown;
            error: import("../shared/types.js").FormFieldIssue | undefined;
            isDisabled: boolean;
            onChange(value: unknown): void;
            onBlur(): void;
        };
        reset: () => void;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
    }) | ((schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<Options, {
        actions: {
            submit: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: WorkflowFeedback[];
        isPending: boolean;
        values: {
            [x: string]: unknown;
        };
        hasServerChanges: boolean;
        touched: {
            [k: string]: boolean | undefined;
        };
        fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
        validationError: {
            cause?: unknown;
            code: string;
            message?: string;
        } | null;
        isDirty: boolean;
        isValidating: boolean;
        field: (name: string) => {
            name: string;
            value: unknown;
            error: import("../shared/types.js").FormFieldIssue | undefined;
            isDisabled: boolean;
            onChange(value: unknown): void;
            onBlur(): void;
        };
        reset: () => void;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
    }>) | ((schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<Options | undefined, {
        feedback: WorkflowFeedback[];
        actions: {
            submit: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        isPending: boolean;
        values: {
            [x: string]: unknown;
        };
        hasServerChanges: boolean;
        touched: {
            [k: string]: boolean | undefined;
        };
        fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
        validationError: {
            cause?: unknown;
            code: string;
            message?: string;
        } | null;
        isDirty: boolean;
        isValidating: boolean;
        field: (name: string) => {
            name: string;
            value: unknown;
            error: import("../shared/types.js").FormFieldIssue | undefined;
            isDisabled: boolean;
            onChange(value: unknown): void;
            onBlur(): void;
        };
        reset: () => void;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
    }>) | ((props: import("../shared/types.js").WorkflowFeedbackOptions & {
        initialValues: {
            [x: string]: unknown;
        };
        schema?: ZodType<{
            [x: string]: unknown;
        }, {
            [x: string]: unknown;
        }>;
        enabled?: boolean;
        validate?: (values: Readonly<{
            [x: string]: unknown;
        }>) => import("../shared/types.js").FormFieldErrors<{
            [x: string]: unknown;
        }> | Promise<import("../shared/types.js").FormFieldErrors<{
            [x: string]: unknown;
        }>>;
    } & Record<string, unknown> & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode) | ((options: Options | undefined) => {
        feedback: WorkflowFeedback[];
        actions: {
            submit: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        isPending: boolean;
        values: {
            [x: string]: unknown;
        };
        hasServerChanges: boolean;
        touched: {
            [k: string]: boolean | undefined;
        };
        fieldErrors: Partial<Record<string, import("../shared/types.js").FormFieldIssue>>;
        validationError: {
            cause?: unknown;
            code: string;
            message?: string;
        } | null;
        isDirty: boolean;
        isValidating: boolean;
        field: (name: string) => {
            name: string;
            value: unknown;
            error: import("../shared/types.js").FormFieldIssue | undefined;
            isDisabled: boolean;
            onChange(value: unknown): void;
            onBlur(): void;
        };
        reset: () => void;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: import("../shared/types.js").WorkflowError | null;
        };
    });
};
export {};
//# sourceMappingURL=workflows.d.ts.map