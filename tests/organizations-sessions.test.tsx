// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import {
  AuthDataProvider,
  createAuthDataClient,
  type WorkflowOutcome,
} from "../packages/auth-client/src/index.js";

let authenticated = true;
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: authenticated }),
  useConvex: () => convex,
}));
const convex = {
  watchQuery: vi.fn(() => ({ localQueryResult: () => undefined, onUpdate: () => () => {} })),
};
const disposals: Array<() => void> = [];
afterEach(() => {
  cleanup();
  disposals.splice(0).forEach((dispose) => dispose());
  authenticated = true;
  vi.clearAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  let identity = {
    user: { id: "user" },
    session: { id: "current", token: "private-current-token" },
  };
  const organizations = [
    { id: "org", name: "Original", slug: "original", logo: null as string | null },
    { id: "other", name: "Other", slug: "other", logo: null as string | null },
  ];
  const members = ["a", "b", "c"].map((id) => ({
    id,
    organizationId: "org",
    userId: id,
    role: "member",
    user: { id, name: id, email: `${id}@example.com` },
  }));
  const sessions = [
    { id: "current", token: "private-current-token", userId: "user" },
    { id: "second", token: "private-second-token", userId: "user" },
  ];
  const failures = new Map<string, string>();
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  let beforeWrite: (() => Promise<void>) | undefined;
  const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname.split("/").at(-1)!;
    if (failures.has(path))
      return new Response(JSON.stringify({ code: failures.get(path), message: "Unavailable" }), {
        status: failures.get(path) === "SESSION_NOT_FRESH" ? 403 : 503,
      });
    let value: unknown;
    if (init?.method === "POST") {
      if (typeof init.body !== "string") throw new Error("Expected JSON request body");
      const body = JSON.parse(init.body) as Record<string, unknown>;
      writes.push({ path, body });
      await beforeWrite?.();
      const organization = organizations.find((row) => row.id === body.organizationId);
      if (path === "create") {
        const row = {
          id: `org-${organizations.length}`,
          name: String(body.name),
          slug: String(body.slug),
          logo: null,
        };
        organizations.push(row);
        value = row;
      } else if (path === "update") {
        Object.assign(organization!, body.data);
        value = organization;
      } else if (path === "leave" || path === "delete") {
        organizations.splice(
          organizations.findIndex((row) => row.id === body.organizationId),
          1,
        );
        value = { success: true };
      } else if (path === "remove-member") {
        members.splice(
          members.findIndex((row) => row.id === body.memberIdOrEmail),
          1,
        );
        value = { success: true };
      } else if (path === "update-member-role") {
        const member = members.find((row) => row.id === body.memberId)!;
        member.role = String(body.role);
        value = member;
      } else if (path.startsWith("revoke")) value = { status: true };
      else value = { id: "invitation", ...body };
    } else if (path === "list") value = organizations;
    else if (path === "get-full-organization") {
      const row = organizations.find(
        (org) =>
          org.id === url.searchParams.get("organizationId") ||
          org.slug === url.searchParams.get("organizationSlug"),
      );
      value = row ? { ...row, members, invitations: [] } : null;
    } else if (path === "get-active-member-role") value = { role: "owner" };
    else if (path === "list-members") {
      const offset = Number(url.searchParams.get("offset"));
      if (offset) throw new Error("Convex Better Auth does not support offsets");
      const limit = Number(url.searchParams.get("limit"));
      value = { members: members.slice(offset, offset + limit), total: members.length };
    } else if (path === "list-sessions") value = sessions;
    else value = [];
    return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  });
  const original = createAuthClient({
    baseURL: "https://auth.example.com",
    plugins: [organizationClient()],
    fetchOptions: { customFetchImpl: transport },
  });
  const authData = createAuthDataClient({
    authClient: {
      organization: original.organization,
      listSessions: original.listSessions,
      revokeSession: original.revokeSession,
      revokeSessions: original.revokeSessions,
      revokeOtherSessions: original.revokeOtherSessions,
      useSession: () => ({ data: identity, isPending: false }),
    },
    features: { organization: true, sessions: true },
    api: { signals: makeFunctionReference("authData:signals") },
  });
  disposals.push(() => authData.dispose());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthDataProvider client={authData}>{children}</AuthDataProvider>
  );
  return {
    authData,
    organizations,
    members,
    sessions,
    writes,
    transport,
    failures,
    wrapper,
    delayWrites: (fn: typeof beforeWrite) => {
      beforeWrite = fn;
    },
    switchIdentity: () => {
      identity = { user: { id: "other-user" }, session: { id: "new-session", token: "new-token" } };
    },
  };
}
const initial = (organization: { name: string; slug: string }) => ({
  name: organization.name,
  slug: organization.slug,
});

it("shares one typed form across controls and retains its draft across schema updates", async () => {
  const f = fixture();
  const schema = z.object({ name: z.string().trim().min(1), slug: z.string() });
  const Settings = f.authData.defineOrganizationSettings(schema);
  let selectedSchema = schema;
  const hook = renderHook(
    () => [Settings.useWorkflowContext(), Settings.useWorkflowContext()] as const,
    {
      wrapper: ({ children }) => (
        <f.wrapper>
          <Settings.Root organizationId="org" getInitialValues={initial} schema={selectedSchema}>
            {children}
          </Settings.Root>
        </f.wrapper>
      ),
    },
  );
  await waitFor(() => expect(hook.result.current[0].form).not.toBeNull());
  expect(hook.result.current[0]).toBe(hook.result.current[1]);
  act(() => hook.result.current[0].form!.field("name").onChange("  Draft  "));
  selectedSchema = z.object({
    name: z.string().trim().min(1, "Localized validation"),
    slug: z.string(),
  });
  hook.rerender();
  expect(hook.result.current[1].form!.field("name").value).toBe("  Draft  ");
  await act(async () => {
    expect(await hook.result.current[1].form!.actions.submit.run()).toMatchObject({
      status: "success",
    });
  });
  expect(f.writes).toEqual([
    { path: "update", body: { organizationId: "org", data: { name: "Draft", slug: "original" } } },
  ]);
  act(() => f.switchIdentity());
  hook.rerender();
  await waitFor(() => expect(hook.result.current[0].form?.field("name").value).toBe("Draft"));
  expect(hook.result.current[0].form?.isDirty).toBe(false);
});

it("does not substitute another definition's context for the matching root", () => {
  const f = fixture();
  const schema = z.object({ name: z.string(), slug: z.string() });
  const First = f.authData.defineOrganizationCreateForm(schema);
  const Second = f.authData.defineOrganizationCreateForm(schema);
  expect(() =>
    renderHook(() => Second.useWorkflowContext(), {
      wrapper: ({ children }) => (
        <f.wrapper>
          <First.Root initialValues={{ name: "", slug: "" }}>{children}</First.Root>
        </f.wrapper>
      ),
    }),
  ).toThrow("matching root");
});

it.each(["update", "leave", "delete"] as const)(
  "%s holds navigation after write or synchronization failure and retries only the read",
  async (operation) => {
    const f = fixture();
    const navigate = vi.fn();
    const hook = renderHook(
      () =>
        f.authData.useOrganizationSettings({
          organizationId: "org",
          getInitialValues: initial,
          onUpdated: navigate,
          onLeft: navigate,
          onDeleted: navigate,
        }),
      { wrapper: f.wrapper },
    );
    await waitFor(() => expect(hook.result.current.form).not.toBeNull());
    const perform = () =>
      operation === "update"
        ? hook.result.current.actions.update.run({ slug: "renamed" })
        : hook.result.current.actions[operation].run();
    f.failures.set(operation, "WRITE_DENIED");
    await act(async () => {
      expect(await perform()).toMatchObject({
        status: "error",
        error: { phase: "write", writeSucceeded: false },
      });
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(hook.result.current.feedback.every((entry) => entry.recovery === null)).toBe(true);
    f.failures.delete(operation);
    f.failures.set("list", "OFFLINE");
    await act(async () => {
      expect(await perform()).toMatchObject({
        status: "error",
        error: { phase: "synchronization", writeSucceeded: true },
      });
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(1);
    act(() => hook.result.current.reset());
    expect(hook.result.current.feedback[0]?.target.operation).toBe(operation);
    expect(hook.result.current.actions[operation].disabledReason).toEqual({ code: "recovery" });
    await act(async () => {
      expect(await perform()).toMatchObject({ status: "ignored", reason: "unavailable" });
    });
    f.failures.delete("list");
    await act(async () => {
      expect(await hook.result.current.feedback[0]!.recovery!.run()).toMatchObject({
        status: "success",
      });
    });
    expect(f.writes).toHaveLength(1);
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ operation, organizationId: "org" });
    if (operation === "update")
      expect(navigate.mock.calls[0]?.[0]).toMatchObject({ organization: { slug: "renamed" } });
    expect(hook.result.current.feedback).toHaveLength(0);
    expect(navigate).toHaveBeenCalledOnce();
  },
);

it.each([false, true])(
  "reports delivered completion after navigation, including callback failure=%s",
  async (failCallback) => {
    const f = fixture();
    let unmount = () => {};
    const navigate = vi.fn(() => {
      unmount();
      if (failCallback) throw new Error("Navigation failed after departure");
    });
    const hook = renderHook(
      () =>
        f.authData.useOrganizationCreateForm({
          initialValues: { name: "New", slug: "new" },
          onCreated: navigate,
        }),
      { wrapper: f.wrapper },
    );
    unmount = hook.unmount;
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    await act(async () => {
      expect(await hook.result.current.actions.submit.run()).toMatchObject(
        failCallback
          ? { status: "error", error: { phase: "callback", writeSucceeded: true } }
          : { status: "success", data: { organization: { slug: "new" } } },
      );
    });
    expect(navigate).toHaveBeenCalledOnce();
    expect(f.writes).toHaveLength(1);
  },
);

it("does not navigate back after leaving a screen during post-write synchronization", async () => {
  const f = fixture();
  const navigate = vi.fn();
  const hook = renderHook(
    () =>
      f.authData.useOrganizationSettings({
        organizationId: "org",
        getInitialValues: initial,
        onUpdated: navigate,
      }),
    { wrapper: f.wrapper },
  );
  await waitFor(() => expect(hook.result.current.form).not.toBeNull());
  const gate = deferred<void>();
  const transport = f.transport.getMockImplementation()!;
  let refreshing = false;
  f.transport.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/organization/list")) {
      refreshing = true;
      await gate.promise;
    }
    return transport(input, init);
  });
  let pending!: Promise<WorkflowOutcome<unknown>>;
  act(() => {
    pending = hook.result.current.actions.update.run({ name: "Updated" });
  });
  await waitFor(() => expect(refreshing).toBe(true));
  expect(f.writes).toHaveLength(1);
  hook.unmount();
  await act(async () => {
    gate.resolve();
    expect(await pending).toEqual({ status: "ignored", reason: "obsolete" });
  });
  expect(navigate).not.toHaveBeenCalled();
});

it("keeps directory selection controlled and applies fallback only without an explicit selection", async () => {
  const f = fixture();
  expect(f.transport).not.toHaveBeenCalled();
  const onSelect = vi.fn();
  const hook = renderHook(
    ({ selection }: { selection?: { organizationId: string } }) =>
      f.authData.useOrganizationDirectory({ selection, onSelect }),
    { wrapper: f.wrapper, initialProps: {} },
  );
  await waitFor(() => expect(hook.result.current.status).toBe("unselected"));
  await act(async () => {
    expect(await hook.result.current.select("org").run()).toMatchObject({
      status: "success",
    });
  });
  expect(hook.result.current.organization).toBeNull();
  expect(onSelect).toHaveBeenCalledOnce();
  expect(f.writes).toHaveLength(0);
  hook.rerender({ selection: { organizationId: "missing" } });
  expect(hook.result.current.status).toBe("unavailable");
  const fallback = renderHook(() => f.authData.useOrganizationDirectory({ fallback: "first" }), {
    wrapper: f.wrapper,
  });
  await waitFor(() => expect(fallback.result.current.organization?.id).toBe("org"));
});

it("reports directory read loading separately from owned action pending", async () => {
  const f = fixture();
  const hook = renderHook(() => f.authData.useOrganizationDirectory(), { wrapper: f.wrapper });
  expect(hook.result.current).toMatchObject({ isLoading: true, isPending: false, data: undefined });
  expect(hook.result.current.status).toBe("loading");
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.data).toHaveLength(2);
  expect(hook.result.current.isPending).toBe(false);
});

it("creates from a transformed draft, preserves active selection, and retries only failed synchronization", async () => {
  const f = fixture();
  const onCreated = vi.fn();
  const schema = z.object({
    name: z.string(),
    slug: z.string().transform((value) => value.toLowerCase()),
  });
  const hook = renderHook(
    () =>
      f.authData.useOrganizationCreateForm({
        schema,
        initialValues: { name: "New", slug: "NEW" },
        onCreated,
      }),
    { wrapper: f.wrapper },
  );
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  f.failures.set("list", "SYNC_DOWN");
  await act(async () => {
    expect(await hook.result.current.actions.submit.run()).toMatchObject({
      status: "error",
      error: { phase: "synchronization", writeSucceeded: true },
    });
  });
  expect(f.writes[0]?.body).toMatchObject({ slug: "new", keepCurrentActiveOrganization: true });
  expect(onCreated).not.toHaveBeenCalled();
  act(() => hook.result.current.reset());
  expect(hook.result.current.feedback[0]?.target.operation).toBe("create");
  await act(async () => {
    expect(await hook.result.current.actions.submit.run()).toEqual({
      status: "ignored",
      reason: "unavailable",
    });
  });
  f.failures.delete("list");
  await act(async () => {
    expect(await hook.result.current.feedback[0]!.recovery!.run()).toMatchObject({
      status: "success",
      data: { organization: { slug: "new" } },
    });
  });
  expect(f.writes).toHaveLength(1);
  expect(onCreated).toHaveBeenCalledOnce();
  expect(hook.result.current.feedback).toHaveLength(0);
});

it("adopts pristine server settings, preserves dirty drafts, and resolves a renamed slug canonically", async () => {
  const f = fixture();
  const onUpdated = vi.fn();
  const renderedNames: unknown[] = [];
  const hook = renderHook(
    () => {
      const state = f.authData.useOrganizationSettings({
        organizationSlug: "original",
        schema: z.object({
          name: z.string(),
          slug: z.string().transform((value) => value.toLowerCase()),
        }),
        getInitialValues: initial,
        onUpdated,
      });
      if (state.form) renderedNames.push(state.form.field("name").value);
      return state;
    },
    { wrapper: f.wrapper },
  );
  await waitFor(() => expect(hook.result.current.form?.values.name).toBe("Original"));
  f.organizations[0]!.name = "Remote";
  await act(async () => {
    await hook.result.current.refetch();
  });
  await waitFor(() => expect(hook.result.current.form?.values.name).toBe("Remote"));
  act(() => hook.result.current.form!.field("name").onChange("Draft"));
  f.organizations[0]!.name = "New remote";
  await act(async () => {
    await hook.result.current.refetch();
  });
  expect(hook.result.current.form!.values.name).toBe("Draft");
  await waitFor(() => expect(hook.result.current.hasServerChanges).toBe(true));
  act(() => hook.result.current.form!.reset());
  expect(hook.result.current.form!.values.name).toBe("New remote");
  act(() => hook.result.current.form!.field("slug").onChange("CANONICAL"));
  await act(async () => {
    expect(await hook.result.current.form!.actions.submit.run()).toMatchObject({
      status: "success",
      data: { organization: { slug: "canonical" } },
    });
  });
  expect(onUpdated).toHaveBeenCalledOnce();
  expect(hook.result.current.organization?.slug).toBe("canonical");
  await waitFor(() => expect(hook.result.current.form?.values.slug).toBe("canonical"));
  expect(renderedNames.every((name) => typeof name === "string")).toBe(true);
});

it("prepares deletion under an exclusive organization lock and leaves unrelated organizations usable", async () => {
  const f = fixture();
  const gate = deferred<void>();
  const beforeDelete = vi.fn(() => gate.promise);
  const settings = renderHook(
    () =>
      f.authData.useOrganizationSettings({
        organizationId: "org",
        getInitialValues: initial,
        beforeDelete,
      }),
    { wrapper: f.wrapper },
  );
  const invite = renderHook(
    () =>
      f.authData.useInvitationForm({
        organizationId: "org",
        initialValues: { email: "a@example.com", role: "member" },
      }),
    { wrapper: f.wrapper },
  );
  const other = renderHook(
    () =>
      f.authData.useOrganizationSettings({ organizationId: "other", getInitialValues: initial }),
    { wrapper: f.wrapper },
  );
  await waitFor(() =>
    expect(settings.result.current.form && other.result.current.form).toBeTruthy(),
  );
  let deleting!: Promise<WorkflowOutcome<unknown>>;
  act(() => {
    deleting = settings.result.current.actions.delete.run();
  });
  await waitFor(() => expect(beforeDelete).toHaveBeenCalledOnce());
  await act(async () => {
    expect(await invite.result.current.actions.submit.run()).toEqual({
      status: "ignored",
      reason: "busy",
    });
    expect(await other.result.current.actions.update.run({ name: "Independent" })).toMatchObject({
      status: "success",
    });
  });
  await act(async () => {
    gate.resolve();
    expect(await deleting).toMatchObject({ status: "success", data: { operation: "delete" } });
  });
  expect(f.writes.map((write) => write.path)).toEqual(["update", "delete"]);
});

it.each(["failure", "unmount", "identity", "disable", "dispose"] as const)(
  "does not delete after preparation %s",
  async (transition) => {
    const f = fixture();
    const gate = deferred<void>();
    let signal: AbortSignal | undefined;
    const onDeleted = vi.fn();
    const hook = renderHook(
      ({ enabled }) =>
        f.authData.useOrganizationSettings({
          organizationId: "org",
          enabled,
          getInitialValues: initial,
          onDeleted,
          beforeDelete: async (context) => {
            signal = context.signal;
            await gate.promise;
            if (transition === "failure") throw new Error("Cleanup failed");
          },
        }),
      { wrapper: f.wrapper, initialProps: { enabled: true } },
    );
    await waitFor(() => expect(hook.result.current.form).toBeTruthy());
    let pending!: Promise<WorkflowOutcome<unknown>>;
    act(() => {
      pending = hook.result.current.actions.delete.run();
    });
    await waitFor(() => expect(signal).toBeDefined());
    if (transition === "unmount") hook.unmount();
    if (transition === "identity") {
      f.switchIdentity();
      hook.rerender({ enabled: true });
    }
    if (transition === "disable") hook.rerender({ enabled: false });
    if (transition === "dispose") act(() => f.authData.dispose());
    await act(async () => {
      gate.resolve();
      expect(await pending).toMatchObject(
        transition === "failure"
          ? { status: "error", error: { phase: "preparation", writeSucceeded: false } }
          : { status: "ignored", reason: "obsolete" },
      );
    });
    expect(f.writes).toHaveLength(0);
    expect(onDeleted).not.toHaveBeenCalled();
    if (transition !== "failure") expect(signal?.aborted).toBe(true);
  },
);

it("enforces changed policies after preparation and preserves policy error codes", async () => {
  const f = fixture();
  const gate = deferred<void>();
  const hook = renderHook(
    ({ permitted }) =>
      f.authData.useOrganizationSettings({
        organizationId: "org",
        getInitialValues: initial,
        beforeDelete: () => gate.promise,
        policy: {
          delete: () =>
            permitted ? { allowed: true } : { allowed: false, code: "personal-organization" },
        },
      }),
    { wrapper: f.wrapper, initialProps: { permitted: true } },
  );
  await waitFor(() => expect(hook.result.current.form).toBeTruthy());
  let pending!: Promise<WorkflowOutcome<unknown>>;
  act(() => {
    pending = hook.result.current.actions.delete.run();
  });
  hook.rerender({ permitted: false });
  await act(async () => {
    gate.resolve();
    expect(await pending).toMatchObject({
      status: "error",
      error: { phase: "validation", cause: { code: "personal-organization" } },
    });
  });
  expect(f.writes).toHaveLength(0);
});

it("owns member pagination, clamps after removal, resets queries, and applies role policies", async () => {
  const f = fixture();
  const hook = renderHook(
    ({ query }) =>
      f.authData.useOrganizationMembers({
        organizationId: "org",
        pageSize: 2,
        query,
        policy: { assignableRoles: () => ["member"] },
      }),
    { wrapper: f.wrapper, initialProps: { query: {} } },
  );
  await waitFor(() => expect(hook.result.current.members).toHaveLength(2));
  act(() => hook.result.current.nextPage());
  await waitFor(() => expect(hook.result.current.members[0]?.id).toBe("c"));
  await act(async () => {
    expect(await hook.result.current.member("c").updateRole("admin").run()).toMatchObject({
      status: "error",
      error: { cause: { code: "role-not-assignable" } },
    });
    expect(await hook.result.current.member("c").remove.run()).toMatchObject({
      status: "success",
    });
  });
  await waitFor(() => expect(hook.result.current.page).toBe(0));
  await waitFor(() => expect(hook.result.current.members).toHaveLength(2));
  hook.rerender({ query: { sortBy: "role", sortDirection: "asc" } });
  expect(hook.result.current.page).toBe(0);
  expect(f.writes).toHaveLength(1);
});

it("keeps session tokens internal to revocation and coordinates individual and session-wide actions", async () => {
  const f = fixture();
  const gate = deferred<void>();
  f.delayWrites(() => gate.promise);
  const first = renderHook(() => f.authData.useSessions(), { wrapper: f.wrapper });
  const second = renderHook(() => f.authData.useSessions(), { wrapper: f.wrapper });
  await waitFor(() => expect(first.result.current.data).toHaveLength(2));
  expect(first.result.current.currentSessionId).toBe("current");
  let pending!: Promise<WorkflowOutcome<unknown>>;
  act(() => {
    pending = first.result.current.session("second").revoke.run();
  });
  await waitFor(() => expect(f.writes).toHaveLength(1));
  expect(first.result.current.session("second").revoke.isPending).toBe(true);
  expect(second.result.current.actions.revokeOthers.disabledReason).toEqual({ code: "busy" });
  expect(JSON.stringify(first.result.current.diagnostics.pendingAction)).not.toContain("token");
  await act(async () => {
    expect(await second.result.current.actions.revokeOthers.run()).toEqual({
      status: "ignored",
      reason: "busy",
    });
    gate.resolve();
    await pending;
  });
  expect(f.writes[0]?.body).toEqual({ token: "private-second-token" });
  expect(second.result.current.actions.revokeOthers.isDisabled).toBe(false);
  await act(async () => {
    expect(await first.result.current.session("missing").revoke.run()).toEqual({
      status: "ignored",
      reason: "unavailable",
    });
  });
});

it("exposes session freshness without renewing authentication or fabricating list entries", async () => {
  const f = fixture();
  f.sessions.shift();
  f.failures.set("list-sessions", "SESSION_NOT_FRESH");
  const hook = renderHook(() => f.authData.useSessions(), { wrapper: f.wrapper });
  await waitFor(() => expect(hook.result.current.needsFreshSession).toBe(true));
  expect(f.writes).toHaveLength(0);
  expect(hook.result.current.data).toBeUndefined();
  f.failures.delete("list-sessions");
  await act(async () => {
    await hook.result.current.refetch();
  });
  expect(hook.result.current.currentSessionId).toBe("current");
  await waitFor(() => expect(hook.result.current.data?.map((row) => row.id)).toEqual(["second"]));
});

it("suppresses callbacks when session revocation outlives the initiating identity", async () => {
  const f = fixture();
  const gate = deferred<void>();
  const onRevoked = vi.fn();
  f.delayWrites(() => gate.promise);
  const hook = renderHook(() => f.authData.useSessions({ onRevoked }), { wrapper: f.wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(2));
  let pending!: Promise<WorkflowOutcome<unknown>>;
  act(() => {
    pending = hook.result.current.actions.revokeAll.run();
  });
  await waitFor(() => expect(f.writes).toHaveLength(1));
  f.switchIdentity();
  hook.rerender();
  await act(async () => {
    gate.resolve();
    expect(await pending).toEqual({ status: "ignored", reason: "obsolete" });
  });
  expect(onRevoked).not.toHaveBeenCalled();
  expect(hook.result.current.diagnostics.pendingAction).toBeNull();
});

it("shares member locks across duplicates and never repeats a write after callback failure", async () => {
  const f = fixture();
  const gate = deferred<void>();
  const onRoleUpdated = vi.fn(() => {
    throw new Error("Presentation failed");
  });
  f.delayWrites(() => gate.promise);
  const first = renderHook(
    () => f.authData.useOrganizationMembers({ organizationId: "org", pageSize: 2, onRoleUpdated }),
    { wrapper: f.wrapper },
  );
  const second = renderHook(
    () => f.authData.useOrganizationMembers({ organizationId: "org", pageSize: 2 }),
    { wrapper: f.wrapper },
  );
  await waitFor(() => expect(first.result.current.members).toHaveLength(2));
  await waitFor(() => expect(second.result.current.members).toHaveLength(2));
  let pending!: Promise<WorkflowOutcome<unknown>>;
  act(() => {
    pending = first.result.current.member("a").updateRole("admin").run();
  });
  await waitFor(() => expect(f.writes).toHaveLength(1));
  await act(async () => {
    expect(await second.result.current.member("a").remove.run()).toEqual({
      status: "ignored",
      reason: "busy",
    });
    gate.resolve();
    expect(await pending).toMatchObject({
      status: "error",
      error: { phase: "callback", writeSucceeded: true },
    });
  });
  act(() => first.result.current.reset());
  expect(f.writes).toHaveLength(1);
  expect(onRoleUpdated).toHaveBeenCalledOnce();
});
