import { isWatchRequest, resetLive, watchEnded, watchStarted } from "@/lib/liveCall";
import { isCallKind } from "@/lib/twilio";

// server.mjs knows which calls staff pages show live (their sound bars are its WebSockets), and tells the
// app here: a call is now watched ({ key: "list:<id>", watched: true }), no longer watched (watched: false),
// or, as server.mjs starts, nothing is ({ reset: true }). The app starts and stops the call's live sound
// and transcript to match (src/lib/liveCall.ts). The key in the x-ndi-live header is the proof.
export async function POST(request: Request) {
  if (!(await isWatchRequest(request))) return new Response("Forbidden", { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; watched?: unknown; reset?: unknown };
  try {
    if (body.reset === true) {
      await resetLive();
      return new Response(null, { status: 204 });
    }
    const [kind, id] = typeof body.key === "string" ? body.key.split(":") : [];
    if (!isCallKind(kind) || !/^[0-9a-f-]{36}$/i.test(id ?? "")) return new Response("Unknown call", { status: 400 });
    await (body.watched === true ? watchStarted({ kind, id }) : watchEnded({ kind, id }));
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("live call: watching not handled", body, error);
    return new Response("Failed", { status: 502 });
  }
}
