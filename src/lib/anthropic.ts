// Claude through the Anthropic Messages API, for the insights on the staff admin page. Server side
// only. The model comes from ANTHROPIC_MODEL (a small, fast one: claude-haiku-4-5).

const DEFAULT_MODEL = "claude-haiku-4-5";

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** One question, one answer. Returns Claude's text. */
export async function askClaude({
  system,
  prompt,
  maxTokens = 900,
  timeoutMs = 45_000,
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(`Anthropic API failed with ${response.status}: ${body.error?.message ?? ""}`);
  return (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
}

/** Claude is asked for JSON only; take the object out even if a sentence slipped in around it. */
export function parseJsonObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
