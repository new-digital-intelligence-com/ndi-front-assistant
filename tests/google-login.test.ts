import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { startGoogle, readGoogleFlow, exchangeGoogle, googleLoginConfig } from "../src/lib/googleLogin";
import { safeNextPath, SESSION_COOKIE } from "../src/lib/auth";
import { GET as callback } from "../src/app/api/login/google/callback/route";

const config = { clientId: "synthetic-client", secret: "synthetic-client-secret", signingKey: "synthetic-site-password", callback: "https://clara.example.test/api/login/google/callback" };

test("dedicated sign-in credentials never mix with or replace the Gmail client", () => {
  const old = { ...process.env };
  try {
    Object.assign(process.env, { GOOGLE_SIGNIN_ENABLED: "true", GOOGLE_CLIENT_ID: "gmail-client", GOOGLE_CLIENT_SECRET: "gmail-secret", SITE_PASSWORD: config.signingKey, APP_URL: "https://clara.example.test" });
    delete process.env.GOOGLE_SIGNIN_CLIENT_ID;
    delete process.env.GOOGLE_SIGNIN_CLIENT_SECRET;
    assert.equal(googleLoginConfig()?.clientId, "gmail-client");
    process.env.GOOGLE_SIGNIN_CLIENT_ID = "login-client";
    assert.equal(googleLoginConfig(), null);
    process.env.GOOGLE_SIGNIN_CLIENT_SECRET = "login-secret";
    assert.equal(googleLoginConfig()?.clientId, "login-client");
    assert.equal(googleLoginConfig()?.secret, "login-secret");
    assert.equal(process.env.GOOGLE_CLIENT_ID, "gmail-client");
    assert.equal(process.env.GOOGLE_CLIENT_SECRET, "gmail-secret");
    delete process.env.GOOGLE_SIGNIN_CLIENT_ID;
    assert.equal(googleLoginConfig(), null);
  } finally { process.env = old; }
});

test("Google authorization requests identity only and binds a PKCE challenge to signed browser state", () => {
  const first = startGoogle(config, "/voice");
  const second = startGoogle(config, "/");
  const url = new URL(first.url);
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const flow = readGoogleFlow(first.cookie, url.searchParams.get("state"), config.signingKey);
  assert.equal(flow.next, "/voice");
  assert.ok(!first.url.includes(flow.verifier));
  assert.notEqual(first.cookie, second.cookie);
  assert.throws(() => readGoogleFlow(second.cookie, flow.state, config.signingKey));
  assert.throws(() => readGoogleFlow(first.cookie + "tamper", flow.state, config.signingKey));
});

test("expired browser state and external return paths are rejected", () => {
  const flow = startGoogle(config, "/");
  const value = JSON.parse(Buffer.from(flow.cookie.split(".")[0], "base64url").toString());
  value.created -= 601000;
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = encoded + "." + createHmac("sha256", config.signingKey).update(encoded).digest("hex");
  assert.throws(() => readGoogleFlow(signed, value.state, config.signingKey));
  for (const path of ["//outside.test", "/\\outside.test", "/\n/outside.test", "https://outside.test"]) assert.equal(safeNextPath(path), "/");
  assert.equal(safeNextPath("/voice?mode=demo"), "/voice?mode=demo");
});

test("any verified Google account can enter the demo, without staff or customer-account credentials", async () => {
  const old = { ...process.env };
  const oldFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { GOOGLE_SIGNIN_ENABLED: "true", GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.secret, SITE_PASSWORD: config.signingKey, APP_URL: "https://clara.example.test" });
    const start = startGoogle(config, "/voice");
    const state = new URL(start.url).searchParams.get("state")!;
    const calls: string[] = [];
    globalThis.fetch = async (url, options) => {
      calls.push(String(url));
      if (String(url).endsWith("/token")) {
        assert.equal((options?.body as URLSearchParams).get("client_id"), config.clientId);
        assert.equal((options?.body as URLSearchParams).get("redirect_uri"), config.callback);
        return Response.json({ access_token: "synthetic-access" });
      }
      assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer synthetic-access");
      return Response.json({ sub: "synthetic-subject", email: "outside@gmail.com", email_verified: true });
    };
    const result = await callback(new NextRequest(`${config.callback}?state=${state}&code=synthetic-code`, { headers: { Cookie: "ndi_google_login=" + start.cookie } }));
    assert.equal(result.headers.get("location"), "https://clara.example.test/voice");
    assert.ok(result.cookies.get(SESSION_COOKIE));
    assert.equal(result.cookies.getAll().filter(cookie => cookie.name !== SESSION_COOKIE && cookie.name !== "ndi_google_login").length, 0);
    assert.deepEqual(calls, ["https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo"]);
  } finally { globalThis.fetch = oldFetch; process.env = old; }
});

test("unverified identities and invalid callback state fail closed", async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => String(url).endsWith("/token") ? Response.json({ access_token: "synthetic-access" }) : Response.json({ sub: "subject", email: "outside@gmail.com", email_verified: false });
    await assert.rejects(() => exchangeGoogle("code", "verifier", config));
    const result = await callback(new NextRequest(config.callback + "?code=attacker-code&state=wrong"));
    assert.ok(!result.cookies.get(SESSION_COOKIE));
    assert.ok(result.headers.get("location")?.includes("google_error=1"));
  } finally { globalThis.fetch = oldFetch; }
});
