import { hasValidToolSecret } from "@/lib/agentAuth";
import { startHandover } from "@/lib/handover";

const NOT_POSSIBLE =
  "Nobody can take over this call. Apologise briefly and tell the customer that the NDI team will get back to them.";

// Tool `transfer_to_human`: on a call from a staff call list that names a colleague, Clara hands the
// customer over to them (src/lib/handover.ts). ElevenLabs runs it once Clara has finished saying that
// she is connecting them. Anything that goes wrong answers ok=false with status 200, so Clara
// apologises instead of the customer hearing an error.
export async function POST(request: Request) {
  if (!(await hasValidToolSecret(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
  try {
    return Response.json(await startHandover({ conversationId, summary: body.summary, language: body.language }));
  } catch (error) {
    console.error("hand-over failed", error);
    return Response.json({ ok: false, message: NOT_POSSIBLE });
  }
}
