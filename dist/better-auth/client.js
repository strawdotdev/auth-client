function memoryStorage() {
    const values = new Map();
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
export const deviceAccountsClient = ({ storage = memoryStorage(), key = "better-auth.device-account", } = {}) => {
    const read = () => {
        try {
            return storage.getItem(key) ?? undefined;
        }
        catch {
            return undefined;
        }
    };
    const write = (token) => {
        try {
            if (token)
                storage.setItem(key, token);
            else
                storage.removeItem(key);
        }
        catch {
            // Storage may be unavailable (a private window's quota); the context follows the device's.
        }
    };
    let sessionChanged = () => { };
    let readSession = async () => null;
    return {
        id: "device-accounts",
        $InferServerPlugin: {},
        fetchPlugins: [
            {
                id: "device-accounts",
                name: "Device accounts",
                hooks: {
                    onRequest(context) {
                        const token = read();
                        if (!token)
                            return context;
                        const headers = new Headers(context.headers);
                        if (!headers.has("authorization"))
                            headers.set("authorization", `Bearer ${token}`);
                        return { ...context, headers };
                    },
                    async onResponse(context) {
                        // The kept account was signed out (elsewhere, or it expired): the same read answers
                        // as the device's account instead, so the context never shows a passing sign-out.
                        const url = new URL(String(context.request.url), "http://context");
                        if (!url.pathname.endsWith("/get-session") || !read() || !context.response.ok)
                            return;
                        if ((await context.response.clone().json()) !== null)
                            return;
                        write(undefined);
                        const data = await readSession(Object.fromEntries(url.searchParams));
                        return new Response(JSON.stringify(data), {
                            headers: { "content-type": "application/json" },
                        });
                    },
                    onSuccess(context) {
                        const issued = context.response.headers.get("set-auth-token");
                        if (issued)
                            return write(issued);
                        if (!new URL(String(context.request.url), "http://context").pathname.endsWith("/get-session"))
                            return;
                        const token = context.data?.session?.token;
                        if (typeof token === "string" && !read())
                            write(token);
                    },
                },
            },
        ],
        getActions: ($fetch, $store) => {
            sessionChanged = () => $store.notify("$sessionSignal");
            readSession = async (query) => (await $fetch("/get-session", { method: "GET", query: query }))
                .data ?? null;
            return {
                deviceAccounts: {
                    /** The session token this context acts as, if it has one of its own. */
                    selected: read,
                    /** Makes a device account this context's account; `null` follows the device's. */
                    select(sessionToken) {
                        write(sessionToken ?? undefined);
                        sessionChanged();
                    },
                },
            };
        },
    };
};
//# sourceMappingURL=client.js.map