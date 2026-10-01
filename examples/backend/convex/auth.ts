import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { betterAuth } from "better-auth/minimal";
import { anonymous, organization } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { createSignalTriggers } from "@strawdev/auth-client/convex";
import { components, internal } from "./_generated/api";
import authConfig from "./auth.config";
import type { DataModel } from "./_generated/dataModel";
import { sendAuthEmail } from "./email";
import schema from "./betterAuth/schema";
export const features = { organization: true, sessions: true } as const;
export const requireVerifiedInvitationEmail = true;
export const authComponent: ReturnType<typeof createClient<DataModel, typeof schema>> =
  createClient(components.betterAuth, {
    local: { schema },
    authFunctions: internal.auth,
    triggers: createSignalTriggers({
      features,
      lookup: components.betterAuth.authData.lookup,
      markSessionsChanged: internal.authData.markSessionsChanged,
    }),
  });
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  baseURL: process.env.CONVEX_SITE_URL,
  trustedOrigins: [process.env.SITE_URL ?? "http://localhost:8099", "reactive-auth-example://"],
  database: authComponent.adapter(ctx),
  advanced: { database: { generateId: false as const } },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({
        user,
        newEmail,
        url,
      }: {
        user: { email: string };
        newEmail: string;
        url: string;
      }) =>
        sendAuthEmail(ctx, {
          to: user.email,
          subject: `Approve email change to ${newEmail}`,
          url,
        }),
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) =>
      sendAuthEmail(ctx, { to: user.email, subject: "Reset your password", url }),
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) =>
      sendAuthEmail(ctx, { to: user.email, subject: "Verify your email", url }),
  },
  plugins: [
    expo(),
    // Guests (the `/guest` page) are linked when they sign in or up. Keep the guest's user while
    // its page still holds the guest session; an application forgets linked guests later.
    anonymous({ disableDeleteAnonymousUser: true }),
    organization({
      schema: { invitation: { additionalFields: { ticket: { type: "number", required: false } } } },
      requireEmailVerificationOnInvitation: requireVerifiedInvitationEmail,
      sendInvitationEmail: async (data) =>
        sendAuthEmail(ctx, {
          to: data.email,
          subject: "Organization invitation",
          url: `${process.env.SITE_URL}/?invitationId=${data.id}`,
        }),
    }),
    convex({ authConfig }),
    crossDomain({ siteUrl: process.env.SITE_URL ?? "http://localhost:8099" }),
  ],
});
export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();
