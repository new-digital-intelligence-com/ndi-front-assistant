import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession, sitePasswordConfigured } from "@/lib/auth";

// The icon is linked from the login page itself, so it has to be readable before signing in.
// /docs explains the demo to anyone (no secrets on it), so it needs no password either. /demos lists
// NDI's public YouTube demo videos and is read by Clara's knowledge base (ElevenLabs), so it is open too.
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/icon.svg", "/docs", "/demos"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // ElevenLabs calls these (agent tools and the post-call webhook), so there is no browser and no
  // site password. They prove themselves with a shared secret header or an HMAC signature instead
  // — see src/lib/agentAuth.ts — and each route rejects anything unsigned.
  if (pathname.startsWith("/api/agent/")) return NextResponse.next();

  // The email channel: Google Pub/Sub, ElevenLabs and the daily jobs call these, never a browser with
  // the site password. Each route checks its own proof: the secret in the Pub/Sub URL, the reply's
  // HMAC signature, the cron secret, or the Aida staff token for the staff switch.
  if (pathname.startsWith("/api/email/")) return NextResponse.next();

  // Messenger and Instagram: Meta posts messages (secret in the URL) and ElevenLabs posts Clara's
  // replies (HMAC signature). The daily jobs send the cron secret. Each route checks its own proof.
  if (pathname.startsWith("/api/messenger/") || pathname.startsWith("/api/instagram/") || pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // Aida has its own staff password, separate from this one. Its pages and routes are open here and
  // every route decides for itself: the Aida staff token makes you an employee, a signed room ticket
  // proves you are in the room, and anyone else is a customer.
  if (pathname === "/aida" || pathname === "/aida/join" || pathname.startsWith("/api/aida/")) {
    return NextResponse.next();
  }

  // The staff admin page is behind the Aida staff password, not this one: the page asks for it,
  // and every /api/admin/* route refuses a request without a valid staff token.
  if (pathname === "/admin" || pathname.startsWith("/api/admin/")) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  if (!sitePasswordConfigured()) {
    // Fail closed: without SITE_PASSWORD nothing is reachable.
    if (isApi) return Response.json({ error: "Site password is not configured" }, { status: 503 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (isApi) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
