import type { BetterAuthClientPlugin } from "better-auth/client";
import type { deviceAccounts } from "./index.js";
/** Where a context keeps the token of the account it acts as: a browser tab's `sessionStorage`. */
export type DeviceAccountStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type GetActions = NonNullable<BetterAuthClientPlugin["getActions"]>;
/**
 * The client half of `deviceAccounts()`: the account this context (a browser tab) acts as, one of
 * those the device keeps signed in. Its session token is kept in `storage` and named in every
 * request (`Authorization: Bearer`, read by Better Auth's `bearer()` plugin), so tabs act as
 * different accounts side by side while the session cookie names the device's latest one, which a
 * context without an account of its own adopts on its first session read.
 *
 * Whenever the server makes this context a session (signing in or up, the multi-session plugin
 * moving on from a revoked account) the context takes it (`set-auth-token`). A kept session that
 * no longer exists is dropped within the session read that finds it gone, which answers as the
 * device's account instead.
 *
 * `authClient.deviceAccounts.list()` reads the device's accounts; `select(sessionToken)` makes one
 * of them this context's account (`null` follows the device's again).
 */
export declare const deviceAccountsClient: ({ storage, key, }?: {
    storage?: DeviceAccountStorage;
    key?: string;
}) => {
    id: "device-accounts";
    $InferServerPlugin: ReturnType<typeof deviceAccounts>;
    fetchPlugins: {
        id: string;
        name: string;
        hooks: {
            onRequest<T extends Record<string, any>>(context: import("better-auth/client").RequestContext<T>): import("better-auth/client").RequestContext<T>;
            onResponse(context: import("better-auth/client").ResponseContext): Promise<Response | undefined>;
            onSuccess(context: import("better-auth/client").SuccessContext<any>): void;
        };
    }[];
    getActions: ($fetch: Parameters<GetActions>[0], $store: Parameters<GetActions>[1]) => {
        deviceAccounts: {
            /** The session token this context acts as, if it has one of its own. */
            selected: () => string | undefined;
            /** Makes a device account this context's account; `null` follows the device's. */
            select(sessionToken: string | null): void;
        };
    };
};
export {};
//# sourceMappingURL=client.d.ts.map