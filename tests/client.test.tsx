// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthDataClient, AuthDataProvider } from "../packages/auth-client/src/index.js";
import { makeFunctionReference } from "convex/server";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
const convex = {
  watchQuery: vi.fn(() => ({ onUpdate: () => () => {}, localQueryResult: () => undefined })),
};
const convexAuth = { isAuthenticated: true, isLoading: false };
vi.mock("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => convexAuth,
}));
const api = { signals: makeFunctionReference<"query">("authData:signals") as any };
afterEach(() => {
  Object.assign(convexAuth, { isAuthenticated: true, isLoading: false });
  cleanup();
  vi.restoreAllMocks();
});
it("does not fetch when constructed and forwards actual Better Auth mutation options", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: "org" }), {
        headers: { "content-type": "application/json" },
      }),
  );
  const auth = createAuthClient({
    baseURL: "https://auth.example.com",
    plugins: [organizationClient()],
    fetchOptions: { customFetchImpl: fetch },
  });
  const authData = createAuthDataClient({
    authClient: auth,
    api,
    features: { organization: true },
  });
  expect(fetch).not.toHaveBeenCalled();
  const success = vi.fn();
  const response = await authData.organization.create(
    { name: "Name", slug: "name" },
    { onSuccess: success },
  );
  expect(response.data?.id).toBe("org");
  expect(success).toHaveBeenCalledTimes(1);
  expect(authData).not.toHaveProperty("useSession");
  authData.dispose();
});
it("uses a private cache without replacing application context and fetches hook data", async () => {
  const listSessions = vi.fn(async (_options: unknown) => [
    { id: "session", expiresAt: "2099-01-01" },
  ]);
  const auth = {
    useSession: () => ({
      data: { user: { id: "user" }, session: { id: "session" } },
      isPending: false,
    }),
    listSessions,
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const authData = createAuthDataClient({
    authClient: auth,
    api,
    features: { sessions: true },
  });
  const application = new QueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={application}>
        <AuthDataProvider client={authData}>{children}</AuthDataProvider>
      </QueryClientProvider>
    );
  }
  const hook = renderHook(() => ({ query: authData.useListSessions(), cache: useQueryClient() }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(hook.result.current.query.data).toHaveLength(1));
  expect(hook.result.current.cache).toBe(application);
  expect(listSessions.mock.calls[0]?.[0]).toMatchObject({
    fetchOptions: { throw: true, disableSignal: true },
  });
  authData.dispose();
});

it("reads with the Better Auth session before Convex authenticates and keeps that result", async () => {
  Object.assign(convexAuth, { isAuthenticated: false, isLoading: true });
  convex.watchQuery.mockClear();
  const listSessions = vi.fn(async () => [{ id: "session" }]);
  const auth = {
    useSession: () => ({
      data: { user: { id: "user" }, session: { id: "session", token: "token" } },
      isPending: false,
    }),
    listSessions,
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const authData = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <AuthDataProvider client={authData}>{children}</AuthDataProvider>;
  }
  const hook = renderHook(() => authData.useListSessions(), { wrapper: Wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  expect(convex.watchQuery).not.toHaveBeenCalled();
  Object.assign(convexAuth, { isAuthenticated: true, isLoading: false });
  hook.rerender();
  expect(hook.result.current.data).toHaveLength(1);
  expect(hook.result.current.isPending).toBe(false);
  expect(listSessions).toHaveBeenCalledOnce();
  authData.dispose();
});

it("lets an in-flight read finish on the first freshness signal, then refetches once", async () => {
  let update = () => {};
  let signal: unknown;
  convex.watchQuery.mockReturnValue({
    onUpdate: (callback: () => void) => {
      update = callback;
      return () => {};
    },
    localQueryResult: () => signal,
  } as any);
  let resolveFirst!: (value: unknown) => void;
  const listSessions = vi
    .fn()
    .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
    .mockResolvedValue([{ id: "fresh" }]);
  const auth = {
    useSession: () => ({
      data: { user: { id: "user" }, session: { id: "session" } },
      isPending: false,
    }),
    listSessions,
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const authData = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <AuthDataProvider client={authData}>{children}</AuthDataProvider>;
  }
  const hook = renderHook(() => authData.useListSessions(), { wrapper: Wrapper });
  await waitFor(() => expect(listSessions).toHaveBeenCalledOnce());
  signal = {
    protocol: 1,
    features: { sessions: true },
    userId: "user",
    denied: false,
    revisions: [1],
  };
  await act(async () => {
    update();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const firstRequest = listSessions.mock.calls[0]![0] as { fetchOptions: { signal: AbortSignal } };
  expect(firstRequest.fetchOptions.signal.aborted).toBe(false);
  expect(listSessions).toHaveBeenCalledOnce();
  await act(async () => resolveFirst([{ id: "first" }]));
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "fresh" }]));
  expect(listSessions).toHaveBeenCalledTimes(2);
  signal = { ...(signal as object), revisions: [2] };
  act(() => update());
  await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(3));
  authData.dispose();
});

it("surfaces backend protocol errors and rejects explicit refresh", async () => {
  const signal = {
    protocol: 99,
    features: { sessions: true },
    userId: "user",
    denied: false,
    revisions: [0],
  };
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => signal,
  } as any);
  const auth = {
    useSession: () => ({ data: { user: { id: "user" }, session: { id: "s" } }, isPending: false }),
    listSessions: async () => [],
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const adapter = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={adapter}>{children}</AuthDataProvider>
  );
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(String(hook.result.current.error)).toContain("capability mismatch"));
  await expect(adapter.refresh()).rejects.toThrow("capability mismatch");
  adapter.dispose();
});

it("masks old identity immediately and ignores a late HTTP response", async () => {
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => undefined,
  });
  let identity = { user: { id: "first" }, session: { id: "first-session" } };
  let resolveOld: (data: any) => void = () => {};
  const auth = {
    useSession: () => ({ data: identity, isPending: false }),
    listSessions: vi.fn(() =>
      identity.user.id === "first"
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve([{ id: "second-result" }]),
    ),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const adapter = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={adapter}>{children}</AuthDataProvider>
  );
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(auth.listSessions).toHaveBeenCalled());
  identity = { user: { id: "second" }, session: { id: "second-session" } };
  hook.rerender();
  expect(hook.result.current.data).toBeUndefined();
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "second-result" }]));
  resolveOld([{ id: "private-first-result" }]);
  await Promise.resolve();
  expect(hook.result.current.data).toEqual([{ id: "second-result" }]);
  adapter.dispose();
});

it("shares watches across hook observers and releases each watch once", async () => {
  const stop = vi.fn();
  convex.watchQuery.mockClear();
  convex.watchQuery.mockReturnValue({ onUpdate: () => stop, localQueryResult: () => undefined });
  const auth = {
    useSession: () => ({ data: { user: { id: "user" }, session: { id: "s" } }, isPending: false }),
    listSessions: async () => [],
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const adapter = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={adapter}>{children}</AuthDataProvider>
  );
  const hook = renderHook(() => [adapter.useListSessions(), adapter.useListSessions()], {
    wrapper,
  });
  await waitFor(() => expect(hook.result.current[0]?.data).toEqual([]));
  expect(convex.watchQuery).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
  adapter.dispose();
});

it("survives Strict Mode effect replay without losing its cache observer", async () => {
  const { StrictMode } = await import("react");
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => undefined,
  });
  const auth = {
    useSession: () => ({ data: { user: { id: "user" }, session: { id: "s" } }, isPending: false }),
    listSessions: async () => [{ id: "restored" }],
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const adapter = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <AuthDataProvider client={adapter}>{children}</AuthDataProvider>
    </StrictMode>
  );
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "restored" }]));
  hook.unmount();
  adapter.dispose();
});

function sessionFixture() {
  const auth = {
    useSession: () => ({ data: { user: { id: "user" }, session: { id: "s" } }, isPending: false }),
    listSessions: vi.fn(async () => [{ id: "private" }]),
    revokeSession: vi.fn(async () => ({ data: { status: true }, error: null })),
    revokeOtherSessions: vi.fn(),
    revokeSessions: vi.fn(),
  };
  const adapter = createAuthDataClient({ authClient: auth, api, features: { sessions: true } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={adapter}>{children}</AuthDataProvider>
  );
  return { auth, adapter, wrapper };
}

it("permanently disposes mounted observers and rejects subsequent writes", async () => {
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => undefined,
  });
  const { auth, adapter, wrapper } = sessionFixture();
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "private" }]));
  act(() => adapter.dispose());
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.isPending).toBe(false);
  await expect(adapter.revokeSession()).rejects.toThrow("disposed");
  expect(auth.revokeSession).not.toHaveBeenCalled();
  await expect(adapter.refresh()).rejects.toThrow("disposed");
  act(() => adapter.dispose());
});

it("allows resource refetch to recover from a synchronization error", async () => {
  let failed = true;
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => {
      if (failed) throw new Error("Signal unavailable");
      return {
        protocol: 1,
        features: { sessions: true },
        userId: "user",
        denied: false,
        revisions: [0],
      };
    },
  } as any);
  const { adapter, wrapper } = sessionFixture();
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(String(hook.result.current.error)).toContain("Signal unavailable"));
  expect(hook.result.current.data).toBeUndefined();
  failed = false;
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "private" }]));
  expect(hook.result.current.error).toBeNull();
  adapter.dispose();
});

it("does not invalidate a new session when a previous session's write completes", async () => {
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => undefined,
  });
  const { auth, adapter, wrapper } = sessionFixture();
  let finish!: (value: { data: { status: boolean }; error: null }) => void;
  auth.revokeSession.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toBeDefined());
  const write = adapter.revokeSession();
  auth.useSession = () => ({
    data: { user: { id: "user" }, session: { id: "new-session" } },
    isPending: false,
  });
  hook.rerender();
  await waitFor(() => expect(hook.result.current.data).toBeDefined());
  const reads = auth.listSessions.mock.calls.length;
  await act(async () => {
    finish({ data: { status: true }, error: null });
    await write;
  });
  expect(auth.listSessions).toHaveBeenCalledTimes(reads);
  adapter.dispose();
});

it("masks invalidated private data on an upstream 400 while retaining it on a server failure", async () => {
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => undefined,
  });
  let status = 200;
  const upstream = createAuthClient({
    baseURL: "https://auth.example.com",
    fetchOptions: {
      customFetchImpl: async () =>
        new Response(
          JSON.stringify(
            status === 200 ? [{ id: "private" }] : { message: "Unavailable", code: "READ_FAILED" },
          ),
          { status, headers: { "content-type": "application/json" } },
        ),
    },
  });
  const { auth, adapter: unused } = sessionFixture();
  unused.dispose();
  const adapter = createAuthDataClient({
    authClient: { ...auth, listSessions: upstream.listSessions },
    api,
    features: { sessions: true },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={adapter}>{children}</AuthDataProvider>
  );
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "private" }]));
  status = 503;
  await act(async () => {
    await expect(hook.result.current.refetch()).rejects.toMatchObject({ status: 503 });
  });
  await waitFor(() => expect(hook.result.current.error).toMatchObject({ status: 503 }));
  expect(hook.result.current.data).toEqual([{ id: "private" }]);
  status = 400;
  await act(async () => {
    await expect(hook.result.current.refetch()).rejects.toMatchObject({ status: 400 });
  });
  await waitFor(() => expect(hook.result.current.data).toBeUndefined());
  expect(hook.result.current.error).toMatchObject({ status: 400 });
  adapter.dispose();
});

it("does not return private refetch data across a session transition", async () => {
  convex.watchQuery.mockReturnValue({
    onUpdate: () => () => {},
    localQueryResult: () => undefined,
  });
  const { auth, adapter, wrapper } = sessionFixture();
  const hook = renderHook(() => adapter.useListSessions(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toEqual([{ id: "private" }]));
  let resolve!: (data: { id: string }[]) => void;
  auth.listSessions.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = hook.result.current.refetch();
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  auth.useSession = () => ({
    data: { user: { id: "another-user" }, session: { id: "another-session" } },
    isPending: false,
  });
  hook.rerender();
  await act(async () => {
    resolve([{ id: "old-private" }]);
    expect(await pending).toBeUndefined();
  });
  adapter.dispose();
});
