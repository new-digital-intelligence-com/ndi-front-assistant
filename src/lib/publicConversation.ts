/** Public demo conversations are isolated by the existing visitor cookie, with a start-rate cap. */
export function conversationGate(now = () => Date.now()) {
  const attempts = new Map<string, { until: number; count: number }>();
  return (request: Request): Response | null => {
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return Response.json({ error: "Start the conversation from this website." }, { status: 403 });
    }
    const time = now();
    for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const entry = attempts.get(address) ?? { until: time + 600_000, count: 0 };
    if (entry.count >= 10 || (!attempts.has(address) && attempts.size >= 10_000)) {
      return Response.json({ error: "Please wait a few minutes before starting another conversation." }, { status: 429 });
    }
    entry.count++;
    attempts.set(address, entry);
    return null;
  };
}

export const publicConversation = conversationGate();
