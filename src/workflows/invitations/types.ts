import type { WorkflowActionState, WorkflowForm } from "../shared/types.js";
import type { FormFieldErrors } from "../shared/types.js";
import type { ReactNode } from "react";
import type { z } from "zod";
import type { Data, OrganizationClient, Result } from "../../client/types.js";
import type { WorkflowDefinition } from "../shared/root.js";
import type { WorkflowAction, WorkflowFeedbackOptions } from "../shared/types.js";

export type InvitationValues<C extends OrganizationClient> = Omit<
  NonNullable<Parameters<C["organization"]["inviteMember"]>[0]>,
  "fetchOptions" | "organizationId" | "resend" | "teamId"
>;

type Callback<T> = (result: T) => void | Promise<void>;
type Organization<C extends OrganizationClient> =
  NonNullable<Data<C["organization"]["list"]>> extends readonly (infer O)[] ? O : never;
export type AcceptedInvitation<C extends OrganizationClient> = {
  invitationId: string;
  organization: Organization<C>;
};
export type InvitationResponseOptions<C extends OrganizationClient> = WorkflowFeedbackOptions & {
  enabled?: boolean;
  onAccepted?: Callback<AcceptedInvitation<C>>;
  onRejected?: Callback<{
    invitationId: string;
    result: Data<C["organization"]["rejectInvitation"]>;
  }>;
};
type ReadState<T> = Omit<Result<T>, "error" | "isPending"> & {
  isLoading: boolean;
  queryError: unknown;
};
type RecipientActions<C extends OrganizationClient> = WorkflowActionState & {
  invitation(invitationId: string): {
    accept: WorkflowAction<[], AcceptedInvitation<C>>;
    reject: WorkflowAction<[], Data<C["organization"]["rejectInvitation"]>>;
  };
};
export type ReceivedInvitationsState<C extends OrganizationClient> = ReadState<
  Data<C["organization"]["listUserInvitations"]>
> &
  RecipientActions<C>;
export type InvitationResponseState<C extends OrganizationClient> = Omit<
  ReadState<Data<C["organization"]["getInvitation"]>>,
  "data"
> &
  Omit<RecipientActions<C>, "invitation"> & {
    actions: ReturnType<RecipientActions<C>["invitation"]>;

    invitation: Data<C["organization"]["getInvitation"]> | undefined;
  };
export type InvitationFormOptions<C extends OrganizationClient> = WorkflowFeedbackOptions & {
  schema?: never;
  organizationId: string;
  initialValues: Omit<InvitationValues<C>, "email"> & { email?: string };
  mode?: "invite" | "resend";
  enabled?: boolean;
  validate?: (
    values: Readonly<InvitationValues<C>>,
  ) => FormFieldErrors<InvitationValues<C>> | Promise<FormFieldErrors<InvitationValues<C>>>;
  onInvited?: Callback<Data<C["organization"]["inviteMember"]>>;
};
export type InvitationFormState<
  C extends OrganizationClient,
  V = InvitationValues<C>,
> = WorkflowForm<V, Data<C["organization"]["inviteMember"]>>;
// Zod optional fields may be explicitly undefined; HTTP omits those keys.
type OptionalUndefined<T> = { [K in keyof T]: {} extends Pick<T, K> ? T[K] | undefined : T[K] };
type InvitationSchema<C extends OrganizationClient> = z.ZodType<
  OptionalUndefined<InvitationValues<C>>,
  Record<string, unknown>
>;
type SchemaBoundary<S extends z.ZodType> =
  Extract<
    keyof z.input<S> | keyof z.output<S>,
    "organizationId" | "fetchOptions" | "resend" | "teamId"
  > extends never
    ? unknown
    : never;
export type SchemaInvitationFormOptions<
  C extends OrganizationClient,
  S extends InvitationSchema<C>,
> = Omit<InvitationFormOptions<C>, "schema" | "initialValues"> & {
  schema: S & SchemaBoundary<S>;
  initialValues: z.input<S>;
};
export interface InvitationFormHook<C extends OrganizationClient> {
  (options: InvitationFormOptions<C>): InvitationFormState<C>;
  <S extends InvitationSchema<C>>(
    options: SchemaInvitationFormOptions<C, S>,
  ): InvitationFormState<C, z.input<S>>;
}
export type InvitationFormComponent<C extends OrganizationClient> = (
  props: InvitationFormOptions<C> & { children?: ReactNode },
) => ReactNode;
export type OrganizationInvitationsOptions<C extends OrganizationClient> =
  WorkflowFeedbackOptions & {
    organizationId: string;
    enabled?: boolean;
    onCancelled?: Callback<{
      invitationId: string;
      result: Data<C["organization"]["cancelInvitation"]>;
    }>;
    onResent?: Callback<Data<C["organization"]["inviteMember"]>>;
  };
export type OrganizationInvitationsState<C extends OrganizationClient> = ReadState<
  Data<C["organization"]["listInvitations"]>
> &
  WorkflowActionState & {
    invitation(invitationId: string): {
      cancel: WorkflowAction<[], Data<C["organization"]["cancelInvitation"]>>;
      resend: WorkflowAction<[], Data<C["organization"]["inviteMember"]>>;
    };
  };
type Component<P, _State> = (props: P & { children?: ReactNode }) => ReactNode;
export type InvitationSurface<C extends OrganizationClient> = {
  useInvitationFormContext(): InvitationFormState<C>;
  useReceivedInvitationsContext(): ReceivedInvitationsState<C>;
  useInvitationResponseContext(): InvitationResponseState<C>;
  useOrganizationInvitationsContext(): OrganizationInvitationsState<C>;
  defineInvitationForm<S extends InvitationSchema<C>>(
    schema: S & SchemaBoundary<S>,
  ): WorkflowDefinition<
    Omit<SchemaInvitationFormOptions<C, S>, "schema"> & { schema?: S & SchemaBoundary<S> },
    InvitationFormState<C, z.input<S>>
  >;
  useInvitationForm: InvitationFormHook<C>;
  InvitationForm: InvitationFormComponent<C>;
  useReceivedInvitations: (options?: InvitationResponseOptions<C>) => ReceivedInvitationsState<C>;
  ReceivedInvitations: Component<InvitationResponseOptions<C>, ReceivedInvitationsState<C>>;
  useInvitationResponse: (
    options: InvitationResponseOptions<C> & { invitationId: string },
  ) => InvitationResponseState<C>;
  InvitationResponse: Component<
    InvitationResponseOptions<C> & { invitationId: string },
    InvitationResponseState<C>
  >;
  useOrganizationInvitations: (
    options: OrganizationInvitationsOptions<C>,
  ) => OrganizationInvitationsState<C>;
  OrganizationInvitations: Component<
    OrganizationInvitationsOptions<C>,
    OrganizationInvitationsState<C>
  >;
};
