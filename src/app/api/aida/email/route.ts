import {
  countEmails,
  displayCode,
  draftOutcomes,
  findRoomByCode,
  isRoomActive,
  listEvents,
  markEmailed,
  MAX_EMAILS_PER_ROOM,
  normaliseCode,
  roomTranscript,
} from "@/lib/aida";
import { isStaffRequest } from "@/lib/aidaStaff";
import { normaliseEmail } from "@/lib/customers";
import { mailConfigured, sendMail } from "@/lib/mailer";
import { formatDate, transcriptEmail } from "@/lib/transcriptEmail";

// Emails a finished room's history to the address the person types. Customers get the conversation
// they saw; staff also get Aida's drafts and what happened to each. Only once the room has ended,
// and only a limited number of times per room, so the CDA mailbox cannot be used to send spam.
export async function POST(request: Request) {
  if (!mailConfigured()) return Response.json({ error: "Email is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const room = await findRoomByCode(normaliseCode(body.code));
  if (!room) return Response.json({ error: "That room code does not exist." }, { status: 404 });
  if (isRoomActive(room)) {
    return Response.json({ error: "The history can be emailed once the room has ended." }, { status: 409 });
  }

  const to = normaliseEmail(body.email);
  if (!to) return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  if ((await countEmails(room.id)) >= MAX_EMAILS_PER_ROOM) {
    return Response.json({ error: "This room's history has already been emailed too many times." }, { status: 429 });
  }

  const role = (await isStaffRequest(request)) ? "employee" : "customer";
  const events = await listEvents(room.id, role);
  const drafts = role === "employee" ? draftOutcomes(events) : [];
  const code = displayCode(room.code);
  const ended = room.closed_at ?? room.expires_at;

  const { text, html } = transcriptEmail({
    heading: `Your call with CDA${room.title ? `: ${room.title}` : ""}`,
    intro: `Room ${code} · ${formatDate(room.created_at)} · ended ${formatDate(ended)}`,
    lines: roomTranscript(events),
    sections: drafts.length ? [{ heading: "Aida's drafts (CDA staff only)", lines: drafts }] : [],
  });

  try {
    await sendMail({ to, subject: `Your CDA call – room ${code}`, text, html });
  } catch (error) {
    console.error("Could not email the room history", error);
    return Response.json({ error: "The email could not be sent. Please try again." }, { status: 502 });
  }

  await markEmailed(room.id, { identity: role, name: role === "employee" ? "CDA staff" : "customer", role });
  return Response.json({ ok: true, sentTo: to });
}
