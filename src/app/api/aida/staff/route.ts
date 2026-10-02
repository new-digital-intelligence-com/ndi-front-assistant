import { aidaStaffConfigured, aidaStaffPasswordMatches, issueStaffToken } from "@/lib/aidaStaff";

// Staff sign-in for Aida: the Aida password buys a staff token for this browser tab.
export async function POST(request: Request) {
  if (!aidaStaffConfigured()) {
    return Response.json({ error: "Staff sign-in is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await aidaStaffPasswordMatches(password))) {
    // Slow down repeated guessing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return Response.json({ error: "Wrong staff password" }, { status: 401 });
  }

  return Response.json({ token: await issueStaffToken() });
}
