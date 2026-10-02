import { isStaffRequest } from "@/lib/aidaStaff";
import { setReplyMode } from "@/lib/replyMode";
import { isSocialChannel, socialState } from "@/lib/socialDrafts";

// Instagram and Messenger on /admin: each channel's switch between sending Clara's answers straight away
// and keeping them as drafts for staff, and the drafts waiting (src/lib/socialDrafts.ts). Staff only.
//   GET  → the switches and the drafts
//   POST → { channel: "instagram" | "messenger", mode: "auto" | "draft" }
export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await socialState());
  } catch (error) {
    console.error("social drafts could not be loaded", error);
    return Response.json({ error: "Could not load Instagram and Messenger" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { channel?: unknown; mode?: unknown };
  if (!isSocialChannel(body.channel) || (body.mode !== "auto" && body.mode !== "draft")) {
    return Response.json({ error: "channel must be instagram or messenger, and mode auto or draft" }, { status: 400 });
  }
  try {
    await setReplyMode(body.channel, body.mode);
    return Response.json(await socialState());
  } catch (error) {
    console.error(`Could not change ${body.channel}_mode`, error);
    return Response.json({ error: "Could not change the setting. Please try again." }, { status: 502 });
  }
}
