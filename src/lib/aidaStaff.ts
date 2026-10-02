// Aida has its own staff password (AIDA_STAFF_PASSWORD), separate from the site password: typing it
// is what makes someone CDA staff in a room. Everyone else is a customer.
//
// The proof is a short signed token the browser keeps per tab (sessionStorage) and sends in the
// `x-aida-staff` header, rather than a cookie. That way one browser can be staff in one tab and a
// customer in another, which is how a demo is usually tested.

import { constantTimeEqual, sha256Hex } from "./auth";

export const AIDA_STAFF_HEADER = "x-aida-staff";
const STAFF_TOKEN_HOURS = 12;

export function aidaStaffConfigured(): boolean {
  return Boolean(process.env.AIDA_STAFF_PASSWORD);
}

export async function aidaStaffPasswordMatches(input: string): Promise<boolean> {
  const password = process.env.AIDA_STAFF_PASSWORD;
  if (!password) return false;
  // Compare hashes so the comparison time does not depend on the password length.
  return constantTimeEqual(await sha256Hex(input), await sha256Hex(password));
}

/** Signed with the password itself, so changing the password signs everyone out. */
async function signature(expiresAt: number): Promise<string> {
  return sha256Hex(`aida-staff:${process.env.AIDA_STAFF_PASSWORD}:${expiresAt}`);
}

export async function issueStaffToken(): Promise<string> {
  const expiresAt = Date.now() + STAFF_TOKEN_HOURS * 3_600_000;
  return `${expiresAt}.${await signature(expiresAt)}`;
}

export async function isStaffRequest(request: Request): Promise<boolean> {
  if (!aidaStaffConfigured()) return false;
  const token = request.headers.get(AIDA_STAFF_HEADER) ?? "";
  const separator = token.indexOf(".");
  const expiresAt = Number(token.slice(0, separator));
  if (separator < 1 || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return constantTimeEqual(await signature(expiresAt), token.slice(separator + 1));
}
