import type { AvatarOrientation } from "@/components/types";
import { elevenLabsGet } from "@/lib/elevenlabs";
import { conversationIdFromSignedUrl, registerWebsiteConversation } from "@/lib/websiteSession";
import { hasValidSession } from "@/lib/session";

const DEFAULT_MAX_SESSION_SECONDS = 180;

// The only output sizes Anam supports for cara-4 avatars.
const VIDEO_SIZES: Record<AvatarOrientation, { videoWidth: number; videoHeight: number }> = {
  horizontal: { videoWidth: 1152, videoHeight: 768 },
  vertical: { videoWidth: 768, videoHeight: 1152 },
};

// Creates a short-lived Anam session token for Ellie's face. Anam's engine joins the ElevenLabs agent
// through the signed URL, so Ellie keeps her prompt, voice and knowledge. Both API keys stay on the server.
export async function POST(request: Request) {
  if (!(await hasValidSession())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orientation, language } = (await request.json().catch(() => ({}))) as { orientation?: string; language?: string };
  const videoSize = VIDEO_SIZES[orientation === "vertical" ? "vertical" : "horizontal"];
  // Polish uses Ellie's "pl" preset in ElevenLabs. Anam passes the override on when it joins Ellie.
  const languageOverride = language === "pl" ? { conversationConfigOverride: { agent: { language: "pl" } } } : {};

  const apiKey = process.env.ANAM_API_KEY;
  const avatarId = process.env.ANAM_AVATAR_ID;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !avatarId || !agentId) {
    return Response.json({ error: "The avatar is not configured" }, { status: 503 });
  }
  const maxSeconds = Number(process.env.ANAM_MAX_SESSION_SECONDS) || DEFAULT_MAX_SESSION_SECONDS;

  try {
    const { signed_url } = await elevenLabsGet<{ signed_url: string }>("/conversation/get-signed-url", {
      include_conversation_id: "true",
    });

    // Tie this avatar call to the visitor, so Ellie recognises them here too.
    const conversationId = conversationIdFromSignedUrl(signed_url);
    await registerWebsiteConversation(conversationId);

    const response = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personaConfig: {
          avatarId,
          avatarModel: "cara-4",
          maxSessionLengthSeconds: maxSeconds,
          directorNotes: { presetStyle: "warm", expressivity: 0.5 },
        },
        environment: { elevenLabsAgentSettings: { signedUrl: signed_url, agentId, ...languageOverride } },
        sessionOptions: videoSize,
      }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as { sessionToken?: string; message?: string };
    if (!response.ok || !body.sessionToken) {
      console.error("Anam session token failed", response.status, body.message);
      return Response.json({ error: "Could not start the avatar" }, { status: 502 });
    }
    return Response.json({ sessionToken: body.sessionToken, maxSeconds, conversationId });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not start the avatar" }, { status: 502 });
  }
}
