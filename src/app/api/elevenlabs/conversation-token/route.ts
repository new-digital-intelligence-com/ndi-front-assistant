import { elevenLabsGet } from "@/lib/elevenlabs";
import { publicConversation } from "@/lib/publicConversation";
import { registerWebsiteConversation } from "@/lib/websiteSession";

// WebRTC conversation token for voice conversations. Keeps the API key on the server.
export async function GET(request: Request) {
  const blocked = publicConversation(request);
  if (blocked) return blocked;
  try {
    const { token, conversation_id } = await elevenLabsGet<{ token: string; conversation_id?: string }>(
      "/conversation/token",
    );

    // Tie this conversation to the visitor now, so Clara's lookup recognises them.
    await registerWebsiteConversation(conversation_id);

    return Response.json({ conversationToken: token, conversationId: conversation_id ?? null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not start a voice session" }, { status: 502 });
  }
}
