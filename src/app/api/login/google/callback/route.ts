import { NextRequest, NextResponse } from "next/server";
import { googleLoginConfig, readGoogleFlow, exchangeGoogle, GOOGLE_FLOW_COOKIE } from "@/lib/googleLogin";
import { expectedSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { appUrl } from "@/lib/appUrl";

export async function GET(request: NextRequest) {
  const base = appUrl() || request.nextUrl.origin;
  let response = NextResponse.redirect(new URL("/login?google_error=1", base));
  try {
    const config = googleLoginConfig();
    if (!config || request.nextUrl.searchParams.has("error")) throw Error("Google sign-in failed");
    const flow = readGoogleFlow(request.cookies.get(GOOGLE_FLOW_COOKIE)?.value, request.nextUrl.searchParams.get("state"), config.signingKey);
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 4096) throw Error("Google sign-in failed");
    await exchangeGoogle(code, flow.verifier, config);
    const session = await expectedSessionToken();
    if (!session) throw Error("Google sign-in failed");
    response = NextResponse.redirect(new URL(flow.next, base));
    response.cookies.set(SESSION_COOKIE, session, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
  } catch {
    // Never echo tokens, provider responses or callback parameters.
  }
  response.cookies.set(GOOGLE_FLOW_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/login/google", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
