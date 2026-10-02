// Customer accounts on the website, on top of Supabase Auth.
//
// Users are created through Supabase's admin endpoint with the service role key and marked
// confirmed straight away, so nobody has to wait for a confirmation email during a demo. The
// password itself is only ever checked by Supabase; we never see or store it.
//
// After a successful sign-in we set our own signed cookie holding the customer id. That keeps the
// rest of the app simple: no JWT refresh, and the site password lock stays exactly as it was.

import { cookies } from "next/headers";
import { constantTimeEqual, sha256Hex } from "./auth";
import { customerForAccount, type Customer } from "./customers";

export const ACCOUNT_COOKIE = "cda_account";
const ACCOUNT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.AGENT_TOOL_SECRET;
  if (!url || !key || !secret) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AGENT_TOOL_SECRET must be set");
  }
  return { url: url.replace(/\/+$/, ""), key, secret };
}

export function accountsConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.AGENT_TOOL_SECRET);
}

async function sign(value: string): Promise<string> {
  const { secret } = config();
  return sha256Hex(`${secret}:${value}`);
}

async function setSessionCookie(customerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_COOKIE, `${customerId}.${await sign(customerId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCOUNT_MAX_AGE_SECONDS,
  });
}

/** The customer id of whoever is signed in, or null. */
export async function signedInCustomerId(): Promise<string | null> {
  if (!accountsConfigured()) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(ACCOUNT_COOKIE)?.value;
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;
  const customerId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  return constantTimeEqual(await sign(customerId), signature) ? customerId : null;
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCOUNT_COOKIE);
}

type AuthUser = { id: string; email?: string };

async function auth<T>(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<
  { ok: true; data: T } | { ok: false; message: string }
> {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = parsed.msg || parsed.message || parsed.error_description || parsed.error || "Something went wrong";
    return { ok: false, message: String(message) };
  }
  return { ok: true, data: parsed as T };
}

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<{ ok: true; customer: Customer } | { ok: false; message: string }> {
  // email_confirm: true creates the account already confirmed, so there is no email to wait for.
  const created = await auth<AuthUser>("/admin/users", {
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (!created.ok) {
    const message = /already|exists|registered/i.test(created.message)
      ? "That email already has an account. Please sign in instead."
      : created.message;
    return { ok: false, message };
  }

  const customer = await customerForAccount(created.data.id, email, name);
  await setSessionCookie(customer.id);
  return { ok: true, customer };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true; customer: Customer } | { ok: false; message: string }> {
  const token = await auth<{ user: AuthUser }>("/token?grant_type=password", { email, password });
  if (!token.ok) {
    return { ok: false, message: "Wrong email or password." };
  }

  const name = undefined;
  const customer = await customerForAccount(token.data.user.id, email, name);
  await setSessionCookie(customer.id);
  return { ok: true, customer };
}
