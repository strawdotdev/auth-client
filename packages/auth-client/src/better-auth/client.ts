import type { BetterAuthClientPlugin } from "better-auth/client";
import type { deviceAccounts } from "./index.js";

/** Where a context keeps the token of the account it acts as: a browser tab's `sessionStorage`. */
export type DeviceAccountStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type SessionRead = { session?: { token?: unknown } } | null | undefined;
type GetActions = NonNullable<BetterAuthClientPlugin["getActions"]>;

function memoryStorage(): DeviceAccountStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

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
export const deviceAccountsClient = ({
  storage = memoryStorage(),
  key = "better-auth.device-account",
}: { storage?: DeviceAccountStorage; key?: string } = {}) => {
  const read = () => {
    try {
      return storage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  };
  const write = (token: string | undefined) => {
    try {
      if (token) storage.setItem(key, token);
      else storage.removeItem(key);
    } catch {
      // Storage may be unavailable (a private window's quota); the context follows the device's.
    }
  };
  let sessionChanged = () => {};
  let readSession: (query: unknown) => Promise<unknown> = async () => null;
  return {
    id: "device-accounts",
    $InferServerPlugin: {} as ReturnType<typeof deviceAccounts>,
    fetchPlugins: [
      {
        id: "device-accounts",
        name: "Device accounts",
        hooks: {
          onRequest(context) {
            const token = read();
            if (!token) return context;
            const headers = new Headers(context.headers);
            if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
            return { ...context, headers };
          },
          async onResponse(context) {
            // The kept account was signed out (elsewhere, or it expired): the same read answers
            // as the device's account instead, so the context never shows a passing sign-out.
            const url = new URL(String(context.request.url), "http://context");
            if (!url.pathname.endsWith("/get-session") || !read() || !context.response.ok) return;
            if ((await context.response.clone().json()) !== null) return;
            write(undefined);
            const data = await readSession(Object.fromEntries(url.searchParams));
            // A read outside the session hook (the integration's AuthBoundary calls getSession on a
            // revoked session) must still move the hook on: it refetches as the device's account.
            setTimeout(sessionChanged, 0);
            return new Response(JSON.stringify(data), {
              headers: { "content-type": "application/json" },
            });
          },
          onSuccess(context) {
            const issued = context.response.headers.get("set-auth-token");
            if (issued) return write(issued);
            const { pathname } = new URL(String(context.request.url), "http://context");
            // Signing out ended the session this context named: nothing after it names that
            // session again, since the server expires the session cookie for a token it no longer
            // finds, a guest's sign-in at once taking the cookie it sets with it.
            if (pathname.endsWith("/sign-out")) return write(undefined);
            if (!pathname.endsWith("/get-session")) return;
            const token = (context.data as SessionRead)?.session?.token;
            if (typeof token === "string" && !read()) write(token);
          },
        },
      },
    ],
    getActions: ($fetch: Parameters<GetActions>[0], $store: Parameters<GetActions>[1]) => {
      sessionChanged = () => $store.notify("$sessionSignal");
      readSession = async (query) =>
        (await $fetch("/get-session", { method: "GET", query: query as Record<string, string> }))
          .data ?? null;
      return {
        deviceAccounts: {
          /** The session token this context acts as, if it has one of its own. */
          selected: read,
          /** Makes a device account this context's account; `null` follows the device's. */
          select(sessionToken: string | null) {
            write(sessionToken ?? undefined);
            sessionChanged();
          },
        },
      };
    },
  } satisfies BetterAuthClientPlugin;
};
