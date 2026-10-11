import type { ResourceDependency } from "../client/types.js";
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}
function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

/** Inspect dependency metadata without widening or rebuilding HTTP payload types. */
export function dependencies(
  endpoint: string,
  query: Record<string, unknown>,
  data: unknown,
  userId: string,
): ResourceDependency[] {
  const result: ResourceDependency[] = [
    {
      scope:
        endpoint === "listSessions"
          ? "sessions"
          : endpoint === "listPasskeys"
            ? "passkeys"
            : endpoint === "listUserInvitations" || endpoint === "getInvitation"
              ? "invitations"
              : "directory",
      subject: userId,
    },
  ];
  const payload = record(data);
  const organizationId =
    text(query.organizationId) ??
    (endpoint === "getFullOrganization" ? text(payload.id) : undefined);
  const slug = text(query.organizationSlug);
  if (query.organizationId || slug) {
    if (organizationId) result.push({ scope: "organization", subject: organizationId });
    else if (slug) result.push({ scope: "organization", subject: "slug:" + slug });
  }
  if (endpoint === "list")
    for (const org of rows(data))
      if (typeof org.id === "string") result.push({ scope: "organization", subject: org.id });
  // The device's accounts: only this context's own organizations can be watched (the signals are
  // its account's); the other accounts' refresh with every read.
  if (endpoint === "listDeviceAccounts")
    for (const account of rows(data))
      if (record(account.user).id === userId)
        for (const org of rows(account.organizations))
          if (typeof org.id === "string") result.push({ scope: "organization", subject: org.id });
  for (const member of rows(payload.members))
    if (typeof member.userId === "string" && organizationId)
      result.push({ scope: "profile", subject: member.userId, organizationId });
  if (endpoint === "getInvitation" && typeof query.id === "string")
    result.push({ scope: "invitation", subject: query.id });
  if (endpoint === "listUserInvitations")
    for (const invitation of rows(data))
      if (typeof invitation.id === "string")
        result.push({ scope: "invitation", subject: invitation.id });
  return [...new Map(result.map((d) => [JSON.stringify(d), d])).values()].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}
export function nextExpiry(data: unknown, now: number): number | undefined {
  const values = Array.isArray(data) ? data : [data];
  let earliest: number | undefined;
  for (const item of values) {
    const value = record(item).expiresAt;
    const time =
      value instanceof Date
        ? value.getTime()
        : typeof value === "number"
          ? value
          : typeof value === "string"
            ? Date.parse(value)
            : NaN;
    if (time > now && (earliest === undefined || time < earliest)) earliest = time;
  }
  return earliest;
}
