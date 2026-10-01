import { expect, it, vi } from "vitest";
import { CacheRuntime } from "../packages/auth-client/src/cache/query-cache.js";
import type { ConvexReactClient } from "convex/react";
import type { InvalidationApi } from "../packages/auth-client/src/client/types.js";

function fixture() {
  const updates: Array<() => void> = [];
  const stop = vi.fn();
  const convex = {
    watchQuery: vi.fn(() => ({
      onUpdate: (callback: () => void) => {
        updates.push(callback);
        return stop;
      },
      localQueryResult: () => ({
        protocol: 1,
        features: { sessions: true },
        userId: "user",
        denied: false,
        revisions: [0],
      }),
    })),
  };
  const runtime = new CacheRuntime(
    { useSession: () => ({ data: null, isPending: false }) },
    {} as InvalidationApi,
    { sessions: true },
  );
  const detach = runtime.attach(convex as unknown as ConvexReactClient);
  runtime.setIdentity({ userId: "user", sessionId: "one", isAnonymous: false, ready: true });
  return { runtime, convex, updates, stop, detach };
}
const deps = [{ scope: "sessions", subject: "user" }] as const;

it("delivers an existing snapshot only to the newly added observer", () => {
  const { runtime, convex, updates } = fixture();
  const first = vi.fn();
  const second = vi.fn();
  const leaveFirst = runtime.watch([...deps], first);
  const leaveSecond = runtime.watch([...deps], second);
  expect(convex.watchQuery).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  updates[0]?.();
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(2);
  leaveFirst();
  leaveSecond();
  runtime.dispose();
});

it("old session cleanup and queued callbacks cannot affect a replacement watch", () => {
  const { runtime, updates, stop } = fixture();
  const first = vi.fn();
  const second = vi.fn();
  const leaveFirst = runtime.watch([...deps], first);
  runtime.setIdentity({ userId: "user", sessionId: "two", isAnonymous: false, ready: true });
  const leaveSecond = runtime.watch([...deps], second);
  leaveFirst();
  updates[0]?.();
  expect(first).toHaveBeenCalledTimes(1);
  expect(runtime.watches.size).toBe(1);
  updates[1]?.();
  expect(second).toHaveBeenCalledTimes(2);
  leaveSecond();
  expect(stop).toHaveBeenCalledTimes(2);
  runtime.dispose();
});

it("coalesces invalidations and restarts a read invalidated while in flight", async () => {
  const { runtime } = fixture();
  const key = ["auth", "user", "one", "listSessions"];
  const requests: Array<{ signal: AbortSignal; resolve: (value: string[]) => void }> = [];
  const fetch = () =>
    runtime.cache.fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        new Promise<string[]>((resolve) => requests.push({ signal, resolve })),
    });
  const initial = fetch().catch(() => {});
  // An active Query observer is what makes invalidation revalidate a resource.
  const { QueryObserver } = await import("@tanstack/react-query");
  const observer = new QueryObserver(runtime.cache, {
    queryKey: key,
    queryFn: ({ signal }) => new Promise<string[]>((resolve) => requests.push({ signal, resolve })),
  });
  const unsubscribe = observer.subscribe(() => {});
  const first = runtime.invalidate([key]);
  expect(runtime.invalidate([key])).toBe(first);
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0]?.signal.aborted).toBe(true);
  let settled = false;
  const second = runtime.refreshResource(key).then((value) => {
    settled = true;
    return value;
  });
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[1]?.signal.aborted).toBe(true);
  requests[0]?.resolve(["old"]);
  requests[1]?.resolve(["superseded"]);
  expect(settled).toBe(false);
  requests[2]?.resolve(["fresh"]);
  await Promise.allSettled([initial, first, second]);
  expect(runtime.cache.getQueryData(key)).toEqual(["fresh"]);
  expect(await second).toEqual({ data: ["fresh"], error: null });
  unsubscribe();
  runtime.dispose();
});

it("shares expiry timers and cancels them when the last observer leaves", async () => {
  vi.useFakeTimers();
  const { runtime } = fixture();
  try {
    const invalidate = vi.spyOn(runtime, "invalidate").mockResolvedValue();
    const key = ["auth", "user", "one", "listSessions"];
    const expiry = Date.now() + 1000;
    const first = runtime.observeExpiry(key, expiry);
    const second = runtime.observeExpiry(key, expiry);
    expect(runtime.timers.size).toBe(1);
    first();
    await vi.advanceTimersByTimeAsync(1001);
    expect(invalidate).toHaveBeenCalledTimes(1);
    second();
    const leave = runtime.observeExpiry(key, Date.now() + 2000);
    leave();
    await vi.advanceTimersByTimeAsync(2001);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(runtime.timers.size).toBe(0);
  } finally {
    runtime.dispose();
    vi.useRealTimers();
  }
});

it("explicit refresh settles other resources before reporting an endpoint failure", async () => {
  const { runtime } = fixture();
  const { QueryObserver } = await import("@tanstack/react-query");
  let refreshing = false;
  let complete!: (data: string[]) => void;
  const first = new QueryObserver(runtime.cache, {
    queryKey: ["first"],
    queryFn: async () => {
      if (refreshing) throw new Error("Endpoint failure");
      return [];
    },
  });
  const second = new QueryObserver(runtime.cache, {
    queryKey: ["second"],
    queryFn: async () =>
      refreshing
        ? new Promise<string[]>((resolve) => {
            complete = resolve;
          })
        : [],
  });
  const stops = [first.subscribe(() => {}), second.subscribe(() => {})];
  await vi.waitFor(() => expect(second.getCurrentResult().data).toEqual([]));
  refreshing = true;
  let settled = false;
  const refresh = runtime.refresh().finally(() => {
    settled = true;
  });
  const outcome = expect(refresh).rejects.toThrow("Endpoint failure");
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
  expect(settled).toBe(false);
  complete(["fresh"]);
  await outcome;
  expect(second.getCurrentResult().data).toEqual(["fresh"]);
  stops.forEach((stop) => stop());
  runtime.dispose();
});

it("keeps new-session invalidation work when an old microtask is still queued", async () => {
  const { runtime } = fixture();
  const invalidate = vi.spyOn(runtime.cache, "invalidateQueries").mockResolvedValue();
  const old = runtime.invalidate([["old-session"]]);
  runtime.setIdentity({ userId: "user", sessionId: "two", isAnonymous: false, ready: true });
  const current = runtime.invalidate([["new-session"]]);
  await Promise.all([old, current]);
  expect(invalidate).toHaveBeenCalledTimes(1);
  const predicate = invalidate.mock.calls[0]?.[0]?.predicate;
  expect(predicate?.({ queryKey: ["new-session"] } as any)).toBe(true);
  expect(predicate?.({ queryKey: ["old-session"] } as any)).toBe(false);
  runtime.dispose();
});
