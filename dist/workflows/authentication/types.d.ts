import type { z } from "zod";
import type { AuthenticationClient } from "../../client/types.js";
import type { WorkflowDefinition } from "../shared/root.js";
import type { EndpointValues, WorkflowCallback, WorkflowFormOptions, WorkflowFormSchema, WorkflowRootComponent } from "../shared/type-contracts.js";
import type { WorkflowAction, WorkflowActionState, WorkflowFeedbackOptions, WorkflowForm } from "../shared/types.js";
export type AuthenticatedCompletion = {
    outcome: "authenticated";
    userId: string;
    sessionId: string;
    /** The guest (Better Auth anonymous user) this sign-in or sign-up was linked from. */
    guestUserId?: string;
};
export type SignInValues<C extends AuthenticationClient> = EndpointValues<Parameters<C["signIn"]["email"]>[0]>;
export type SignInCompletion<_C extends AuthenticationClient> = AuthenticatedCompletion | {
    outcome: "verificationRequired";
    email: string;
};
export type SignInFormOptions<C extends AuthenticationClient> = WorkflowFormOptions<SignInValues<C>> & {
    schema?: never;
    initialValues: SignInValues<C>;
    onAuthenticated?: WorkflowCallback<Extract<SignInCompletion<C>, {
        outcome: "authenticated";
    }>>;
    onVerificationRequired?: WorkflowCallback<Extract<SignInCompletion<C>, {
        outcome: "verificationRequired";
    }>>;
};
export type SignUpValues<C extends AuthenticationClient> = EndpointValues<Parameters<C["signUp"]["email"]>[0], "callbackURL">;
export type SignUpCompletion<_C extends AuthenticationClient> = AuthenticatedCompletion | {
    outcome: "verificationRequired";
    email: string;
};
export type SignUpFormOptions<C extends AuthenticationClient> = WorkflowFormOptions<SignUpValues<C>> & {
    schema?: never;
    initialValues: SignUpValues<C>;
    callbackURL?: string;
    onAuthenticated?: WorkflowCallback<Extract<SignUpCompletion<C>, {
        outcome: "authenticated";
    }>>;
    onVerificationRequired?: WorkflowCallback<Extract<SignUpCompletion<C>, {
        outcome: "verificationRequired";
    }>>;
};
export type PasswordResetRequestValues<C extends AuthenticationClient> = EndpointValues<Parameters<C["requestPasswordReset"]>[0], "redirectTo">;
export type PasswordResetRequestCompletion<_C extends AuthenticationClient> = {
    outcome: "requested";
    email: string;
};
export type PasswordResetRequestFormOptions<C extends AuthenticationClient> = WorkflowFormOptions<PasswordResetRequestValues<C>> & {
    schema?: never;
    initialValues: PasswordResetRequestValues<C>;
    redirectTo: string;
    onRequested?: WorkflowCallback<PasswordResetRequestCompletion<C>>;
};
export type PasswordResetValues<C extends AuthenticationClient> = EndpointValues<Parameters<C["resetPassword"]>[0], "token">;
export type PasswordResetCompletion<_C extends AuthenticationClient> = {
    outcome: "reset";
};
export type PasswordResetFormOptions<C extends AuthenticationClient> = WorkflowFormOptions<PasswordResetValues<C>> & {
    schema?: never;
    initialValues: PasswordResetValues<C>;
    token: string;
    signOutAfterReset?: boolean;
    onReset?: WorkflowCallback<PasswordResetCompletion<C>>;
};
export type EmailVerificationValues<C extends AuthenticationClient> = EndpointValues<Parameters<C["sendVerificationEmail"]>[0], "callbackURL">;
export type EmailVerificationCompletion<_C extends AuthenticationClient> = {
    outcome: "requested";
    email: string;
};
export type EmailVerificationOptions<C extends AuthenticationClient> = WorkflowFormOptions<EmailVerificationValues<C>> & {
    schema?: never;
    initialValues: EmailVerificationValues<C>;
    callbackURL?: string;
    onRequested?: WorkflowCallback<EmailVerificationCompletion<C>>;
};
export type SignOutOptions<_C extends AuthenticationClient> = WorkflowFeedbackOptions & {
    enabled?: boolean;
    onSignedOut?: WorkflowCallback<{
        outcome: "signedOut";
    }>;
};
export type SignOutState<_C extends AuthenticationClient> = WorkflowActionState & {
    actions: {
        signOut: WorkflowAction<[], {
            outcome: "signedOut";
        }>;
    };
};
/** `useGuestSession()`, with `guests: true`: every visitor holds a session, a guest's at first. */
export type GuestSessionState = WorkflowActionState & {
    userId: string | undefined;
    /** The session is a guest's (Better Auth anonymous user), not an account's. */
    isAnonymous: boolean;
    /** The first authentication was reached; never false again, through any identity change. */
    isEstablished: boolean;
};
export type GuestSessionWorkflow = {
    useGuestSession(): GuestSessionState;
};
type SchemaOptions<Base, S extends z.ZodType> = Omit<Base, "schema" | "initialValues"> & {
    schema: S;
    initialValues: z.input<S>;
};
type FormHook<Base, State, V> = {
    (options: Base): State;
    <S extends WorkflowFormSchema<V>>(options: SchemaOptions<Base, S>): State extends WorkflowForm<any, infer R> ? WorkflowForm<z.input<S>, R> : never;
};
export type SignInFormState<C extends AuthenticationClient, V = SignInValues<C>> = WorkflowForm<V, SignInCompletion<C>>;
export type SignUpFormState<C extends AuthenticationClient, V = SignUpValues<C>> = WorkflowForm<V, SignUpCompletion<C>>;
export type PasswordResetRequestFormState<C extends AuthenticationClient, V = PasswordResetRequestValues<C>> = WorkflowForm<V, PasswordResetRequestCompletion<C>>;
export type PasswordResetFormState<C extends AuthenticationClient, V = PasswordResetValues<C>> = WorkflowForm<V, PasswordResetCompletion<C>>;
export type EmailVerificationState<C extends AuthenticationClient, V = EmailVerificationValues<C>> = WorkflowForm<V, EmailVerificationCompletion<C>>;
export type AuthenticationWorkflows<C extends AuthenticationClient> = {
    useSignInFormContext(): SignInFormState<C>;
    useSignUpFormContext(): SignUpFormState<C>;
    usePasswordResetRequestFormContext(): PasswordResetRequestFormState<C>;
    usePasswordResetFormContext(): PasswordResetFormState<C>;
    useEmailVerificationContext(): EmailVerificationState<C>;
    useSignOutContext(): SignOutState<C>;
    useSignInForm: FormHook<SignInFormOptions<C>, SignInFormState<C>, SignInValues<C>>;
    useSignUpForm: FormHook<SignUpFormOptions<C>, SignUpFormState<C>, SignUpValues<C>>;
    usePasswordResetRequestForm: FormHook<PasswordResetRequestFormOptions<C>, PasswordResetRequestFormState<C>, PasswordResetRequestValues<C>>;
    usePasswordResetForm: FormHook<PasswordResetFormOptions<C>, PasswordResetFormState<C>, PasswordResetValues<C>>;
    useEmailVerification: FormHook<EmailVerificationOptions<C>, EmailVerificationState<C>, EmailVerificationValues<C>>;
    useSignOut(options?: SignOutOptions<C>): SignOutState<C>;
    SignInForm: WorkflowRootComponent<SignInFormOptions<C>>;
    SignUpForm: WorkflowRootComponent<SignUpFormOptions<C>>;
    PasswordResetRequestForm: WorkflowRootComponent<PasswordResetRequestFormOptions<C>>;
    PasswordResetForm: WorkflowRootComponent<PasswordResetFormOptions<C>>;
    EmailVerification: WorkflowRootComponent<EmailVerificationOptions<C>>;
    SignOut: WorkflowRootComponent<SignOutOptions<C>>;
    defineSignInForm<S extends WorkflowFormSchema<SignInValues<C>>>(schema: S): WorkflowDefinition<Omit<SchemaOptions<SignInFormOptions<C>, S>, "schema"> & {
        schema?: S;
    }, SignInFormState<C, z.input<S>>>;
    defineSignUpForm<S extends WorkflowFormSchema<SignUpValues<C>>>(schema: S): WorkflowDefinition<Omit<SchemaOptions<SignUpFormOptions<C>, S>, "schema"> & {
        schema?: S;
    }, SignUpFormState<C, z.input<S>>>;
    definePasswordResetRequestForm<S extends WorkflowFormSchema<PasswordResetRequestValues<C>>>(schema: S): WorkflowDefinition<Omit<SchemaOptions<PasswordResetRequestFormOptions<C>, S>, "schema"> & {
        schema?: S;
    }, PasswordResetRequestFormState<C, z.input<S>>>;
    definePasswordResetForm<S extends WorkflowFormSchema<PasswordResetValues<C>>>(schema: S): WorkflowDefinition<Omit<SchemaOptions<PasswordResetFormOptions<C>, S>, "schema"> & {
        schema?: S;
    }, PasswordResetFormState<C, z.input<S>>>;
    defineEmailVerification<S extends WorkflowFormSchema<EmailVerificationValues<C>>>(schema: S): WorkflowDefinition<Omit<SchemaOptions<EmailVerificationOptions<C>, S>, "schema"> & {
        schema?: S;
    }, EmailVerificationState<C, z.input<S>>>;
};
export {};
//# sourceMappingURL=types.d.ts.map