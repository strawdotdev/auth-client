import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import { observeAuth } from "../cache/query-cache.js";
import type { AuthDataLifecycle } from "./types.js";
import { AuthDataContext, runtimeByClient } from "./provider-context.js";
import { useGuestSessionLifecycle } from "../workflows/authentication/guest.js";
export function AuthDataProvider({
  client,
  children,
}: {
  client: AuthDataLifecycle;
  children: ReactNode;
}) {
  const runtime = runtimeByClient.get(client);
  if (!runtime) throw new Error("Invalid auth data client");
  const convex = useConvex();
  const auth = useConvexAuth();
  const session = runtime.auth.useSession();
  const userId = session.data?.user.id;
  const sessionId = session.data?.session.id;
  const isAnonymous = session.data?.user.isAnonymous === true;
  const ready = auth.isAuthenticated && !session.isPending && Boolean(session.data);
  const identity = useMemo(
    () => ({ userId, sessionId, isAnonymous, ready }),
    [userId, sessionId, isAnonymous, ready],
  );
  useLayoutEffect(() => runtime.attach(convex), [runtime, convex]);
  useLayoutEffect(
    () =>
      observeAuth(
        runtime,
        {
          ...identity,
          sessionToken: session.data?.session.token,
          sessionPending: session.isPending,
          convexAuthenticated: auth.isAuthenticated,
          convexLoading: auth.isLoading,
        },
        session.refetch,
        session.data,
      ),
    [
      runtime,
      identity,
      session.data,
      session.data?.session.token,
      session.isPending,
      session.refetch,
      auth.isAuthenticated,
      auth.isLoading,
    ],
  );
  useGuestSessionLifecycle(runtime, { userId, ready, pending: session.isPending });
  return (
    <AuthDataContext.Provider value={{ runtime, identity }}>{children}</AuthDataContext.Provider>
  );
}
