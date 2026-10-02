// Whether Clara's replies are sent straight away ("auto") or wait for staff ("draft"), one switch per written
// channel: email (a Gmail draft in the customer's thread) and Instagram and Messenger (a draft on /admin,
// src/lib/socialDrafts.ts). The switches live in ElevenLabs, as the dynamic variable placeholders
// `email_mode`, `instagram_mode` and `messenger_mode` on the Aida agent, so staff can flip them on the
// website and Claude can flip them through the ElevenLabs connector, and both see the same values.
//
// They are on Aida and not on Clara on purpose: a placeholder on Clara could change how her channel
// triggers start conversations (an integration__ placeholder once took Telegram down). Aida has
// no channels, and nothing in her prompt uses the variables.

export type ReplyMode = "auto" | "draft";
export type EmailMode = ReplyMode;
export type ReplyChannel = "email" | "instagram" | "messenger";

export const REPLY_CHANNELS: ReplyChannel[] = ["email", "instagram", "messenger"];

const VARIABLES: Record<ReplyChannel, string> = {
  email: "email_mode",
  instagram: "instagram_mode",
  messenger: "messenger_mode",
};

type AgentVariables = {
  conversation_config?: { agent?: { dynamic_variables?: { dynamic_variable_placeholders?: Record<string, unknown> } } };
};

function aidaAgent() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.AIDA_AGENT_ID;
  if (!apiKey || !agentId) throw new Error("ELEVENLABS_API_KEY and AIDA_AGENT_ID must be set");
  return { url: `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, apiKey };
}

async function placeholders(): Promise<Record<string, unknown>> {
  const { url, apiKey } = aidaAgent();
  const response = await fetch(url, { headers: { "xi-api-key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Reading the Aida agent failed with ${response.status}`);
  const agent = (await response.json()) as AgentVariables;
  return agent.conversation_config?.agent?.dynamic_variables?.dynamic_variable_placeholders ?? {};
}

const asMode = (value: unknown): ReplyMode => (String(value).trim().toLowerCase() === "auto" ? "auto" : "draft");

/** Anything unreadable counts as "draft": a reply nobody checked is worse than one that waits. */
export async function getReplyMode(channel: ReplyChannel): Promise<ReplyMode> {
  try {
    return asMode((await placeholders())[VARIABLES[channel]]);
  } catch (error) {
    console.error(`Could not read ${VARIABLES[channel]}, using draft`, error);
    return "draft";
  }
}

/** All three switches with one read, for /admin. */
export async function getReplyModes(): Promise<Record<ReplyChannel, ReplyMode>> {
  const values = await placeholders().catch((error) => {
    console.error("Could not read the reply modes, showing draft", error);
    return {} as Record<string, unknown>;
  });
  return { email: asMode(values[VARIABLES.email]), instagram: asMode(values[VARIABLES.instagram]), messenger: asMode(values[VARIABLES.messenger]) };
}

export async function setReplyMode(channel: ReplyChannel, mode: ReplyMode): Promise<ReplyMode> {
  const { url, apiKey } = aidaAgent();
  // Send every placeholder back, not only ours, so nothing else on the agent is dropped.
  const current = await placeholders();
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_config: {
        agent: { dynamic_variables: { dynamic_variable_placeholders: { ...current, [VARIABLES[channel]]: mode } } },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Changing ${VARIABLES[channel]} failed with ${response.status}`);
  return getReplyMode(channel);
}

export const getEmailMode = () => getReplyMode("email");
export const setEmailMode = (mode: ReplyMode) => setReplyMode("email", mode);
