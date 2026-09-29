import type { ReactNode } from "react";
import type { z } from "zod";
import type { Data, OrganizationClient, Query, Result } from "../../client/types.js";
import type { WorkflowDefinition } from "../shared/root.js";
import type {
  WorkflowActionState,
  WorkflowForm,
  PolicyDecision,
  FormFieldErrors,
  WorkflowAction,
  WorkflowFeedbackOptions,
} from "../shared/types.js";
export type OrganizationScope =
  | { organizationId: string; organizationSlug?: never }
  | { organizationSlug: string; organizationId?: never };
type Callback<T> = (value: T) => void | Promise<void>;
type Component<P, _State> = (props: P & { children?: ReactNode }) => ReactNode;
type Read<T> = Omit<Result<T>, "error" | "isPending"> & { isLoading: boolean; queryError: unknown };
export type DirectoryOrganization<C extends OrganizationClient> =
  NonNullable<Data<C["organization"]["list"]>> extends readonly (infer O)[] ? O : never;
export type FullOrganization<C extends OrganizationClient> = NonNullable<
  Data<C["organization"]["getFullOrganization"]>
>;
export type OrganizationCompletion<
  C extends OrganizationClient,
  O extends "create" | "update" | "leave" | "delete" = "create" | "update" | "leave" | "delete",
> = {
  [K in O]: { operation: K; organizationId: string } & (K extends "create" | "update"
    ? { organization: DirectoryOrganization<C> }
    : {});
}[O];
export type OrganizationCreateValues<C extends OrganizationClient> = Omit<
  NonNullable<Parameters<C["organization"]["create"]>[0]>,
  "fetchOptions" | "userId" | "keepCurrentActiveOrganization" | "teamId"
>;
export type OrganizationUpdateValues<C extends OrganizationClient> = NonNullable<
  NonNullable<Parameters<C["organization"]["update"]>[0]>["data"]
>;
type OptionalUndefined<T> = { [K in keyof T]: {} extends Pick<T, K> ? T[K] | undefined : T[K] };
type Schema<V> = z.ZodType<OptionalUndefined<V>, Record<string, unknown>>;
type Boundary<S extends z.ZodType> =
  Extract<
    keyof z.input<S> | keyof z.output<S>,
    "fetchOptions" | "organizationId" | "userId" | "teamId" | "keepCurrentActiveOrganization"
  > extends never
    ? unknown
    : never;
type FormOptions<V> = WorkflowFeedbackOptions & {
  enabled?: boolean;
  validate?: (values: Readonly<V>) => FormFieldErrors<V> | Promise<FormFieldErrors<V>>;
};
export type OrganizationCreateOptions<C extends OrganizationClient> = FormOptions<
  OrganizationCreateValues<C>
> & {
  schema?: never;
  initialValues: OrganizationCreateValues<C>;
  keepCurrentActiveOrganization?: boolean;
  onCreated?: Callback<OrganizationCompletion<C, "create">>;
};
export type OrganizationCreateState<
  C extends OrganizationClient,
  V = OrganizationCreateValues<C>,
> = WorkflowForm<V, OrganizationCompletion<C, "create">> & {
  /** The workflow read has no settled result yet. */
  isLoading: boolean;
  isFetching: boolean;
  queryError: unknown;
  refetch: Result<Data<C["organization"]["list"]>>["refetch"];
};
type CreateSchemaOptions<
  C extends OrganizationClient,
  S extends Schema<OrganizationCreateValues<C>>,
> = Omit<OrganizationCreateOptions<C>, "initialValues" | "schema"> & {
  initialValues: z.input<S>;
  schema: S & Boundary<S>;
};
export interface OrganizationCreateHook<C extends OrganizationClient> {
  (options: OrganizationCreateOptions<C>): OrganizationCreateState<C>;
  <S extends Schema<OrganizationCreateValues<C>>>(
    options: CreateSchemaOptions<C, S>,
  ): OrganizationCreateState<C, z.input<S>>;
}
export type OrganizationCreateComponent<C extends OrganizationClient> = (
  props: OrganizationCreateOptions<C> & { children?: ReactNode },
) => ReactNode;
export type OrganizationPolicyContext<C extends OrganizationClient> = {
  organization: FullOrganization<C>;
  actorId: string;
  role: Data<C["organization"]["getActiveMemberRole"]> extends { role: infer R } ? R : string;
};
export type OrganizationSettingsOptions<C extends OrganizationClient> = OrganizationScope &
  FormOptions<OrganizationUpdateValues<C>> & {
    schema?: never;
    getInitialValues(organization: FullOrganization<C>): OrganizationUpdateValues<C>;
    policy?: Partial<
      Record<
        "update" | "leave" | "delete",
        (context: OrganizationPolicyContext<C>) => PolicyDecision
      >
    >;
    beforeDelete?: (context: { organizationId: string; signal: AbortSignal }) => Promise<void>;
    onUpdated?: Callback<OrganizationCompletion<C, "update">>;
    onLeft?: Callback<{ operation: "leave"; organizationId: string }>;
    onDeleted?: Callback<{ operation: "delete"; organizationId: string }>;
  };
export type OrganizationSettingsState<
  C extends OrganizationClient,
  V = OrganizationUpdateValues<C>,
> = WorkflowActionState & {
  actions: {
    update: WorkflowAction<
      [data: OrganizationUpdateValues<C>],
      OrganizationCompletion<C, "update">
    >;
    leave: WorkflowAction<[], OrganizationCompletion<C, "leave">>;
    delete: WorkflowAction<[], OrganizationCompletion<C, "delete">>;
  };
  organization: FullOrganization<C> | undefined;
  role: string | undefined;
  /** The workflow read has no settled result yet. */
  isLoading: boolean;
  isFetching: boolean;
  queryError: unknown;
  form: WorkflowForm<V, OrganizationCompletion<C, "update">> | null;
  hasServerChanges: boolean;

  refetch(this: void): Promise<void>;
};
type SettingsSchemaOptions<
  C extends OrganizationClient,
  S extends Schema<OrganizationUpdateValues<C>>,
> = Omit<OrganizationSettingsOptions<C>, "schema" | "getInitialValues"> & {
  schema: S & Boundary<S>;
  getInitialValues(organization: FullOrganization<C>): z.input<S>;
};
export interface OrganizationSettingsHook<C extends OrganizationClient> {
  (options: OrganizationSettingsOptions<C>): OrganizationSettingsState<C>;
  <S extends Schema<OrganizationUpdateValues<C>>>(
    options: SettingsSchemaOptions<C, S>,
  ): OrganizationSettingsState<C, z.input<S>>;
}
export type OrganizationSettingsComponent<C extends OrganizationClient> = (
  props: OrganizationSettingsOptions<C> & { children?: ReactNode },
) => ReactNode;
export type OrganizationDirectoryOptions<C extends OrganizationClient> = WorkflowFeedbackOptions & {
  enabled?: boolean;
  selection?: OrganizationScope;
  fallback?: "none" | "first";
  onSelect?: Callback<DirectoryOrganization<C>>;
};
export type OrganizationDirectoryState<C extends OrganizationClient> = Read<
  Data<C["organization"]["list"]>
> &
  WorkflowActionState & {
    organization: DirectoryOrganization<C> | null;
    status: "loading" | "error" | "empty" | "unselected" | "unavailable" | "ready";

    select(this: void, id: string): WorkflowAction<[], DirectoryOrganization<C>>;
  };
export type OrganizationMember<C extends OrganizationClient> =
  NonNullable<Data<C["organization"]["listMembers"]>> extends { members: (infer M)[] } ? M : never;
export type MemberRoleInput<C extends OrganizationClient> = NonNullable<
  Parameters<C["organization"]["updateMemberRole"]>[0]
>["role"];
export type MemberPolicyContext<C extends OrganizationClient> = OrganizationPolicyContext<C> & {
  member: OrganizationMember<C>;
};
export type OrganizationMembersOptions<C extends OrganizationClient> = OrganizationScope &
  WorkflowFeedbackOptions & {
    enabled?: boolean;
    pageSize: number;
    query?: Omit<
      Query<C["organization"]["listMembers"]>,
      "organizationId" | "organizationSlug" | "limit" | "offset"
    >;
    policy?: {
      updateMemberRole?: (
        context: MemberPolicyContext<C> & { nextRole: MemberRoleInput<C> },
      ) => PolicyDecision;
      removeMember?: (context: MemberPolicyContext<C>) => PolicyDecision;
      assignableRoles?: (context: MemberPolicyContext<C>) => readonly MemberRoleInput<C>[];
    };
    onRoleUpdated?: Callback<{
      memberId: string;
      result: Data<C["organization"]["updateMemberRole"]>;
    }>;
    onRemoved?: Callback<{ memberId: string; result: Data<C["organization"]["removeMember"]> }>;
  };
export type OrganizationMembersState<C extends OrganizationClient> = Omit<
  Read<Data<C["organization"]["listMembers"]>>,
  "data" | "refetch"
> & { refetch(): Promise<void> } & WorkflowActionState & {
    organization: FullOrganization<C> | undefined;
    role: string | undefined;
    members: readonly OrganizationMember<C>[];
    member(
      this: void,
      memberId: string,
    ): {
      assignableRoles: readonly MemberRoleInput<C>[] | undefined;
      remove: WorkflowAction<[], Data<C["organization"]["removeMember"]>>;
      updateRole(
        this: void,
        role: MemberRoleInput<C>,
      ): WorkflowAction<[], Data<C["organization"]["updateMemberRole"]>>;
    };
    total: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    setPage(this: void, page: number): void;
    nextPage(this: void): void;
    previousPage(this: void): void;
  };
export type OrganizationWorkflows<C extends OrganizationClient> = {
  useOrganizationDirectoryContext(): OrganizationDirectoryState<C>;
  useOrganizationCreateFormContext(): OrganizationCreateState<C>;
  useOrganizationSettingsContext(): OrganizationSettingsState<C>;
  useOrganizationMembersContext(): OrganizationMembersState<C>;
  defineOrganizationCreateForm<S extends Schema<OrganizationCreateValues<C>>>(
    schema: S & Boundary<S>,
  ): WorkflowDefinition<
    Omit<CreateSchemaOptions<C, S>, "schema"> & { schema?: S & Boundary<S> },
    OrganizationCreateState<C, z.input<S>>
  >;
  defineOrganizationSettings<S extends Schema<OrganizationUpdateValues<C>>>(
    schema: S & Boundary<S>,
  ): WorkflowDefinition<
    Omit<SettingsSchemaOptions<C, S>, "schema"> & { schema?: S & Boundary<S> },
    OrganizationSettingsState<C, z.input<S>>
  >;
  useOrganizationDirectory(
    this: void,
    options?: OrganizationDirectoryOptions<C>,
  ): OrganizationDirectoryState<C>;
  OrganizationDirectory: Component<OrganizationDirectoryOptions<C>, OrganizationDirectoryState<C>>;
  useOrganizationCreateForm: OrganizationCreateHook<C>;
  OrganizationCreateForm: OrganizationCreateComponent<C>;
  useOrganizationSettings: OrganizationSettingsHook<C>;
  OrganizationSettings: OrganizationSettingsComponent<C>;
  useOrganizationMembers(
    this: void,
    options: OrganizationMembersOptions<C>,
  ): OrganizationMembersState<C>;
  OrganizationMembers: Component<OrganizationMembersOptions<C>, OrganizationMembersState<C>>;
};
