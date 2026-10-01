import { afterEach, expect, it, vi } from "vitest";
import { withStoredConvexToken } from "../packages/auth-client/src/index.js";

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims: object) => `${base64url({ alg: "RS256" })}.${base64url(claims)}.signature`;
const inMinutes = (minutes: number) => Math.floor(Date.now() / 1000) + minutes * 60;

/** A Better Auth client whose cookie store keeps `stored` as the convex plugin's token. */
function client(stored: string | undefined, sessionId: string | null = "session") {
  let cookie = stored
    ? `__Secure-better-auth.session_token=private; __Secure-better-auth.convex_jwt=${stored}`
    : "";
  const token = vi.fn(async (..._args: unknown[]) => {
    const fresh = jwt({ sessionId, exp: inMinutes(15), fresh: Math.random() });
    cookie = `__Secure-better-auth.convex_jwt=${fresh}`;
    return { data: { token: fresh }, error: null };
  });
  const session = { get: () => ({ data: sessionId ? { session: { id: sessionId } } : null }) };
  const auth = {
    getCookie: () => cookie,
    $store: { atoms: { session } },
    convex: { token },
    useSession: () => "untouched",
  };
  return { auth, token, wrapped: withStoredConvexToken(auth) };
}

afterEach(() => vi.clearAllMocks());

it("hands over the current session's kept token once, then asks the server", async () => {
  const kept = jwt({ sessionId: "session", exp: inMinutes(15) });
  const { token, wrapped, auth } = client(kept);
  expect(await wrapped.convex.token()).toEqual({ data: { token: kept }, error: null });
  expect(token).not.toHaveBeenCalled();
  // A refresh or retry: the kept token was handed out already.
  const refreshed = await wrapped.convex.token({ fetchOptions: { throw: false } });
  expect(token).toHaveBeenCalledOnce();
  expect(token).toHaveBeenCalledWith({ fetchOptions: { throw: false } });
  expect(refreshed.data?.token).not.toBe(kept);
  // The server's token is now the kept one, and it was handed out too.
  await wrapped.convex.token();
  expect(token).toHaveBeenCalledTimes(2);
  expect(wrapped.useSession).toBe(auth.useSession);
});

it("asks the server when the kept token is another session's", async () => {
  const { token, wrapped } = client(jwt({ sessionId: "previous", exp: inMinutes(15) }));
  await wrapped.convex.token();
  expect(token).toHaveBeenCalledOnce();
});

it("asks the server when the kept token is about to expire", async () => {
  const { token, wrapped } = client(jwt({ sessionId: "session", exp: inMinutes(0.5) }));
  await wrapped.convex.token();
  expect(token).toHaveBeenCalledOnce();
});

it("asks the server with no session, no kept token or an unreadable one", async () => {
  for (const [stored, sessionId] of [
    [jwt({ sessionId: "session", exp: inMinutes(15) }), null],
    [undefined, "session"],
    ["not-a-jwt", "session"],
  ] as const) {
    const { token, wrapped } = client(stored, sessionId);
    await wrapped.convex.token();
    expect(token).toHaveBeenCalledOnce();
  }
});
