import { NextResponse } from "next/server";
import { googleLoginConfig, startGoogle, GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_SECONDS } from "@/lib/googleLogin";

export async function GET(request: Request) {
  const config = googleLoginConfig();
  if (!config) return Response.json({ error: "Google sign-in is not configured" }, { status: 503 });
  const flow = startGoogle(config, new URL(request.url).searchParams.get("next") || "/");
  const response = NextResponse.redirect(flow.url);
  response.cookies.set(GOOGLE_FLOW_COOKIE, flow.cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/login/google", maxAge: GOOGLE_FLOW_SECONDS });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
