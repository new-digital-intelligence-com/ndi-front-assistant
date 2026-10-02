const API_BASE = "https://api.elevenlabs.io/v1/convai";

function credentials() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    throw new Error("ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be set in .env.local");
  }
  return { apiKey, agentId };
}

/**
 * A one-use token that lets a browser stream its microphone to Scribe (live speech to text)
 * without ever seeing the API key.
 */
export async function realtimeScribeToken(): Promise<string> {
  const { apiKey } = credentials();
  const response = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs single-use token failed with ${response.status}`);
  }
  return ((await response.json()) as { token: string }).token;
}

export type ConversationRecord = {
  status: "initiated" | "in-progress" | "processing" | "done" | "failed";
  transcript?: { role: "user" | "agent"; message: string | null }[];
  metadata?: {
    start_time_unix_secs?: number;
    text_only?: boolean;
    /** Set for conversations started by a channel trigger, e.g. external_system "custom_channel". */
    async_metadata?: { external_system?: string | null; external_id?: string | null } | null;
    /** Phone calls: external_number is the customer's own number, whichever side dialled. */
    phone_call?: { direction?: "inbound" | "outbound" | string; external_number?: string | null } | null;
  };
  /** What the channel passed in when the conversation started, e.g. Make's instagram_id. */
  conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> | null } | null;
};

/** One conversation with its transcript, as ElevenLabs stored it. Free to read. */
export async function elevenLabsConversation(conversationId: string): Promise<ConversationRecord> {
  const { apiKey } = credentials();
  const response = await fetch(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`ElevenLabs conversation lookup failed with ${response.status}`);
  return (await response.json()) as ConversationRecord;
}

/**
 * Calls an ElevenLabs endpoint with the server-side API key and returns its JSON body. It targets
 * Ellie unless `params.agent_id` names another agent, such as Aida.
 */
export async function elevenLabsGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { apiKey, agentId } = credentials();
  const query = new URLSearchParams({ agent_id: agentId, ...params });
  const response = await fetch(`${API_BASE}${path}?${query}`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}
