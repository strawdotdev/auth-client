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
export type AccountsState<C extends AccountsClient, Guests extends boolean = false> = Read<DeviceAccounts<C>> & WorkflowActionState & {
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
    } & (Guests extends true ? {
        /**
         * Makes this context a guest: the device's guest if it keeps one, else a new one beside
         * the device's accounts, which stay signed in. With on-demand guests, also from a
         * signed-out context.
         */
        switchToGuest: WorkflowAction<[], AccountSwitched>;
    } : unknown);
};
export type AccountsWorkflows<C extends AccountsClient, Guests extends boolean = false> = {
    useDeviceAccounts: Hook<C["deviceAccounts"]["list"]>;
    useAccountsContext(): AccountsState<C, Guests>;
    useAccounts(this: void, options?: AccountsOptions): AccountsState<C, Guests>;
    Accounts: WorkflowRootComponent<AccountsOptions>;
};
export {};
//# sourceMappingURL=types.d.ts.map