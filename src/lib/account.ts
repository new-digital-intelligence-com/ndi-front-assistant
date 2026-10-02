// Customer accounts on the website, in our own table customer_accounts (supabase/schema.sql).
//
// The Supabase project is shared with other PoCs, so NDI keeps its own accounts instead of Supabase
// Auth's user list, which every PoC in the project shares. An account is an email address, a hash
// of the password and the customer it belongs to. It is open straight away, so nobody has to wait
// for a confirmation email during a demo. The password itself is never stored: only an scrypt hash
// with its own random salt.
//
// After a successful sign-in we set our own signed cookie holding the customer id. That keeps the
// rest of the app simple: no JWT refresh, and the site password lock stays exactly as it was.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { constantTimeEqual, sha256Hex } from "./auth";
import { createAccount, findAccount, type Customer } from "./customers";
import { supabaseConfigured } from "./supabase";

export const ACCOUNT_COOKIE = "ndi_account";
const ACCOUNT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieSecret(): string {
  const secret = process.env.AGENT_TOOL_SECRET;
  if (!secret) throw new Error("AGENT_TOOL_SECRET must be set");
  return secret;
}

export function accountsConfigured(): boolean {
  return supabaseConfigured() && Boolean(process.env.AGENT_TOOL_SECRET);
}

async function sign(value: string): Promise<string> {
  return sha256Hex(`${cookieSecret()}:${value}`);
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

// --- passwords ---------------------------------------------------------------------------------

// scrypt, built into Node. The stored hash names its own settings, scrypt$N$r$p$salt$hash (salt and
// hash in base64), so the settings can be raised later without breaking the passwords already saved.
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

function scryptKey(password: string, salt: Buffer, keyLength: number, { N, r, p }: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyLength, { N, r, p, maxmem: 256 * N * r }, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptKey(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function passwordMatchesHash(password: string, stored: string): Promise<boolean> {
  const [kind, N, r, p, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  if (!expected.length) return false;
  const key = await scryptKey(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  }).catch(() => null);
  return Boolean(key && timingSafeEqual(key, expected));
}

// --- too many wrong passwords ------------------------------------------------------------------

// After 5 wrong passwords for one email within 15 minutes, that email cannot sign in until the oldest
// of them is 15 minutes old. Kept in memory on globalThis: the app runs as one server process on
// Railway, and a restart only forgets the count.
const WRONG_PASSWORD_LIMIT = 5;
const WRONG_PASSWORD_WINDOW_MS = 15 * 60_000;

const store = globalThis as typeof globalThis & { ndiWrongPasswords?: Map<string, number[]> };
const wrongPasswords = (store.ndiWrongPasswords ??= new Map<string, number[]>());

function recentWrongPasswords(email: string): number[] {
  const now = Date.now();
  const recent = (wrongPasswords.get(email) ?? []).filter((at) => now - at < WRONG_PASSWORD_WINDOW_MS);
  if (recent.length) wrongPasswords.set(email, recent);
  else wrongPasswords.delete(email);
  return recent;
}

function noteWrongPassword(email: string) {
  wrongPasswords.set(email, [...recentWrongPasswords(email), Date.now()]);
  // Emails nobody has tried for 15 minutes are forgotten, so the list cannot grow without end.
  if (wrongPasswords.size > 1000) [...wrongPasswords.keys()].forEach(recentWrongPasswords);
}

// --- signing up and in -------------------------------------------------------------------------

export async function signUp(
  email: string,
  password: string,
  name?: string,
): Promise<{ ok: true; customer: Customer } | { ok: false; message: string }> {
  const created = await createAccount(email, await hashPassword(password), name);
  if (!created.ok) {
    const message =
      created.reason === "exists"
        ? "That email already has an account. Please sign in instead."
        : "That email is already linked to another NDI account.";
    return { ok: false, message };
  }

  await setSessionCookie(created.customer.id);
  return { ok: true, customer: created.customer };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true; customer: Customer } | { ok: false; message: string }> {
  if (recentWrongPasswords(email).length >= WRONG_PASSWORD_LIMIT) {
    return { ok: false, message: "Too many wrong passwords. Please wait 15 minutes and try again." };
  }

  const account = await findAccount(email);
  let matches = false;
  if (account) matches = await passwordMatchesHash(password, account.passwordHash);
  // The same work without an account, so the answer does not tell which emails have one.
  else await hashPassword(password);
  if (!account || !matches) {
    noteWrongPassword(email);
    return { ok: false, message: "Wrong email or password." };
  }

  wrongPasswords.delete(email);
  await setSessionCookie(account.customer.id);
  return { ok: true, customer: account.customer };
}
