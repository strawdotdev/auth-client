// The device's accounts end to end in one process: a real Better Auth server (multi-session, bearer,
// organizations, `deviceAccounts()`) and real Better Auth clients with `deviceAccountsClient()`,
// one per browser tab, sharing one cookie jar as a browser's tabs do.
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import {
  anonymousClient,
  multiSessionClient,
  organizationClient,
} from "better-auth/client/plugins";
import { anonymous, bearer, multiSession, organization } from "better-auth/plugins";
import { beforeEach, expect, it } from "vitest";
import { deviceAccounts } from "../packages/auth-client/src/better-auth/index.js";
import { deviceAccountsClient } from "../packages/auth-client/src/better-auth/client.js";

const origin = "http://app.test";
let server: ReturnType<typeof createServer>;
let jar: Map<string, string>;

function createServer() {
  return betterAuth({
    baseURL: origin,
    secret: "a-test-secret-that-is-long-enough-to-be-accepted",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      organization: [],
      member: [],
      invitation: [],
    }),
    emailAndPassword: { enabled: true },
    plugins: [organization(), multiSession(), bearer(), deviceAccounts()],
    logger: { disabled: true },
  });
}

/** The browser: one cookie jar for every tab, as Set-Cookie and Max-Age say. */
async function browserFetch(input: string | URL | Request, init?: RequestInit) {
  const request = new Request(input, init);
  const headers = new Headers(request.headers);
  headers.set("origin", origin);
  if (jar.size)
    headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
  const response = await server.handler(new Request(request, { headers }));
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(";");
    const [name, value] = [pair!.slice(0, pair!.indexOf("=")), pair!.slice(pair!.indexOf("=") + 1)];
    if (attributes.some((part) => /max-age=0\b/i.test(part.trim()))) jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
  return response;
}

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

/** A browser tab: its own Better Auth client and session storage, the browser's cookies. */
function tab() {
  const kept = storage();
  const client = createAuthClient({
    baseURL: origin,
    fetchOptions: { customFetchImpl: browserFetch },
    plugins: [organizationClient(), multiSessionClient(), deviceAccountsClient({ storage: kept })],
  });
  return {
    client,
    kept,
    async who() {
      const { data } = await client.getSession();
      return data?.user.email ?? null;
    },
  };
}

async function account(email: string) {
  const { user } = await server.api.signUpEmail({
    body: { email, password: "password1234", name: email.split("@")[0]! },
  });
  return user;
}

const signIn = (current: ReturnType<typeof tab>, email: string) =>
  current.client.signIn.email({ email, password: "password1234" });

beforeEach(() => {
  server = createServer();
  jar = new Map();
});

it("keeps several accounts on the device while each tab acts as its own", async () => {
  await account("alice@example.com");
  await account("bob@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  expect(await first.who()).toBe("alice@example.com");

  // A new tab starts as the device's account and keeps it as its own.
  const second = tab();
  expect(await second.who()).toBe("alice@example.com");
  expect(second.kept.values.size).toBe(1);

  // Signing in another account adds it; that tab becomes it, the first stays as it was.
  await signIn(second, "bob@example.com");
  expect(await second.who()).toBe("bob@example.com");
  expect(await first.who()).toBe("alice@example.com");
  // A third tab follows the device's latest sign-in.
  expect(await tab().who()).toBe("bob@example.com");

  const { data } = await second.client.deviceAccounts.list();
  expect(data?.map(({ user }) => user.email)).toEqual(["alice@example.com", "bob@example.com"]);

  // Choosing an account is the tab's alone.
  const alice = data!.find(({ user }) => user.email === "alice@example.com")!;
  second.client.deviceAccounts.select(alice.session.token);
  expect(await second.who()).toBe("alice@example.com");
  second.client.deviceAccounts.select(null);
  expect(await second.who()).toBe("bob@example.com");
});

it("lists each account's organizations with its role there", async () => {
  const alice = await account("alice@example.com");
  const bob = await account("bob@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  const { data: shared } = await first.client.organization.create({
    name: "Shared",
    slug: "shared",
  });
  await server.api.addMember({
    body: { userId: bob.id, role: "admin", organizationId: shared!.id },
  });
  await first.client.organization.create({ name: "Alice's", slug: "alices" });
  await signIn(first, "bob@example.com");

  const { data } = await first.client.deviceAccounts.list();
  const organizations = (userId: string) =>
    data
      ?.find(({ user }) => user.id === userId)
      ?.organizations.map(({ slug, role }) => `${slug}:${role}`)
      .sort();
  expect(organizations(alice.id)).toEqual(["alices:owner", "shared:owner"]);
  expect(organizations(bob.id)).toEqual(["shared:admin"]);
  // The tokens a tab may choose; never another device's.
  expect(data?.every(({ session }) => typeof session.token === "string")).toBe(true);
});

it("signs one account out of the device and moves its tabs on to another", async () => {
  await account("alice@example.com");
  await account("bob@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  const second = tab();
  await signIn(second, "bob@example.com");
  const { data } = await first.client.deviceAccounts.list();
  const token = (email: string) => data!.find(({ user }) => user.email === email)!.session.token;

  // Another tab's account: this tab stays as it is.
  await first.client.multiSession.revoke({ sessionToken: token("bob@example.com") });
  expect(await first.who()).toBe("alice@example.com");
  // The tab whose account it was finds its session gone and follows the device's.
  expect(await second.who()).toBe("alice@example.com");
  expect((await first.client.deviceAccounts.list()).data?.map(({ user }) => user.email)).toEqual([
    "alice@example.com",
  ]);

  // Signing everything out leaves no account on the device.
  await first.client.signOut();
  expect(await first.who()).toBe(null);
  expect(await second.who()).toBe(null);
  expect((await tab().client.deviceAccounts.list()).data).toEqual([]);
});

it("moves a tab on when its own account is signed out, keeping the others", async () => {
  await account("alice@example.com");
  await account("bob@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  await signIn(first, "bob@example.com");
  const bob = (await first.client.deviceAccounts.list()).data!.find(
    ({ user }) => user.email === "bob@example.com",
  )!;
  await first.client.multiSession.revoke({ sessionToken: bob.session.token });
  first.client.deviceAccounts.select(null);
  expect(await first.who()).toBe("alice@example.com");
});

it("ignores a forged multi-session cookie", async () => {
  await account("alice@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  const [name] = [...jar.keys()].filter((key) => key.includes("_multi-"));
  jar.set(name!.replace(/_multi-.*/, "_multi-forged"), "someone-elses-token.forged-signature");
  const { data } = await first.client.deviceAccounts.list();
  expect(data?.map(({ user }) => user.email)).toEqual(["alice@example.com"]);
});

it("lists nothing to a device without accounts", async () => {
  expect((await tab().client.deviceAccounts.list()).data).toEqual([]);
});

it("keeps one entry when an account signs in again, its other tabs following the new session", async () => {
  await account("alice@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  const second = tab();
  await signIn(second, "alice@example.com");
  // multi-session replaced the first sign-in's session; the first tab finds it gone in one read.
  expect(await first.who()).toBe("alice@example.com");
  // Kept signed (`set-auth-token`) or raw (a session read); bearer() takes either.
  const kept = (current: ReturnType<typeof tab>) =>
    decodeURIComponent(current.kept.values.get("better-auth.device-account")!).split(".")[0];
  expect(kept(first)).toBe(kept(second));
  expect((await first.client.deviceAccounts.list()).data).toHaveLength(1);
});

it("keeps every tab signed in when a password change revokes the account's other sessions", async () => {
  await account("alice@example.com");
  await account("bob@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  const second = tab();
  expect(await second.who()).toBe("alice@example.com");
  const third = tab();
  await signIn(third, "bob@example.com");

  await first.client.changePassword({
    currentPassword: "password1234",
    newPassword: "password5678",
    revokeOtherSessions: true,
  });
  // The changing tab takes the new session; alice's other tab follows it; bob is untouched.
  expect(await first.who()).toBe("alice@example.com");
  expect(await second.who()).toBe("alice@example.com");
  expect(await third.who()).toBe("bob@example.com");
  expect((await first.client.deviceAccounts.list()).data?.map(({ user }) => user.email)).toEqual([
    "bob@example.com",
    "alice@example.com",
  ]);
});

it("lets a guest go from the device's accounts once it signs in, linked to the account", async () => {
  // Another plugin set; the tests use only the endpoints every set has.
  server = betterAuth({
    ...createServer().options,
    plugins: [
      anonymous({ disableDeleteAnonymousUser: true }),
      multiSession(),
      bearer(),
      deviceAccounts(),
    ],
  }) as unknown as typeof server;
  await account("alice@example.com");
  const playing = tab();
  const client = createAuthClient({
    baseURL: origin,
    fetchOptions: { customFetchImpl: browserFetch },
    plugins: [
      anonymousClient(),
      multiSessionClient(),
      deviceAccountsClient({ storage: playing.kept }),
    ],
  });
  await client.signIn.anonymous();
  expect((await client.getSession()).data?.user.isAnonymous).toBe(true);
  await client.signIn.email({ email: "alice@example.com", password: "password1234" });
  expect((await client.deviceAccounts.list()).data?.map(({ user }) => user.email)).toEqual([
    "alice@example.com",
  ]);
  // Signing the account out leaves nothing to fall back to, not the guest it was.
  await client.signOut();
  expect((await client.getSession()).data).toBe(null);
});

it("shows each account's organizations as the application orders and filters them", async () => {
  // Another plugin set; the tests use only the endpoints every set has.
  server = betterAuth({
    ...createServer().options,
    plugins: [
      organization(),
      multiSession(),
      bearer(),
      deviceAccounts({
        organizations: (_userId, organizations) =>
          organizations
            .filter(({ slug }) => slug !== "leaving")
            .sort((a, b) => Number(b.slug === "mine") - Number(a.slug === "mine")),
      }),
    ],
  }) as unknown as typeof server;
  await account("alice@example.com");
  const first = tab();
  await signIn(first, "alice@example.com");
  for (const slug of ["shared", "leaving", "mine"])
    await first.client.organization.create({ name: slug, slug });
  const { data } = await first.client.deviceAccounts.list();
  expect(data?.[0]?.organizations.map(({ slug }) => slug)).toEqual(["mine", "shared"]);
});
