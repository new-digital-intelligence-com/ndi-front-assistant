import { elevenLabsGet } from "@/lib/elevenlabs";
import { hasValidSession } from "@/lib/session";
import { registerWebsiteConversation } from "@/lib/websiteSession";

// WebRTC conversation token for voice conversations. Keeps the API key on the server.
export async function GET() {
  if (!(await hasValidSession())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { token, conversation_id } = await elevenLabsGet<{ token: string; conversation_id?: string }>(
      "/conversation/token",
    );

    // Tie this conversation to the visitor now, so Ellie's lookup recognises them.
    await registerWebsiteConversation(conversation_id);

    return Response.json({ conversationToken: token, conversationId: conversation_id ?? null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not start a voice session" }, { status: 502 });
  }
}
