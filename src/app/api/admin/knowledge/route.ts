import { isStaffRequest } from "@/lib/aidaStaff";
import { emailChannelConfigured } from "@/lib/emailInbox";
import { checkSentDrafts } from "@/lib/feedback";
import { approve, deleteFaq, dismiss, knowledgeState, publish, updateFaq } from "@/lib/knowledge";
import { supabaseConfigured } from "@/lib/supabase";

// The "Knowledge" tab on /admin. Staff only (Aida staff token).
//   GET  → questions Ellie could not answer, feedback and staff corrections, the week's 👍 / 👎, the
//          approved answers and when they were published. Also looks for email drafts staff sent.
//   POST → { action: "approve" | "add", question, answer, gapIds?, feedbackIds? }, { action: "update",
//          id, question, answer }, { action: "delete", id }, { action: "dismiss", gapIds?, feedbackIds? },
//          { action: "publish" }
// Every change to the approved answers republishes "CDA approved FAQ" to Ellie straight away.

export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return Response.json({ error: "The database is not configured" }, { status: 503 });
  try {
    // Email drafts staff have sent since the last look: a changed fact becomes a correction below.
    if (emailChannelConfigured()) await checkSentDrafts().catch((error) => console.error("sent draft check failed", error));
    return Response.json(await knowledgeState());
  } catch (error) {
    console.error("knowledge state failed", error);
    return Response.json({ error: "Could not load the knowledge gaps" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return Response.json({ error: "The database is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const approvedBy = typeof body.approvedBy === "string" && body.approvedBy.trim() ? body.approvedBy.trim().slice(0, 80) : null;
  try {
    let problem: string | null = null;
    switch (body.action) {
      case "approve":
      case "add":
        problem = await approve({ question: body.question, answer: body.answer, gapIds: body.gapIds, feedbackIds: body.feedbackIds, approvedBy });
        break;
      case "update":
        problem = await updateFaq(body.id, body.question, body.answer);
        break;
      case "delete":
        await deleteFaq(body.id);
        break;
      case "dismiss":
        await dismiss(body.gapIds, body.feedbackIds);
        break;
      case "publish":
        await publish();
        break;
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    if (problem) return Response.json({ error: problem }, { status: 400 });
    return Response.json(await knowledgeState());
  } catch (error) {
    console.error("knowledge change failed", error);
    return Response.json({ error: "Saved, but Ellie's knowledge could not be updated. Try Publish again." }, { status: 502 });
  }
}
