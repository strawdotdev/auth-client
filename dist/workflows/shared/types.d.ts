export type WorkflowError = {
    phase: "validation" | "preparation" | "write" | "synchronization" | "cleanup" | "callback";
    cause: unknown;
    writeSucceeded: boolean;
};
export type WorkflowOutcome<T> = {
    status: "success";
    data: T;
} | {
    status: "error";
    error: WorkflowError;
} | {
    status: "ignored";
    reason: "disabled" | "busy" | "obsolete" | "unavailable";
};
/** `accountRequired`: the session is a guest's (Better Auth anonymous user), not an account's. */
export type WorkflowDisabledReason = {
    code: "disabled" | "busy" | "unavailable" | "recovery" | "accountRequired";
} | {
    code: "policy";
    policyCode: string;
};
export type WorkflowAction<Args extends unknown[] = [], Result = unknown> = {
    run(this: void, ...args: Args): Promise<WorkflowOutcome<Result>>;
    isDisabled: boolean;
    isPending: boolean;
    disabledReason: WorkflowDisabledReason | null;
};
export type WorkflowFeedback = {
    target: WorkflowPendingAction;
    error: unknown;
    recovery: WorkflowAction | null;
    diagnostics: WorkflowError | null;
};
export type WorkflowFeedbackOptions = {
    onError?: (feedback: Omit<WorkflowFeedback, "recovery">) => void;
};
export type WorkflowOperation = "select" | "create" | "update" | "leave" | "delete" | "invite" | "resend" | "accept" | "reject" | "cancel" | "updateMemberRole" | "removeMember" | "revokeSession" | "revokeOtherSessions" | "revokeSessions" | "signIn" | "signUp" | "requestPasswordReset" | "resetPassword" | "sendVerificationEmail" | "updateProfile" | "updateProfileImage" | "changeEmail" | "changePassword" | "reauthenticate" | "signOut" | "signInAsGuest";
export type WorkflowPendingAction = {
    operation: WorkflowOperation;
    organizationId?: string;
    invitationId?: string;
    memberId?: string;
    sessionId?: string;
};
export type WorkflowActionState = {
    feedback: readonly WorkflowFeedback[];
    /** True while any action owned by this workflow is running. */
    isPending: boolean;
    diagnostics: {
        pendingAction: WorkflowPendingAction | null;
        error: WorkflowError | null;
    };
    reset(this: void): void;
};
export type PolicyDecision = {
    allowed: true;
} | {
    allowed: false;
    code: string;
};
export type FormFieldIssue = {
    code: string;
    message?: string;
};
export type FormValidationIssue = FormFieldIssue & {
    cause?: unknown;
};
export type FormFieldErrors<V> = Partial<Record<keyof V, FormFieldIssue>>;
export type WorkflowForm<V, R> = WorkflowActionState & {
    actions: {
        submit: WorkflowAction<[], R>;
    };
    values: Readonly<V>;
    touched: Readonly<Partial<Record<keyof V, boolean>>>;
    fieldErrors: Readonly<FormFieldErrors<V>>;
    validationError: FormValidationIssue | null;
    isDirty: boolean;
    isValidating: boolean;
    hasServerChanges: boolean;
    field<K extends keyof V>(this: void, name: K): {
        name: K;
        value: V[K];
        onChange(this: void, value: V[K]): void;
        onBlur(this: void): void;
        error: {
            code: string;
            message?: string;
        } | undefined;
        isDisabled: boolean;
    };
};
//# sourceMappingURL=types.d.ts.map