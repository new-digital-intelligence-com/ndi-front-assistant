import { isStaffRequest } from "@/lib/aidaStaff";
import { discardDraft, sendDraft, socialState } from "@/lib/socialDrafts";

// One Instagram or Messenger draft: staff send it (as written or changed) or discard it. Staff only.
//   POST → { action: "send", text, name } or { action: "discard", name }
export async function POST(request: Request, ctx: RouteContext<"/api/admin/social/drafts/[id]">) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Unknown draft" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; text?: unknown; name?: unknown };
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null;
  try {
    const result =
      body.action === "send"
        ? await sendDraft(id, typeof body.text === "string" ? body.text.slice(0, 5000) : "", name)
        : body.action === "discard"
          ? await discardDraft(id, name)
          : { ok: false, error: "action must be send or discard" };
    return Response.json({ ...result, state: await socialState() }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("social draft action failed", id, error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  }
}
