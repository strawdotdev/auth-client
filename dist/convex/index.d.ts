import { type GenericMutationCtx, type GenericQueryCtx, type GenericDataModel, type FunctionReference, type ApiFromModules, type SchemaDefinition, type GenericSchema, type FunctionArgs, type FunctionReturnType } from "convex/server";
import type { Triggers } from "@convex-dev/better-auth";
import type { lookup as componentLookup } from "./component.js";
import type { Features, ResourceDependency } from "../signal-protocol.js";
export declare const authSignalTables: {
    authSignals: import("convex/server").TableDefinition<import("convex/values").VObject<{
        scope: "directory" | "organization" | "profile" | "invitations" | "sessions" | "invitation" | "passkeys";
        subject: string;
        revision: number;
    }, {
        scope: import("convex/values").VUnion<"directory" | "organization" | "profile" | "invitations" | "sessions" | "invitation" | "passkeys", [import("convex/values").VLiteral<"directory", "required">, import("convex/values").VLiteral<"organization", "required">, import("convex/values").VLiteral<"profile", "required">, import("convex/values").VLiteral<"invitations", "required">, import("convex/values").VLiteral<"sessions", "required">, import("convex/values").VLiteral<"invitation", "required">, import("convex/values").VLiteral<"passkeys", "required">], "required", never>;
        subject: import("convex/values").VString<string, "required">;
        revision: import("convex/values").VFloat64<number, "required">;
    }, "required", "scope" | "subject" | "revision">, {
        scope_subject: ["scope", "subject", "_creationTime"];
    }, {}, {}>;
};
type MutationCtx = GenericMutationCtx<GenericDataModel>;
export declare function markSignal(ctx: MutationCtx, dependency: ResourceDependency): Promise<void>;
export declare const markSessionsChanged: import("convex/server").RegisteredMutation<"internal", {
    userId: string;
}, Promise<null>>;
type Lookup = ApiFromModules<{
    component: {
        lookup: typeof componentLookup;
    };
}>["component"]["lookup"];
export type ComponentLookupReference = FunctionReference<"query", "public" | "internal", FunctionArgs<Lookup>, FunctionReturnType<Lookup>>;
export type BackendOptions<DataModel extends GenericDataModel = GenericDataModel> = {
    features: Features;
    getAuthUser: (ctx: GenericQueryCtx<DataModel>) => Promise<{
        _id?: string;
        id?: string;
        email: string;
        emailVerified?: boolean;
    } | null>;
    lookup: ComponentLookupReference;
    /** Pass the effective policy from the same Better Auth organization options. */
    requireVerifiedInvitationEmail: boolean;
};
export declare function createSignalQueries<DataModel extends GenericDataModel = GenericDataModel>(options: BackendOptions<DataModel>): {
    signals: import("convex/server").RegisteredQuery<"public", {
        dependencies: {
            organizationId?: string | undefined;
            scope: "directory" | "organization" | "profile" | "invitations" | "sessions" | "invitation" | "passkeys";
            subject: string;
        }[];
    }, Promise<{
        protocol: 1;
        features: Features;
        userId: string;
        denied: boolean;
        revisions: number[];
    }>>;
};
type Doc = Record<string, unknown>;
type Trigger = (ctx: MutationCtx, doc: Doc, previous?: Doc) => Promise<void>;
export type SignalTriggers = Record<string, {
    onCreate?: Trigger;
    onUpdate?: Trigger;
    onDelete?: Trigger;
}>;
export declare function composeTriggers<DataModel extends GenericDataModel, Schema extends SchemaDefinition<GenericSchema, boolean>>(...sets: Triggers<DataModel, Schema>[]): Triggers<DataModel, Schema>;
export declare function composeTriggers(...sets: SignalTriggers[]): SignalTriggers;
export declare function createSignalTriggers(options: {
    features: Features;
    lookup: BackendOptions["lookup"];
    markSessionsChanged: FunctionReference<"mutation", "internal", {
        userId: string;
    }, null>;
}): SignalTriggers;
export {};
//# sourceMappingURL=index.d.ts.map