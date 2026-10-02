import { isStaffRequest } from "@/lib/aidaStaff";
import { generalise } from "@/lib/knowledge";

// Claude Haiku turns one customer's case (feedback or a staff correction) into a general question
// and answer for everyone, without that customer's personal details. Nothing is stored.
export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const entry = await generalise({
      question: body.question,
      originalAnswer: body.originalAnswer,
      correctedAnswer: body.correctedAnswer,
      comment: body.comment,
    });
    return entry ? Response.json(entry) : Response.json({ error: "Claude could not write a general answer" }, { status: 502 });
  } catch (error) {
    console.error("generalise failed", error);
    return Response.json({ error: "Claude could not write a general answer just now" }, { status: 502 });
  }
}
