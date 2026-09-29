import { type FormOptions } from "./form.js";
import type { CacheRuntime } from "../../cache/query-cache.js";
import type { Result } from "../../client/types.js";
import type { WorkflowOutcome, WorkflowError, FormFieldErrors } from "../shared/types.js";
import type { ZodType } from "zod";
import type { WorkflowFeedbackOptions } from "../shared/types.js";
type Values = Record<string, unknown>;
export type InvitationReads = {
    useListOrganizations(query?: undefined, options?: Options): Result<unknown>;
    useListUserInvitations(query?: undefined, options?: Options): Result<unknown>;
    useInvitation(query: {
        id: string;
    }, options?: Options): Result<unknown>;
    useListInvitations(query: {
        organizationId: string;
    }, options?: Options): Result<unknown>;
    organization: {
        acceptInvitation: InvitationWrite;
        rejectInvitation: InvitationWrite;
        cancelInvitation: InvitationWrite;
        inviteMember(body: Values & {
            organizationId: string;
            resend: boolean;
        }, options: WriteOptions): Promise<unknown>;
    };
};
type WriteOptions = {
    throw: true;
    retry: 0;
};
type InvitationWrite = (body: {
    invitationId: string;
}, options: WriteOptions) => Promise<unknown>;
type Callback<T = unknown> = (data: T) => void | Promise<void>;
type Options = WorkflowFeedbackOptions & {
    enabled?: boolean;
};
type Accepted = {
    invitationId: string;
    organization: unknown;
};
type Responses = Options & {
    onAccepted?: Callback<Accepted>;
    onRejected?: Callback<{
        invitationId: string;
        result: unknown;
    }>;
};
type OutgoingOptions = Options & {
    organizationId: string;
    onCancelled?: Callback<{
        invitationId: string;
        result: unknown;
    }>;
    onResent?: Callback;
};
export declare function createInvitationWorkflows(client: InvitationReads, runtime: CacheRuntime): {
    useInvitationForm: (options: FormOptions) => {
        actions: {
            submit: {
                run: () => Promise<WorkflowOutcome<unknown>>;
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
    };
    defineInvitationForm: (schema: ZodType<Values, Values>) => import("../shared/root.js").WorkflowDefinition<FormOptions, {
        actions: {
            submit: {
                run: () => Promise<WorkflowOutcome<unknown>>;
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
    }>;
    useReceivedInvitations: (options?: Responses) => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        invitation: (invitationId: string) => {
            accept: {
                run: () => Promise<WorkflowOutcome<{
                    invitationId: string;
                    organization: Values;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            reject: {
                run: () => Promise<WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
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
    useInvitationResponse: (options: Responses & {
        invitationId: string;
    }) => {
        invitation: unknown;
        actions: {
            accept: {
                run: () => Promise<WorkflowOutcome<{
                    invitationId: string;
                    organization: Values;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            reject: {
                run: () => Promise<WorkflowOutcome<unknown>>;
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
        isLoading: boolean;
        queryError: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    };
    useOrganizationInvitations: (options: OutgoingOptions) => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        invitation: (invitationId: string) => {
            cancel: {
                run: () => Promise<WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            resend: {
                run: () => Promise<WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
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
    InvitationForm: (props: WorkflowFeedbackOptions & {
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
        }>) => FormFieldErrors<{
            [x: string]: unknown;
        }> | Promise<FormFieldErrors<{
            [x: string]: unknown;
        }>>;
    } & {
        organizationId: string;
        mode?: "invite" | "resend";
        onInvited?: (result: unknown) => void | Promise<void>;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useInvitationFormContext: () => {
        actions: {
            submit: {
                run: () => Promise<WorkflowOutcome<unknown>>;
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
    };
    ReceivedInvitations: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
    } & {
        onAccepted?: Callback<Accepted>;
        onRejected?: Callback<{
            invitationId: string;
            result: unknown;
        }>;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useReceivedInvitationsContext: () => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        invitation: (invitationId: string) => {
            accept: {
                run: () => Promise<WorkflowOutcome<{
                    invitationId: string;
                    organization: Values;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            reject: {
                run: () => Promise<WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
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
    InvitationResponse: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
    } & {
        onAccepted?: Callback<Accepted>;
        onRejected?: Callback<{
            invitationId: string;
            result: unknown;
        }>;
    } & {
        invitationId: string;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useInvitationResponseContext: () => {
        invitation: unknown;
        actions: {
            accept: {
                run: () => Promise<WorkflowOutcome<{
                    invitationId: string;
                    organization: Values;
                }>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            reject: {
                run: () => Promise<WorkflowOutcome<unknown>>;
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
        isLoading: boolean;
        queryError: unknown;
        isFetching: boolean;
        refetch(): Promise<import("../../client/types.js").RefetchResult<unknown> | undefined>;
    };
    OrganizationInvitations: (props: WorkflowFeedbackOptions & {
        enabled?: boolean;
    } & {
        organizationId: string;
        onCancelled?: Callback<{
            invitationId: string;
            result: unknown;
        }>;
        onResent?: Callback;
    } & {
        children?: import("react").ReactNode;
    }) => import("react").ReactNode;
    useOrganizationInvitationsContext: () => {
        feedback: import("../shared/types.js").WorkflowFeedback[];
        invitation: (invitationId: string) => {
            cancel: {
                run: () => Promise<WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
            resend: {
                run: () => Promise<WorkflowOutcome<unknown>>;
                isDisabled: boolean;
                isPending: boolean;
                disabledReason: import("../shared/types.js").WorkflowDisabledReason | null;
            };
        };
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
};
export {};
//# sourceMappingURL=workflows.d.ts.map