import { createAuthClient } from "better-auth/react";
import { anonymousClient, organizationClient } from "better-auth/client/plugins";
import { createAuthDataClient, type InvalidationApi } from "../packages/auth-client/src/index.js";
const api = {} as InvalidationApi;
const base = createAuthClient();
const organization = createAuthClient({ plugins: [organizationClient()] });
const adapter = createAuthDataClient({
  authClient: organization,
  api,
  features: { organization: true },
});
// @ts-expect-error missing organization capability
createAuthDataClient({ authClient: base, api, features: { organization: true } });
// @ts-expect-error session feature not enabled
adapter.useListSessions();
// @ts-expect-error explicit organization required
adapter.useOrganization({});
// @ts-expect-error wrong input
void adapter.organization.create({ wrong: true });

const anonymous = createAuthClient({ plugins: [anonymousClient()] });
const guests = createAuthDataClient({
  authClient: anonymous,
  api,
  features: { authentication: true, guests: true },
});
const guestSession: { isAnonymous: boolean; isEstablished: boolean } = guests.useGuestSession();
void guestSession;
// @ts-expect-error guests return a signed-out visitor to a guest through authentication
createAuthDataClient({ authClient: anonymous, api, features: { guests: true } });
// @ts-expect-error missing the anonymous plugin's sign-in
createAuthDataClient({ authClient: base, api, features: { authentication: true, guests: true } });
const withoutGuests = createAuthDataClient({
  authClient: anonymous,
  api,
  features: { authentication: true },
});
// @ts-expect-error guest session needs the guests capability
withoutGuests.useGuestSession();
