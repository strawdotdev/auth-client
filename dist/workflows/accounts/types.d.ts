import type { AccountsClient, Data, Hook, Result } from "../../client/types.js";
import type { WorkflowCallback, WorkflowRootComponent } from "../shared/type-contracts.js";
import type { WorkflowAction, WorkflowActionState, WorkflowFeedbackOptions } from "../shared/types.js";
type Read<T> = Omit<Result<T>, "error" | "isPending"> & {
    isLoading: boolean;
    queryError: unknown;
};
/** The device's accounts, as `deviceAccounts()` lists them. */
export type DeviceAccounts<C extends AccountsClient> = Data<C["deviceAccounts"]["list"]>;
export type AccountSwitched = {
    outcome: "switched";
    userId: string;
    sessionId: string;
};
export type AccountSignedOut = {
    outcome: "signedOut";
    userId: string;
};
export type AccountsOptions = WorkflowFeedbackOptions & {
    enabled?: boolean;
    /** This context now acts as the chosen account (Convex included). */
    onSwitched?: WorkflowCallback<AccountSwitched>;
    /** An account was signed out; when it was this context's, the context has moved on. */
    onSignedOut?: WorkflowCallback<AccountSignedOut>;
};
export type AccountsState<C extends AccountsClient> = Read<DeviceAccounts<C>> & WorkflowActionState & {
    /** The account this context acts as. */
    currentUserId: string | undefined;
    account(userId: string): {
        /** Makes the account this context's; the device and its other contexts keep theirs. */
        switch: WorkflowAction<[], AccountSwitched>;
        /** Signs the account out of the device; the others stay signed in. */
        signOut: WorkflowAction<[], AccountSignedOut>;
    };
    actions: {
        /** Signs every account out of the device (Better Auth's sign-out). */
        signOutAll: WorkflowAction<[], {
            outcome: "signedOut";
        }>;
    };
};
export type AccountsWorkflows<C extends AccountsClient> = {
    useDeviceAccounts: Hook<C["deviceAccounts"]["list"]>;
    useAccountsContext(): AccountsState<C>;
    useAccounts(this: void, options?: AccountsOptions): AccountsState<C>;
    Accounts: WorkflowRootComponent<AccountsOptions>;
};
export {};
//# sourceMappingURL=types.d.ts.map