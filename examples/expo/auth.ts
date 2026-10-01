import { createAuthClient } from "better-auth/react";
import {
  anonymousClient,
  organizationClient,
  inferOrgAdditionalFields,
} from "better-auth/client/plugins";
import type { createAuth } from "../backend/convex/auth";
import { expoClient } from "@better-auth/expo/client";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { ConvexReactClient, useQuery } from "convex/react";
import { api } from "../backend/convex/_generated/api";
import { createAuthDataClient } from "@strawdev/auth-client";
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  plugins: [
    organizationClient({ schema: inferOrgAdditionalFields<ReturnType<typeof createAuth>>() }),
    anonymousClient(),
    convexClient(),
    ...(Platform.OS === "web"
      ? [crossDomainClient()]
      : [
          expoClient({
            scheme: "reactive-auth-example",
            storagePrefix: "reactive-auth-example",
            storage: SecureStore,
          }),
        ]),
  ],
});
export const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210",
);
export const authData = createAuthDataClient({
  authClient,
  api: api.authData,
  features: { organization: true, sessions: true, authentication: true, account: true },
  currentUser: {
    useCurrentUser() {
      const { data: session } = authClient.useSession();
      const identity = session?.user.id;
      const data = useQuery(
        api.authData.currentUser,
        identity ? { expectedUserId: identity } : "skip",
      );
      return { data, identity, isPending: Boolean(identity) && data === undefined, error: null };
    },
  },
});

// The `/guest` page shows an app that keeps guests: every visitor plays at once as a guest.
export const guestAuthData = createAuthDataClient({
  authClient,
  api: api.authData,
  features: { authentication: true, guests: true },
});
