// @vitest-environment jsdom
// The accounts workflows over a model of a device: the accounts it keeps signed in, the one its
// cookie names, and the one this context (a tab) has chosen, as deviceAccountsClient() keeps them.
import { useSyncExternalStore, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import {
  AuthDataProvider,
  createAuthDataClient,
  type AuthDataLifecycle,
} from "../packages/auth-client/src/index.js";

let convexAuthenticated = false;
const convex = {
  watchQuery: vi.fn(() => ({ localQueryResult: () => undefined, onUpdate: () => () => {} })),
};
vi.mock("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => ({ isAuthenticated: convexAuthenticated, isLoading: false }),
}));
const api = { signals: makeFunctionReference<"query">("authData:signals") as any };
const disposals: Array<() => void> = [];

afterEach(() => {
  cleanup();
  disposals.splice(0).forEach((dispose) => dispose());
  convexAuthenticated = false;
  vi.clearAllMocks();
});

type Session = {
  user: { id: string; email: string; isAnonymous?: boolean };
  session: { id: string; token: string };
};
const person = (id: string, isAnonymous?: boolean): Session => ({
  user: { id, email: `${id}@example.com`, ...(isAnonymous ? { isAnonymous } : {}) },
  session: { id: `${id}-session`, token: `${id}-token` },
});

/** The device: its signed-in accounts (oldest first), the cookie's account and the tab's choice. */
function device(...signedIn: Session[]) {
  const accounts = [...signedIn];
  let cookie = accounts.at(-1)?.session.token;
  let chosen: string | undefined;
  let observed = current();
  let failRefresh: number | undefined;
  let revision = 0;
  const listeners = new Set<() => void>();
  convexAuthenticated = Boolean(observed);
  function current() {
    const token = chosen ?? cookie;
    return accounts.find((entry) => entry.session.token === token) ?? null;
  }
  function settle() {
    // A kept account that is gone gives way to the device's (deviceAccountsClient's fallback).
    if (chosen && !accounts.some((entry) => entry.session.token === chosen)) chosen = undefined;
    observed = current();
    convexAuthenticated = Boolean(observed);
    revision++;
    for (const listener of listeners) listener();
  }
  const auth = {
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
        data: observed,
        isPending: false,
        refetch: async () => {
          settle();
          if (failRefresh !== undefined && failRefresh-- === 0) {
            failRefresh = undefined;
            throw new Error("session read failed");
          }
          return { data: observed, error: null };
        },
      };
    },
    signIn: {
      email: vi.fn(async (input: Record<string, unknown>) => {
        const id = String(input.email).split("@")[0]!;
        const next = accounts.find(({ user }) => user.id === id) ?? person(id);
        if (!accounts.includes(next)) accounts.push(next);
        cookie = chosen = next.session.token;
        return { user: next.user, token: next.session.token };
      }),
      anonymous: vi.fn(async () => {
        const next = person(`guest-${accounts.length}`, true);
        accounts.push(next);
        cookie = chosen = next.session.token;
        return { user: next.user, token: next.session.token };
      }),
    },
    signUp: { email: vi.fn(async () => ({ status: true })) },
    requestPasswordReset: vi.fn(async () => ({ status: true })),
    resetPassword: vi.fn(async () => ({ status: true })),
    sendVerificationEmail: vi.fn(async () => ({ status: true })),
    signOut: vi.fn(async () => {
      accounts.splice(0);
      cookie = undefined;
      return { success: true };
    }),
    multiSession: {
      revoke: vi.fn(async ({ sessionToken }: { sessionToken: string }) => {
        const index = accounts.findIndex((entry) => entry.session.token === sessionToken);
        if (index < 0) throw Object.assign(new Error("Invalid session token"), { status: 401 });
        accounts.splice(index, 1);
        if (cookie === sessionToken) cookie = (current() ?? accounts.at(-1))?.session.token;
        return { status: true };
      }),
    },
    deviceAccounts: {
      list: vi.fn(async () =>
        accounts.map(({ user, session }) => ({ user, session, organizations: [] })),
      ),
      select: vi.fn((token: string | null) => {
        chosen = token ?? undefined;
      }),
      selected: () => chosen,
    },
  };
  return {
    auth,
    get current() {
      return observed?.user.id;
    },
    get signedIn() {
      return accounts.map(({ user }) => user.id);
    },
    /** Fails the session read after `skip` more succeed. */
    failNextRefresh(skip = 0) {
      failRefresh = skip;
    },
  };
}

function fixture(features: { guests?: true }, ...signedIn: Session[]) {
  const model = device(...signedIn);
  const client = createAuthDataClient({
    authClient: model.auth,
    api,
    features: { authentication: true, accounts: true, ...features },
  });
  return { model, client, wrapper: provide(client) };
}

/** As `fixture`, typed with guests (whose accounts can switch to a guest). */
function guestFixture(...signedIn: Session[]) {
  const model = device(...signedIn);
  const client = createAuthDataClient({
    authClient: model.auth,
    api,
    features: { authentication: true, guests: true, accounts: true },
  });
  return { model, client, wrapper: provide(client) };
}

function provide(client: { dispose(): void }) {
  disposals.push(() => client.dispose());
  return ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={client as AuthDataLifecycle}>{children}</AuthDataProvider>
  );
}

const alice = person("alice");
const bob = person("bob");

it("switches this context to another of the device's accounts", async () => {
  const { model, client, wrapper } = fixture({}, alice, bob);
  const onSwitched = vi.fn();
  const hook = renderHook(() => client.useAccounts({ onSwitched }), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(2));
  expect(hook.result.current.currentUserId).toBe("bob");
  // The context's own account and an unknown one cannot be switched to.
  expect(hook.result.current.account("bob").switch.disabledReason).toEqual({ code: "unavailable" });
  expect(hook.result.current.account("carol").switch.isDisabled).toBe(true);

  await act(async () => {
    expect(await hook.result.current.account("alice").switch.run()).toEqual({
      status: "success",
      data: { outcome: "switched", userId: "alice", sessionId: "alice-session" },
    });
  });
  expect(model.current).toBe("alice");
  expect(model.signedIn).toEqual(["alice", "bob"]);
  expect(model.auth.deviceAccounts.select).toHaveBeenCalledWith("alice-token");
  expect(onSwitched).toHaveBeenCalledOnce();
  await waitFor(() => expect(hook.result.current.currentUserId).toBe("alice"));
});

it("adds an account by signing in from another, the context becoming it", async () => {
  const { model, client, wrapper } = fixture({}, alice);
  const onAuthenticated = vi.fn();
  const hook = renderHook(
    () =>
      client.useSignInForm({
        initialValues: { email: "bob@example.com", password: "secret" },
        onAuthenticated,
      }),
    { wrapper },
  );
  await waitFor(() => expect(hook.result.current.actions.submit.isDisabled).toBe(false));
  await act(async () => {
    expect(await hook.result.current.actions.submit.run()).toMatchObject({
      status: "success",
      data: { outcome: "authenticated", userId: "bob" },
    });
  });
  expect(model.signedIn).toEqual(["alice", "bob"]);
  expect(model.current).toBe("bob");
  expect(onAuthenticated).toHaveBeenCalledWith(
    expect.not.objectContaining({ guestUserId: expect.anything() }),
  );
});

it("signs this context out of its account only, moving on to the device's next", async () => {
  const { model, client, wrapper } = fixture({}, alice, bob);
  const onSignedOut = vi.fn();
  const hook = renderHook(() => client.useSignOut({ onSignedOut }), { wrapper });
  await waitFor(() => expect(hook.result.current.actions.signOut.isDisabled).toBe(false));
  await act(async () => {
    expect(await hook.result.current.actions.signOut.run()).toEqual({
      status: "success",
      data: { outcome: "signedOut" },
    });
  });
  expect(model.auth.multiSession.revoke).toHaveBeenCalledWith(
    { sessionToken: "bob-token" },
    expect.anything(),
  );
  expect(model.auth.signOut).not.toHaveBeenCalled();
  // The context moved on to alice before bob's session went.
  expect(model.auth.deviceAccounts.select.mock.invocationCallOrder[0]).toBeLessThan(
    model.auth.multiSession.revoke.mock.invocationCallOrder[0]!,
  );
  expect(model.signedIn).toEqual(["alice"]);
  expect(model.current).toBe("alice");
  expect(onSignedOut).toHaveBeenCalledOnce();
});

it("signs another account out of the device without touching this context", async () => {
  const { model, client, wrapper } = fixture({}, alice, bob);
  const onSignedOut = vi.fn();
  const hook = renderHook(() => client.useAccounts({ onSignedOut }), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(2));
  await act(async () => {
    expect(await hook.result.current.account("alice").signOut.run()).toEqual({
      status: "success",
      data: { outcome: "signedOut", userId: "alice" },
    });
  });
  expect(model.current).toBe("bob");
  expect(model.signedIn).toEqual(["bob"]);
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  expect(onSignedOut).toHaveBeenCalledWith({ outcome: "signedOut", userId: "alice" });
});

it("signs every account out of the device", async () => {
  const { model, client, wrapper } = fixture({}, alice, bob);
  const hook = renderHook(() => client.useAccounts(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions.signOutAll.isDisabled).toBe(false));
  await act(async () => {
    expect(await hook.result.current.actions.signOutAll.run()).toMatchObject({
      status: "success",
      data: { outcome: "signedOut" },
    });
  });
  expect(model.auth.signOut).toHaveBeenCalledOnce();
  expect(model.signedIn).toEqual([]);
  expect(model.current).toBeUndefined();
});

it("recovers signing out of this context's account without revoking twice", async () => {
  const { model, client, wrapper } = fixture({}, alice, bob);
  const hook = renderHook(() => client.useAccounts(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(2));
  // Signing out moves the context on (one read), then synchronizes (the read that fails).
  model.failNextRefresh(1);
  await act(async () => {
    expect(await hook.result.current.account("bob").signOut.run()).toMatchObject({
      status: "error",
      error: { phase: "synchronization", writeSucceeded: true },
    });
  });
  // Until it settles, nothing else may change the context's identity.
  expect(hook.result.current.account("alice").switch.disabledReason).toEqual({ code: "recovery" });
  await act(async () => {
    expect(await hook.result.current.feedback[0]!.recovery!.run()).toEqual({
      status: "success",
      data: { outcome: "signedOut", userId: "bob" },
    });
  });
  expect(model.auth.multiSession.revoke).toHaveBeenCalledOnce();
  expect(model.current).toBe("alice");
});

it("leaves a guest only when no other account remains on the device", async () => {
  const lone = fixture({ guests: true }, alice);
  const hook = renderHook(() => lone.client.useSignOut(), { wrapper: lone.wrapper });
  await waitFor(() => expect(hook.result.current.actions.signOut.isDisabled).toBe(false));
  await act(async () => {
    expect((await hook.result.current.actions.signOut.run()).status).toBe("success");
  });
  expect(lone.model.auth.signIn.anonymous).toHaveBeenCalledOnce();
  await waitFor(() => expect(lone.model.current).toMatch(/^guest-/));
  cleanup();

  const shared = fixture({ guests: true }, alice, bob);
  const other = renderHook(() => shared.client.useSignOut(), { wrapper: shared.wrapper });
  await waitFor(() => expect(other.result.current.actions.signOut.isDisabled).toBe(false));
  await act(async () => {
    expect((await other.result.current.actions.signOut.run()).status).toBe("success");
  });
  expect(shared.model.auth.signIn.anonymous).not.toHaveBeenCalled();
  expect(shared.model.current).toBe("alice");
});

it("makes this context a guest beside the device's accounts, reusing the device's guest", async () => {
  const { model, client, wrapper } = guestFixture(alice, bob);
  const onSwitched = vi.fn();
  const hook = renderHook(() => client.useAccounts({ onSwitched }), { wrapper });
  await waitFor(() => expect(hook.result.current.actions.switchToGuest.isDisabled).toBe(false));
  await act(async () => {
    expect(await hook.result.current.actions.switchToGuest.run()).toMatchObject({
      status: "success",
      data: { outcome: "switched", userId: "guest-2" },
    });
  });
  expect(model.current).toBe("guest-2");
  expect(model.signedIn).toEqual(["alice", "bob", "guest-2"]);
  expect(onSwitched).toHaveBeenCalledOnce();
  // A guest already: nothing to switch to.
  await waitFor(() =>
    expect(hook.result.current.actions.switchToGuest.disabledReason).toEqual({
      code: "unavailable",
    }),
  );

  // Back to an account, a guest again is the same guest.
  await waitFor(() => expect(hook.result.current.data).toHaveLength(3));
  await act(async () => void (await hook.result.current.account("alice").switch.run()));
  await waitFor(() => expect(hook.result.current.actions.switchToGuest.isDisabled).toBe(false));
  await act(async () => void (await hook.result.current.actions.switchToGuest.run()));
  expect(model.auth.signIn.anonymous).toHaveBeenCalledOnce();
  expect(model.current).toBe("guest-2");
});

it("signs the device's last account out with Better Auth's sign-out", async () => {
  const { model, client, wrapper } = fixture({}, alice);
  const hook = renderHook(() => client.useSignOut(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions.signOut.isDisabled).toBe(false));
  await act(async () => {
    expect((await hook.result.current.actions.signOut.run()).status).toBe("success");
  });
  expect(model.auth.signOut).toHaveBeenCalledOnce();
  expect(model.auth.multiSession.revoke).not.toHaveBeenCalled();
  expect(model.current).toBeUndefined();
});
