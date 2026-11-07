import { elevenLabsGet } from "@/lib/elevenlabs";
import { publicConversation } from "@/lib/publicConversation";
import { conversationIdFromSignedUrl, registerWebsiteConversation } from "@/lib/websiteSession";

// Signed WebSocket URL for text (chat) conversations. Keeps the API key on the server.
export async function GET(request: Request) {
  const blocked = publicConversation(request);
  if (blocked) return blocked;
  try {
    const { signed_url } = await elevenLabsGet<{ signed_url: string }>("/conversation/get-signed-url", {
      include_conversation_id: "true",
    });

    // Tie this conversation to the visitor now, so Clara's lookup recognises them.
    const conversationId = conversationIdFromSignedUrl(signed_url);
    await registerWebsiteConversation(conversationId);

    return Response.json({ signedUrl: signed_url, conversationId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not start a chat session" }, { status: 502 });
  }
}
