// Whether Ellie's email replies are sent straight away ("auto") or left as Gmail drafts for staff
// ("draft"). The switch lives in ElevenLabs, as the dynamic variable placeholder `email_mode` on
// the Aida agent, so staff can flip it on the website and Claude can flip it through the
// ElevenLabs connector, and both see the same value.
//
// It is on Aida and not on Ellie on purpose: a placeholder on Ellie could change how her channel
// triggers start conversations (an integration__ placeholder once took Telegram down). Aida has
// no channels, and nothing in her prompt uses the variable.

export type EmailMode = "auto" | "draft";

export const EMAIL_MODE_VARIABLE = "email_mode";

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

const asMode = (value: unknown): EmailMode => (String(value).trim().toLowerCase() === "auto" ? "auto" : "draft");

/** Anything unreadable counts as "draft": a reply nobody checked is worse than one that waits. */
export async function getEmailMode(): Promise<EmailMode> {
  try {
    return asMode((await placeholders())[EMAIL_MODE_VARIABLE]);
  } catch (error) {
    console.error("Could not read email_mode, using draft", error);
    return "draft";
  }
}

export async function setEmailMode(mode: EmailMode): Promise<EmailMode> {
  const { url, apiKey } = aidaAgent();
  // Send every placeholder back, not only ours, so nothing else on the agent is dropped.
  const current = await placeholders();
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_config: {
        agent: { dynamic_variables: { dynamic_variable_placeholders: { ...current, [EMAIL_MODE_VARIABLE]: mode } } },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Changing email_mode failed with ${response.status}`);
  return getEmailMode();
}
