import { type ZodType } from "zod";
import type { CacheRuntime } from "../../cache/query-cache.js";
import type { Result } from "../../client/types.js";
import { type FormOptions } from "../shared/form.js";
import { type Values } from "../shared/action.js";
import type { OrganizationScope } from "./types.js";
import type { PolicyDecision, WorkflowError, WorkflowFeedbackOptions } from "../shared/types.js";
type Write = (body: Values, options: {
    throw: true;
    retry: 0;
}) => Promise<unknown>;
export type OrganizationReads = {
    useListOrganizations(query?: undefined, options?: {
        enabled?: boolean;
    }): Result<unknown>;
    useOrganization(query: Values, options?: {
        enabled?: boolean;
    }): Result<unknown>;
    useMemberRole(query: Values, options?: {
        enabled?: boolean;
    }): Result<unknown>;
    useListMembers(query: Values, options?: {
        enabled?: boolean;
    }): Result<unknown>;
    organization: Record<"create" | "update" | "leave" | "delete" | "updateMemberRole" | "removeMember", Write>;
};
type Completion = {
    operation: "create" | "update" | "leave" | "delete";
    organizationId: string;
    organization?: Values;
};
type Callback = (value: Completion) => void | Promise<void>;
type ScopeOptions = OrganizationScope & WorkflowFeedbackOptions & {
    enabled?: boolean;
};
type AuthDataContext = {
    organization: Values;
    actorId: string;
    role: string;
};
type SettingsOptions = ScopeOptions & Omit<FormOptions, "initialValues"> & {
    getInitialValues(organization: Values): Values;
    policy?: Partial<Record<"update" | "leave" | "delete", (context: AuthDataContext) => PolicyDecision>>;
    beforeDelete?: (context: {
        organizationId: string;
        signal: AbortSignal;
    }) => Promise<void>;
    onUpdated?: Callback;
    onLeft?: Callback;
    onDeleted?: Callback;
};
type MemberContext = AuthDataContext & {
    member: Values;
};
type MembersOptions = ScopeOptions & {
    pageSize: number;
    query?: Values;
    policy?: {
        updateMemberRole?: (context: MemberContext & {
            nextRole: unknown;
        }) => PolicyDecision;
        removeMember?: (context: MemberContext) => PolicyDecision;
        assignableRoles?: (context: MemberContext) => readonly unknown[];
    };
    onRoleUpdated?: (value: {
        memberId: string;
        result: unknown;
    }) => void | Promise<void>;
    onRemoved?: (value: {
        memberId: string;
        result: unknown;
    }) => void | Promise<void>;
};
export declare function createOrganizationWorkflows(client: OrganizationReads, runtime: CacheRuntime): {
    useOrganizationDirectory: (options?: WorkflowFeedbackOptions & {
        enabled?: boolean;
        selection?: OrganizationScope;
        fallback?: "none" | "first";
        onSelect?: (organization: Values) => void | Promise<void>;
    }) => {
        organization: Values | null;
        status: string;
        select: (id: string) => {
            run: () => Promise<import("../shared/types.js").WorkflowOutcome<Values>>;
            isDisabled: boolean;
            isPending: boolean;
            disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
        };
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
        isLoading: boolean;
        queryError: unknown;
        data: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    };
    useOrganizationCreateForm: (options: FormOptions & {
        keepCurrentActiveOrganization?: boolean;
        onCreated?: Callback;
    }) => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        refetch: () => Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
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
            error: WorkflowError | null;
        };
    };
    useOrganizationSettings: (options: SettingsOptions) => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        actions: {
            update: {
                run: (data: Values) => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            leave: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            delete: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        organization: Values | undefined;
        role: string | undefined;
        form: {
            actions: {
                submit: {
                    run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                    isDisabled: boolean;
                    isPending: boolean;
                    disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
                };
            };
            feedback: import("../shared/types.js").WorkflowFeedback[];
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
                error: WorkflowError | null;
            };
        } | null;
        hasServerChanges: boolean;
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        refetch: () => Promise<void>;
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
    };
    useOrganizationMembers: (options: MembersOptions) => {
        refetch: () => Promise<void>;
        organization: Values | undefined;
        role: string | undefined;
        members: Values[];
        total: number;
        page: number;
        pageSize: number;
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        setPage: (next: number) => void;
        nextPage: () => void;
        previousPage: () => void;
        member: (memberId: string) => {
            assignableRoles: readonly unknown[] | undefined;
            remove: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            updateRole: (role: unknown) => {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
    };
    defineOrganizationCreateForm: (schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<WorkflowFeedbackOptions & {
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
    } & {
        keepCurrentActiveOrganization?: boolean;
        onCreated?: Callback;
    }, {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        refetch: () => Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
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
            error: WorkflowError | null;
        };
    }>;
    defineOrganizationSettings: (schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<SettingsOptions, {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        actions: {
            update: {
                run: (data: Values) => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            leave: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            delete: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        organization: Values | undefined;
        role: string | undefined;
        form: {
            actions: {
                submit: {
                    run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                    isDisabled: boolean;
                    isPending: boolean;
                    disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
                };
            };
            feedback: import("../shared/types.js").WorkflowFeedback[];
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
                error: WorkflowError | null;
            };
        } | null;
        hasServerChanges: boolean;
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        refetch: () => Promise<void>;
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
    }>;
    OrganizationDirectory: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
        selection?: OrganizationScope;
        fallback?: "none" | "first";
        onSelect?: (organization: Values) => void | Promise<void>;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useOrganizationDirectoryContext: () => {
        organization: Values | null;
        status: string;
        select: (id: string) => {
            run: () => Promise<import("../shared/types.js").WorkflowOutcome<Values>>;
            isDisabled: boolean;
            isPending: boolean;
            disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
        };
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
        isLoading: boolean;
        queryError: unknown;
        data: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    };
    OrganizationCreateForm: (props: WorkflowFeedbackOptions & {
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
    } & {
        keepCurrentActiveOrganization?: boolean;
        onCreated?: Callback;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useOrganizationCreateFormContext: () => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        refetch: () => Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
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
            error: WorkflowError | null;
        };
    };
    OrganizationSettings: (props: SettingsOptions & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useOrganizationSettingsContext: () => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        actions: {
            update: {
                run: (data: Values) => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            leave: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            delete: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<Completion>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        organization: Values | undefined;
        role: string | undefined;
        form: {
            actions: {
                submit: {
                    run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                    isDisabled: boolean;
                    isPending: boolean;
                    disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
                };
            };
            feedback: import("../shared/types.js").WorkflowFeedback[];
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
                error: WorkflowError | null;
            };
        } | null;
        hasServerChanges: boolean;
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        refetch: () => Promise<void>;
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
    };
    OrganizationMembers: (props: MembersOptions & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useOrganizationMembersContext: () => {
        refetch: () => Promise<void>;
        organization: Values | undefined;
        role: string | undefined;
        members: Values[];
        total: number;
        page: number;
        pageSize: number;
        isLoading: boolean;
        isFetching: boolean;
        queryError: unknown;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        setPage: (next: number) => void;
        nextPage: () => void;
        previousPage: () => void;
        member: (memberId: string) => {
            assignableRoles: readonly unknown[] | undefined;
            remove: {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            updateRole: (role: unknown) => {
                run: () => Promise<import("../shared/types.js").WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
        feedback: import("../shared/types.js").WorkflowFeedback[];
        isPending: boolean;
        diagnostics: {
            pendingAction: import("../shared/types.js").WorkflowPendingAction | null;
            error: WorkflowError | null;
        };
        reset: () => void;
    };
};
export {};
//# sourceMappingURL=workflows.d.ts.map