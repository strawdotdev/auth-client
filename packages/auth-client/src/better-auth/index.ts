import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { parseCookies, setSessionCookie } from "better-auth/cookies";
import { parseSessionOutput, parseUserOutput } from "better-auth/db";

type Member = { organizationId: string; userId: string; role: string };
type Organization = { id: string; name: string; slug: string; logo?: string | null };

/** An organization a device account belongs to, with its role there. */
export type DeviceAccountOrganization = Organization & { role: string };

/**
 * Every account signed in on this device, from the multi-session plugin's cookies: the server half
 * of the client's accounts. Needs Better Auth's `multiSession()` and, for each context (a browser
 * tab) to act as its own account, `bearer()`. With the organization plugin, each account carries
 * its organizations and its role in each, so a switcher can show them without signing in as each.
 *
 * `GET /device-accounts/list` answers as `listDeviceSessions` does (one entry per user, the newest
 * sign-in last), each entry adding `organizations`.
 *
 * The device's session cookie keeps naming an account while one remains. When a context signs out
 * the device's current account while acting as another (multi-session moves the device on only
 * when the two are the same), the acting account becomes the device's. A session read for a
 * context's own account that finds it gone (signed out elsewhere) leaves the device's cookies as
 * they are: Better Auth would clear them, taking the device's own account with it.
 */
export const deviceAccounts = () =>
  ({
    id: "device-accounts",
    hooks: {
      after: [
        {
          matcher: (context) => context.path === "/multi-session/revoke",
          handler: createAuthMiddleware(async (ctx) => {
            const revoked = (ctx.body as { sessionToken?: unknown } | undefined)?.sessionToken;
            const acting = ctx.context.session;
            if (typeof revoked !== "string" || !acting || acting.session.token === revoked) return;
            // The device's own cookie, as sent: bearer() has put the acting session in its place.
            const sent = parseCookies(ctx.request?.headers.get("cookie") ?? "").get(
              ctx.context.authCookies.sessionToken.name,
            );
            if (!sent || decodeURIComponent(sent).split(".")[0] !== revoked) return;
            await setSessionCookie(ctx, acting);
          }),
        },
        {
          matcher: (context) => context.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            if (!ctx.request?.headers.has("authorization") || ctx.context.returned) return;
            ctx.context.responseHeaders?.delete("set-cookie");
          }),
        },
      ],
    },
    endpoints: {
      listDeviceAccounts: createAuthEndpoint(
        "/device-accounts/list",
        { method: "GET", requireHeaders: true },
        async (ctx) => {
          const cookies = parseCookies(ctx.headers?.get("cookie") ?? "");
          const tokens = (
            await Promise.all(
              [...cookies.keys()]
                .filter((key) => key.includes("_multi-"))
                .map((key) => ctx.getSignedCookie(key, ctx.context.secret)),
            )
          ).filter((token): token is string => typeof token === "string");
          const now = new Date();
          const found = tokens.length
            ? await ctx.context.internalAdapter.findSessions(tokens, { onlyActiveSessions: true })
            : [];
          const byUser = new Map<string, (typeof found)[number]>();
          for (const entry of found
            .filter(({ session }) => session.expiresAt > now)
            .sort((a, b) => +a.session.createdAt - +b.session.createdAt))
            byUser.set(entry.user.id, entry);
          const accounts = [...byUser.values()];
          const memberships = ctx.context.hasPlugin("organization")
            ? await organizationsOf(
                ctx.context.adapter,
                accounts.map(({ user }) => user.id),
              )
            : new Map<string, DeviceAccountOrganization[]>();
          return ctx.json(
            accounts.map(({ session, user }) => ({
              session: parseSessionOutput(ctx.context.options, session),
              user: parseUserOutput(ctx.context.options, user),
              organizations: memberships.get(user.id) ?? [],
            })),
          );
        },
      ),
    },
  }) satisfies BetterAuthPlugin;

type Adapter = {
  findMany<T>(query: {
    model: string;
    where: { field: string; operator: "in"; value: string[] }[];
  }): Promise<T[]>;
};

async function organizationsOf(adapter: Adapter, userIds: string[]) {
  const result = new Map<string, DeviceAccountOrganization[]>();
  if (!userIds.length) return result;
  const members = await adapter.findMany<Member>({
    model: "member",
    where: [{ field: "userId", operator: "in", value: userIds }],
  });
  const ids = [...new Set(members.map((member) => member.organizationId))];
  const organizations = ids.length
    ? await adapter.findMany<Organization>({
        model: "organization",
        where: [{ field: "id", operator: "in", value: ids }],
      })
    : [];
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  for (const { organizationId, userId, role } of members) {
    const organization = byId.get(organizationId);
    if (!organization) continue;
    const { id, name, slug, logo } = organization;
    result.set(userId, [...(result.get(userId) ?? []), { id, name, slug, logo, role }]);
  }
  return result;
}
