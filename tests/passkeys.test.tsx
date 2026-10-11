// @vitest-environment jsdom
import { useSyncExternalStore, type ReactNode } from "react";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { makeFunctionReference } from "convex/server";
import { AuthDataProvider, createAuthDataClient } from "../packages/auth-client/src/index.js";

let convexAuthenticated = false;
const convex = {
  watchQuery: vi.fn(() => ({ localQueryResult: () => undefined, onUpdate: () => () => {} })),
};
vi.mock("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => ({ isAuthenticated: convexAuthenticated, isLoading: false }),
}));
// The browser's WebAuthn API; Better Auth's passkey client and SimpleWebAuthn above it are real.
const bytes = () => new Uint8Array([1]).buffer;
const credential = () => ({
  id: "credential",
  rawId: bytes(),
  type: "public-key",
  authenticatorAttachment: "platform",
  response: {
    clientDataJSON: bytes(),
    authenticatorData: bytes(),
    signature: bytes(),
    userHandle: bytes(),
    attestationObject: bytes(),
  },
  getClientExtensionResults: () => ({}),
});
const browser = { get: vi.fn(), create: vi.fn() };
Object.defineProperty(navigator, "credentials", { value: browser, configurable: true });
class FakePublicKeyCredential {
  static isConditionalMediationAvailable() {
    return Promise.resolve(true);
  }
}
Object.assign(globalThis, { PublicKeyCredential: FakePublicKeyCredential });
const disposals: Array<() => void> = [];
afterEach(() => {
  cleanup();
  disposals.splice(0).forEach((dispose) => dispose());
  convexAuthenticated = false;
  vi.clearAllMocks();
});

type Session = { user: { id: string; email: string }; session: { id: string; token: string } };
const account: Session = {
  user: { id: "user", email: "user@example.com" },
  session: { id: "passkey-session", token: "private-passkey-token" },
};

function fixture(initial: Session | null) {
  let session = initial;
  let revision = 0;
  const listeners = new Set<() => void>();
  convexAuthenticated = Boolean(initial);
  const passkeys = [{ id: "laptop", name: "Laptop", userId: "user", createdAt: new Date(0) }];
  const failures = new Map<string, string>();
  const requests: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname.replace(/^\/api\/auth/, "");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ path, body });
    const failure = failures.get(path);
    if (failure)
      return Response.json(
        { code: failure, message: failure },
        { status: failure === "SESSION_NOT_FRESH" ? 403 : 401 },
      );
    let value: unknown = {};
    if (path === "/passkey/generate-authenticate-options") value = { challenge: "Y2hhbGxlbmdl" };
    if (path === "/passkey/generate-register-options")
      value = {
        challenge: "Y2hhbGxlbmdl",
        rp: { id: "example.com", name: "Example" },
        user: { id: "dXNlcg", name: "user@example.com", displayName: "User" },
        pubKeyCredParams: [],
      };
    if (path === "/passkey/verify-authentication") {
      session = account;
      value = account;
    }
    if (path === "/passkey/verify-registration") {
      const row = { id: "phone", name: "Phone", userId: "user", createdAt: new Date(1) };
      passkeys.push(row);
      value = row;
    }
    if (path === "/passkey/list-user-passkeys") value = passkeys;
    if (path === "/passkey/delete-passkey") {
      passkeys.splice(
        passkeys.findIndex((row) => row.id === body.id),
        1,
      );
      value = { status: true };
    }
    return Response.json(value);
  });
  const original = createAuthClient({
    baseURL: "https://auth.example.com",
    plugins: [passkeyClient()],
    fetchOptions: { customFetchImpl: transport },
  });
  const emit = () => {
    revision++;
    for (const listener of listeners) listener();
  };
  const authClient = {
    useSession() {
      useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => revision,
        () => revision,
      );
      return {
        data: session,
        isPending: false,
        refetch: async () => {
          convexAuthenticated = Boolean(session);
          emit();
          return { data: session, error: null };
        },
      };
    },
    signIn: { email: vi.fn(), passkey: original.signIn.passkey },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
    signOut: vi.fn(),
    passkey: original.passkey,
  };
  const authData = createAuthDataClient({
    authClient,
    api: { signals: makeFunctionReference<"query">("authData:signals") as any },
    features: { authentication: true, passkeys: true },
  });
  disposals.push(() => authData.dispose());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={authData}>{children}</AuthDataProvider>
  );
  return { authData, wrapper, passkeys, failures, requests };
}

it("signs in with a passkey and waits for its session, as a password sign-in does", async () => {
  const f = fixture(null);
  const onAuthenticated = vi.fn();
  browser.get.mockImplementation(async () => credential());
  const hook = renderHook(() => f.authData.usePasskeySignIn({ onAuthenticated }), {
    wrapper: f.wrapper,
  });
  await waitFor(() => expect(hook.result.current.actions.signIn.isDisabled).toBe(false));
  await act(async () => {
    expect(await hook.result.current.actions.signIn.run()).toEqual({
      status: "success",
      data: { outcome: "authenticated", userId: "user", sessionId: "passkey-session" },
    });
  });
  expect(onAuthenticated).toHaveBeenCalledOnce();
  expect(browser.get.mock.calls[0]?.[0]).not.toHaveProperty("mediation");
});

it("completes a cancelled prompt without an error, and reports a passkey the server refuses", async () => {
  const f = fixture(null);
  const onError = vi.fn();
  browser.get.mockRejectedValueOnce(
    new DOMException("The operation either timed out or was not allowed.", "NotAllowedError"),
  );
  const hook = renderHook(() => f.authData.usePasskeySignIn({ onError }), { wrapper: f.wrapper });
  await waitFor(() => expect(hook.result.current.actions.signIn.isDisabled).toBe(false));
  await act(async () => {
    expect(await hook.result.current.actions.signIn.run()).toEqual({
      status: "success",
      data: { outcome: "cancelled" },
    });
  });
  expect(onError).not.toHaveBeenCalled();
  expect(hook.result.current.feedback).toEqual([]);

  browser.get.mockImplementation(async () => credential());
  f.failures.set("/passkey/verify-authentication", "PASSKEY_NOT_FOUND");
  await act(async () => {
    expect(await hook.result.current.actions.signIn.run()).toMatchObject({
      status: "error",
      error: { phase: "write", cause: { code: "PASSKEY_NOT_FOUND" } },
    });
  });
  expect(onError).toHaveBeenCalledOnce();
});

it("offers passkeys among the browser's suggestions and signs in with the one chosen", async () => {
  const f = fixture(null);
  let choose!: (value: unknown) => void;
  browser.get.mockReturnValue(new Promise((resolve) => (choose = resolve)));
  const onAuthenticated = vi.fn();
  function SignIn() {
    f.authData.usePasskeySignIn({ autoFill: true, onAuthenticated });
    return <input autoComplete="username webauthn" />;
  }
  render(<SignIn />, { wrapper: f.wrapper });
  await waitFor(() =>
    expect(browser.get).toHaveBeenCalledWith(expect.objectContaining({ mediation: "conditional" })),
  );
  await act(async () => choose(credential()));
  await waitFor(() =>
    expect(onAuthenticated).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "authenticated", userId: "user" }),
    ),
  );
  expect(browser.get).toHaveBeenCalledOnce();
});

it("lists, adds and removes the account's passkeys, asking for a recent sign-in to add one", async () => {
  const f = fixture(account);
  browser.create.mockImplementation(async () => credential());
  const hook = renderHook(() => f.authData.usePasskeys(), { wrapper: f.wrapper });
  await waitFor(() => expect(hook.result.current.data?.map(({ id }) => id)).toEqual(["laptop"]));

  f.failures.set("/passkey/generate-register-options", "SESSION_NOT_FRESH");
  await act(async () => {
    await hook.result.current.actions.add.run();
  });
  expect(hook.result.current.needsFreshSession).toBe(true);
  expect(browser.create).not.toHaveBeenCalled();

  f.failures.delete("/passkey/generate-register-options");
  await act(async () => {
    expect(await hook.result.current.actions.add.run()).toMatchObject({
      status: "success",
      data: { outcome: "added", passkey: { id: "phone" } },
    });
  });
  expect(hook.result.current.needsFreshSession).toBe(false);
  await waitFor(() =>
    expect(hook.result.current.data?.map(({ id }) => id)).toEqual(["laptop", "phone"]),
  );

  await act(async () => {
    expect(await hook.result.current.passkey("laptop").remove.run()).toEqual({
      status: "success",
      data: { outcome: "deleted" },
    });
  });
  expect(f.requests).toContainEqual({ path: "/passkey/delete-passkey", body: { id: "laptop" } });
  await waitFor(() => expect(hook.result.current.data?.map(({ id }) => id)).toEqual(["phone"]));
});
