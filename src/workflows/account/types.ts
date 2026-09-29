import type { z } from "zod";
import type { AccountClient } from "../../client/types.js";
import type { WorkflowDefinition } from "../shared/root.js";
import type {
  EndpointValues,
  WorkflowCallback,
  WorkflowFormOptions,
  WorkflowFormSchema,
  WorkflowRootComponent,
} from "../shared/type-contracts.js";
import type { WorkflowAction, WorkflowActionState, WorkflowForm } from "../shared/types.js";

export type CurrentUserState<U> = {
  data: U | null | undefined;
  identity: string | undefined;
  isPending: boolean;
  error: unknown;
};
export type CurrentUserBinding<U extends { email: string }> = {
  useCurrentUser(): CurrentUserState<U>;
};
type RequiredSchemaOptions<Base, S extends z.ZodType> = Omit<Base, "schema" | "initialValues"> & {
  schema: S;
  initialValues: z.input<S>;
};
type FormHook<Base, State, Values> = {
  (options: Base): State;
  <S extends WorkflowFormSchema<Values>>(
    options: Omit<Base, "schema" | "initialValues"> & {
      schema: S;
      initialValues: z.input<S>;
    },
  ): State extends WorkflowForm<any, infer Result> ? WorkflowForm<z.input<S>, Result> : never;
};

export type ProfileUpdateValues<C extends AccountClient> = EndpointValues<
  Parameters<C["updateUser"]>[0]
>;
export type ProfileSettingsOptions<
  C extends AccountClient,
  U extends { email: string },
> = WorkflowFormOptions<ProfileUpdateValues<C>> & {
  schema?: never;
  getInitialValues(user: U): ProfileUpdateValues<C>;
  onUpdated?: WorkflowCallback<{ outcome: "updated"; user: U }>;
};
export type ProfileSettingsState<
  C extends AccountClient,
  U extends { email: string },
  V = ProfileUpdateValues<C>,
> = WorkflowActionState & {
  user: U | undefined;
  /** The current user has no settled result yet. */
  isLoading: boolean;
  queryError: unknown;
  form: WorkflowForm<V, { outcome: "updated"; user: U }> | null;
  actions: {
    update: WorkflowAction<[values: ProfileUpdateValues<C>], { outcome: "updated"; user: U }>;
    updateImage: WorkflowAction<[image: string | null], { outcome: "updated"; user: U }>;
  };
};

export type EmailChangeValues<C extends AccountClient> = EndpointValues<
  Parameters<C["changeEmail"]>[0],
  "callbackURL"
>;
export type EmailChangeFormOptions<C extends AccountClient> = WorkflowFormOptions<
  EmailChangeValues<C>
> & {
  schema?: never;
  initialValues: EmailChangeValues<C>;
  callbackURL: string;
  onRequested?: WorkflowCallback<{
    outcome: "confirmationRequired";
    email: string;
  }>;
};
export type EmailChangeFormState<C extends AccountClient, V = EmailChangeValues<C>> = WorkflowForm<
  V,
  { outcome: "confirmationRequired"; email: string }
>;

export type PasswordChangeValues<C extends AccountClient> = EndpointValues<
  Parameters<C["changePassword"]>[0],
  "revokeOtherSessions"
>;
export type PasswordChangeFormOptions<C extends AccountClient> = WorkflowFormOptions<
  PasswordChangeValues<C>
> & {
  schema?: never;
  initialValues: PasswordChangeValues<C>;
  revokeOtherSessions: boolean;
  onChanged?: WorkflowCallback<{ outcome: "changed" }>;
};
export type PasswordChangeFormState<
  C extends AccountClient,
  V = PasswordChangeValues<C>,
> = WorkflowForm<V, { outcome: "changed" }>;

export type ReauthenticationValues = { password: string };
export type ReauthenticationFormOptions<_C extends AccountClient> =
  WorkflowFormOptions<ReauthenticationValues> & {
    schema?: never;
    initialValues?: ReauthenticationValues;
    onReauthenticated?: WorkflowCallback<{
      outcome: "reauthenticated";
      userId: string;
      sessionId: string;
    }>;
  };
export type ReauthenticationFormState<
  _C extends AccountClient,
  V = ReauthenticationValues,
> = WorkflowForm<V, { outcome: "reauthenticated"; userId: string; sessionId: string }>;

export type AccountWorkflows<C extends AccountClient, U extends { email: string }> = {
  useProfileSettingsContext(): ProfileSettingsState<C, U>;
  useEmailChangeFormContext(): EmailChangeFormState<C>;
  usePasswordChangeFormContext(): PasswordChangeFormState<C>;
  useReauthenticationFormContext(): ReauthenticationFormState<C>;
  useProfileSettings: {
    (options: ProfileSettingsOptions<C, U>): ProfileSettingsState<C, U>;
    <S extends WorkflowFormSchema<ProfileUpdateValues<C>>>(
      options: Omit<ProfileSettingsOptions<C, U>, "schema" | "getInitialValues"> & {
        schema: S;
        getInitialValues(user: U): z.input<S>;
      },
    ): ProfileSettingsState<C, U, z.input<S>>;
  };
  useEmailChangeForm: FormHook<
    EmailChangeFormOptions<C>,
    EmailChangeFormState<C>,
    EmailChangeValues<C>
  >;
  usePasswordChangeForm: FormHook<
    PasswordChangeFormOptions<C>,
    PasswordChangeFormState<C>,
    PasswordChangeValues<C>
  >;
  useReauthenticationForm: {
    (options?: ReauthenticationFormOptions<C>): ReauthenticationFormState<C>;
    <S extends WorkflowFormSchema<ReauthenticationValues>>(
      options: Omit<ReauthenticationFormOptions<C>, "schema" | "initialValues"> & {
        schema: S;
        initialValues?: z.input<S>;
      },
    ): ReauthenticationFormState<C, z.input<S>>;
  };
  ProfileSettings: WorkflowRootComponent<ProfileSettingsOptions<C, U>>;
  EmailChangeForm: WorkflowRootComponent<EmailChangeFormOptions<C>>;
  PasswordChangeForm: WorkflowRootComponent<PasswordChangeFormOptions<C>>;
  ReauthenticationForm: WorkflowRootComponent<ReauthenticationFormOptions<C>>;
  defineProfileSettings<S extends WorkflowFormSchema<ProfileUpdateValues<C>>>(
    schema: S,
  ): WorkflowDefinition<
    Omit<ProfileSettingsOptions<C, U>, "schema"> & { schema?: S },
    ProfileSettingsState<C, U, z.input<S>>
  >;
  defineEmailChangeForm<S extends WorkflowFormSchema<EmailChangeValues<C>>>(
    schema: S,
  ): WorkflowDefinition<
    Omit<RequiredSchemaOptions<EmailChangeFormOptions<C>, S>, "schema"> & { schema?: S },
    EmailChangeFormState<C, z.input<S>>
  >;
  definePasswordChangeForm<S extends WorkflowFormSchema<PasswordChangeValues<C>>>(
    schema: S,
  ): WorkflowDefinition<
    Omit<RequiredSchemaOptions<PasswordChangeFormOptions<C>, S>, "schema"> & { schema?: S },
    PasswordChangeFormState<C, z.input<S>>
  >;
  defineReauthenticationForm<S extends WorkflowFormSchema<ReauthenticationValues>>(
    schema: S,
  ): WorkflowDefinition<
    Omit<ReauthenticationFormOptions<C>, "schema" | "initialValues"> & {
      schema?: S;
      initialValues?: z.input<S>;
    },
    ReauthenticationFormState<C, z.input<S>>
  >;
};
