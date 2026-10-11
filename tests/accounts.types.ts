import { createAuthClient } from "better-auth/react";
import {
  anonymousClient,
  multiSessionClient,
  organizationClient,
} from "better-auth/client/plugins";
import {
  createAuthDataClient,
  deviceAccountsClient,
  type AccountsState,
  type InvalidationApi,
} from "../packages/auth-client/src/index.js";
import type { DeviceAccountOrganization } from "../packages/auth-client/src/better-auth/index.js";

const api = {} as InvalidationApi;
// The plugin keeps Better Auth's inference of the whole client.
const authClient = createAuthClient({
  plugins: [organizationClient(), multiSessionClient(), deviceAccountsClient()],
});
void authClient.organization.list;
authClient.deviceAccounts.select(null);
const selected: string | undefined = authClient.deviceAccounts.selected();
void selected;
async function listed() {
  const { data } = await authClient.deviceAccounts.list();
  const organizations: DeviceAccountOrganization[] | undefined = data?.[0]?.organizations;
  const token: string | undefined = data?.[0]?.session.token;
  void [organizations, token];
}
void listed;

const accounts = createAuthDataClient({
  authClient,
  api,
  features: { authentication: true, accounts: true },
});
function useControls() {
  const state: AccountsState<typeof authClient> = accounts.useAccounts({
    onSwitched: ({ userId, sessionId }) => void [userId, sessionId],
  });
  void state.account("user").switch.run();
  void state.actions.signOutAll.run();
  const email: string | undefined = state.data?.[0]?.user.email;
  return email;
}
void useControls;

createAuthDataClient({
  // @ts-expect-error missing deviceAccountsClient() and multiSessionClient()
  authClient: createAuthClient(),
  api,
  features: { authentication: true, accounts: true },
});
const withoutAccounts = createAuthDataClient({
  authClient,
  api,
  features: { authentication: true },
});
// @ts-expect-error accounts need the accounts capability
withoutAccounts.useAccounts();

const withGuests = createAuthDataClient({
  authClient: createAuthClient({
    plugins: [anonymousClient(), multiSessionClient(), deviceAccountsClient()],
  }),
  api,
  features: { authentication: true, guests: true, accounts: true },
});
function useGuestControls() {
  void withGuests.useAccounts().actions.switchToGuest.run();
  // @ts-expect-error a guest needs the guests capability
  void accounts.useAccounts().actions.switchToGuest;
}
void useGuestControls;

const withGuestsOnDemand = createAuthDataClient({
  authClient: createAuthClient({
    plugins: [anonymousClient(), multiSessionClient(), deviceAccountsClient()],
  }),
  api,
  features: { authentication: true, guests: "on-demand", accounts: true },
});
function useGuestOnDemand() {
  void withGuestsOnDemand.useAccounts().actions.switchToGuest.run();
  // @ts-expect-error on-demand guests keep no automatic guest session
  void withGuestsOnDemand.useGuestSession;
}
void useGuestOnDemand;
// @ts-expect-error on-demand guests need the accounts capability
createAuthDataClient({ authClient, api, features: { authentication: true, guests: "on-demand" } });
