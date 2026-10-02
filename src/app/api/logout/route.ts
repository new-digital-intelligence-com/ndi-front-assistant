import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return Response.redirect(new URL("/login", request.url), 303);
}
