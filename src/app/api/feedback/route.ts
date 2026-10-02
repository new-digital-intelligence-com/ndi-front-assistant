import { recordButtonFeedback } from "@/lib/feedback";
import { supabaseConfigured } from "@/lib/supabase";

// 👍 / 👎 under an answer in the website chat. Behind the site password like the rest of the site.
// A 👎 (with "What was wrong?") waits for staff on /admin → 📚 Knowledge → Feedback.
export async function POST(request: Request) {
  if (!supabaseConfigured()) return Response.json({ error: "Feedback is not configured" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const rating = body.rating === "like" || body.rating === "dislike" ? body.rating : null;
  if (!/^conv_[A-Za-z0-9_]{6,100}$/.test(conversationId) || !/^[A-Za-z0-9-]{6,64}$/.test(messageId) || !rating) {
    return Response.json({ error: "Invalid feedback" }, { status: 400 });
  }
  try {
    await recordButtonFeedback({ conversationId, messageId, rating, question: body.question, answer: body.answer, comment: body.comment });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("feedback failed", error);
    return Response.json({ error: "Could not save the feedback" }, { status: 502 });
  }
}
