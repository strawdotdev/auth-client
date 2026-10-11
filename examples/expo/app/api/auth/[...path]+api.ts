// Better Auth on the app's own origin: requests pass to the Convex deployment's site, as the
// integration's Next.js and TanStack Start handlers do, so the session is a first-party cookie.
const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

async function handler(request: Request) {
  if (!site) return new Response("EXPO_PUBLIC_CONVEX_SITE_URL is not set", { status: 500 });
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "content-length", "transfer-encoding"])
    headers.delete(name);
  headers.set("accept-encoding", "identity");
  const response = await fetch(`${site}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
}

export { handler as GET, handler as POST };
