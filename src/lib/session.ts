import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "./auth";

/** Second check (besides the proxy) for route handlers that spend ElevenLabs credits. */
export async function hasValidSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSession(cookieStore.get(SESSION_COOKIE)?.value);
}
