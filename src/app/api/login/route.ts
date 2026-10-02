import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  expectedSessionToken,
  passwordMatches,
  sitePasswordConfigured,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!sitePasswordConfigured()) {
    return Response.json({ error: "Site password is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await passwordMatches(password))) {
    // Slow down repeated guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, (await expectedSessionToken())!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return Response.json({ ok: true });
}
