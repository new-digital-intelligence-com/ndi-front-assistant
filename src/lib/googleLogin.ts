import { createHash, createHmac, randomBytes } from "node:crypto";
import { appUrl } from "./appUrl";
import { constantTimeEqual, safeNextPath } from "./auth";

export const GOOGLE_FLOW_COOKIE = "ndi_google_login";
export const GOOGLE_FLOW_SECONDS = 600;
type Flow = { state: string; verifier: string; next: string; created: number };

export function googleLoginConfig() {
  const base = appUrl();
  // A dedicated sign-in client leaves the existing Gmail OAuth grant untouched.
  const dedicated = Boolean(process.env.GOOGLE_SIGNIN_CLIENT_ID || process.env.GOOGLE_SIGNIN_CLIENT_SECRET);
  const clientId = dedicated ? process.env.GOOGLE_SIGNIN_CLIENT_ID : process.env.GOOGLE_CLIENT_ID;
  const secret = dedicated ? process.env.GOOGLE_SIGNIN_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET;
  const signingKey = process.env.SITE_PASSWORD;
  if (process.env.GOOGLE_SIGNIN_ENABLED !== "true" || !base || !clientId || !secret || !signingKey) return null;
  if (new URL(base).protocol !== "https:") return null;
  return { clientId, secret, signingKey, callback: base + "/api/login/google/callback" };
}

export function startGoogle(config: NonNullable<ReturnType<typeof googleLoginConfig>>, next: string) {
  const flow: Flow = { state: randomBytes(32).toString("hex"), verifier: randomBytes(48).toString("base64url"), next: safeNextPath(next), created: Date.now() };
  const value = Buffer.from(JSON.stringify(flow)).toString("base64url");
  const signature = createHmac("sha256", config.signingKey).update(value).digest("hex");
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback,
    response_type: "code", scope: "openid email profile", state: flow.state,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return { url: target.toString(), cookie: value + "." + signature };
}

export function readGoogleFlow(cookie: string | undefined, state: string | null, key: string): Flow {
  const [value, signature, extra] = (cookie || "").split(".");
  if (!value || !signature || extra || !constantTimeEqual(signature, createHmac("sha256", key).update(value).digest("hex"))) throw Error("Invalid Google login state");
  const flow: unknown = JSON.parse(Buffer.from(value, "base64url").toString());
  if (!flow || typeof flow !== "object" || !("state" in flow) || !("verifier" in flow) || !("created" in flow) || !("next" in flow) ||
      typeof flow.state !== "string" || !state || !constantTimeEqual(flow.state, state) ||
      typeof flow.verifier !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(flow.verifier) ||
      typeof flow.created !== "number" || Date.now() < flow.created || Date.now() - flow.created > GOOGLE_FLOW_SECONDS * 1000 ||
      typeof flow.next !== "string") throw Error("Invalid Google login state");
  return { state: flow.state, verifier: flow.verifier, created: flow.created, next: safeNextPath(flow.next) };
}

export async function exchangeGoogle(code: string, verifier: string, config: NonNullable<ReturnType<typeof googleLoginConfig>>) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, code_verifier: verifier,
      client_id: config.clientId, client_secret: config.secret, redirect_uri: config.callback, grant_type: "authorization_code" }) });
  if (!response.ok) throw Error("Google login failed");
  const tokens = await response.json() as { access_token?: unknown };
  if (typeof tokens.access_token !== "string" || !tokens.access_token) throw Error("Google login failed");
  const identity = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!identity.ok) throw Error("Google login failed");
  const user = await identity.json() as { sub?: unknown; email_verified?: unknown; email?: unknown };
  if (typeof user.sub !== "string" || !user.sub || user.email_verified !== true || typeof user.email !== "string" || !user.email) throw Error("Google login failed");
  // The user authorized ANY verified Google account for the customer demo.
  // This grants the existing demo session only, never the separate staff/account identities.
}
