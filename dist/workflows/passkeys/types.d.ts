import type { ReactNode } from "react";
import type { Data, PasskeyClient, Result } from "../../client/types.js";
import type { AuthenticatedCompletion } from "../authentication/types.js";
import type { WorkflowCallback } from "../shared/type-contracts.js";
import type { WorkflowAction, WorkflowActionState, WorkflowFeedbackOptions } from "../shared/types.js";
type Component<P> = (props: P & {
    children?: ReactNode;
}) => ReactNode;
type Read<T> = Omit<Result<T>, "error" | "isPending"> & {
    isLoading: boolean;
    queryError: unknown;
};
type Cancelled = {
    outcome: "cancelled";
};
export type PasskeySignInOptions<_C extends PasskeyClient> = WorkflowFeedbackOptions & {
    enabled?: boolean;
    /**
     * Offer the device's passkeys among the browser's suggestions for a field marked
     * `autocomplete="username webauthn"`, rendered with the workflow.
     */
    autoFill?: boolean;
    onAuthenticated?: WorkflowCallback<AuthenticatedCompletion>;
};
export type PasskeySignInState<_C extends PasskeyClient> = WorkflowActionState & {
    actions: {
        signIn: WorkflowAction<[], AuthenticatedCompletion | Cancelled>;
    };
};
export type PasskeysOptions<C extends PasskeyClient> = WorkflowFeedbackOptions & {
    enabled?: boolean;
    onAdded?: WorkflowCallback<{
        passkey: Data<C["passkey"]["addPasskey"]>;
    }>;
    onDeleted?: WorkflowCallback<{
        passkeyId: string;
    }>;
};
export type PasskeysState<C extends PasskeyClient> = Read<Data<C["passkey"]["listUserPasskeys"]>> & WorkflowActionState & {
    passkey(passkeyId: string): {
        remove: WorkflowAction<[], {
            outcome: "deleted";
        }>;
    };
    actions: {
        add: WorkflowAction<[
            body?: {
                name?: string;
            }
        ], {
            outcome: "added";
            passkey: Data<C["passkey"]["addPasskey"]>;
        } | Cancelled>;
    };
    /** Adding a passkey needs a recent sign-in: reauthenticate, then add again. */
    needsFreshSession: boolean;
};
export type PasskeyWorkflows<C extends PasskeyClient> = {
    usePasskeySignIn(this: void, options?: PasskeySignInOptions<C>): PasskeySignInState<C>;
    usePasskeySignInContext(): PasskeySignInState<C>;
    PasskeySignIn: Component<PasskeySignInOptions<C>>;
    usePasskeys(this: void, options?: PasskeysOptions<C>): PasskeysState<C>;
    usePasskeysContext(): PasskeysState<C>;
    Passkeys: Component<PasskeysOptions<C>>;
};
export {};
//# sourceMappingURL=types.d.ts.map