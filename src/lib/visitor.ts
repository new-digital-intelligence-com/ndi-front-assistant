import { cookies } from "next/headers";

// A stable id for one browser, so Ellie can recognise a returning website visitor and so the
// website can join the same cross-channel customer record as Telegram, Instagram and email.
//
// A cookie, not an IP address: an IP is shared by everyone on the same WiFi or mobile network and
// changes when the person moves, so it would mix two customers up and lose the same one twice.

export const VISITOR_COOKIE = "cda_visitor";
const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Reads the visitor cookie, creating it on first visit. */
export async function visitorId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const id = crypto.randomUUID();
  cookieStore.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_MAX_AGE_SECONDS,
  });
  return id;
}
