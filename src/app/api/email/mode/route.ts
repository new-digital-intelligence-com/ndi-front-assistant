import { isStaffRequest } from "@/lib/aidaStaff";
import { emailChannelConfigured, recentEmails } from "@/lib/emailInbox";
import { getEmailMode, setEmailMode } from "@/lib/emailMode";
import { mailboxAddress } from "@/lib/gmail";
import { isUpsetEmail } from "@/lib/mood";

// The staff switch between sending Ellie's email replies straight away and leaving them as Gmail
// drafts, plus the last few emails and what happened to each. Aida staff only (x-aida-staff).
export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailChannelConfigured()) return Response.json({ configured: false });

  const [mode, recent] = await Promise.all([
    getEmailMode(),
    recentEmails().catch((error) => {
      console.error("Could not list recent emails", error);
      return [];
    }),
  ]);
  return Response.json({
    configured: true,
    mode,
    mailbox: mailboxAddress(),
    recent: recent.map((row) => ({
      id: row.gmail_id,
      threadId: row.thread_id,
      from: row.from_name || row.from_email,
      subject: row.subject,
      status: row.status,
      reason: row.reason,
      at: row.created_at,
      // The writer's mood, rated before Ellie saw it; upset ones are always left as drafts.
      upset: isUpsetEmail(row.mood_frustration),
    })),
  });
}

export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
  if (body.mode !== "auto" && body.mode !== "draft") {
    return Response.json({ error: "mode must be auto or draft" }, { status: 400 });
  }
  try {
    return Response.json({ mode: await setEmailMode(body.mode) });
  } catch (error) {
    console.error("Could not change email_mode", error);
    return Response.json({ error: "Could not change the setting. Please try again." }, { status: 502 });
  }
}
