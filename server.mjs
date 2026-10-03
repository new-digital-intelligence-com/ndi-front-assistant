// The web app's server on Railway (`npm start`, after `next build`): Next.js, plus two WebSocket endpoints
// that Next.js cannot hold, because its route handlers end once their response is sent:
//
//   /api/twilio/media-stream  Twilio sends a copy of a phone call's audio here (src/lib/liveCall.ts).
//   /api/live/signal          A call's live view on /admin/calls watches its sound here
//                             (src/components/admin/LiveSignal.tsx), with the Aida staff token.
//
// The audio is never stored or passed on: each 20 ms of it becomes one loudness number, and staff receive
// the loudest of every 100 ms, for the customer and for NDI's side (Clara, or the colleague after a
// hand-over). Everything is kept in memory, which is enough for the one server Railway runs.
//
// Twilio charges for the copy (and for the live transcript that goes with it), so it runs only while a
// staff page watches the call: this server tells the app when a call's first page connects, and when its
// last page has been gone for a little while (POST /api/live/watch), and the app starts and stops both.
//
// `npm run dev` stays `next dev`, without the live sound and transcript.

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

// What `next start` sets before starting Next.js; the daily jobs (src/instrumentation.ts) check both.
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.NEXT_RUNTIME = "nodejs";
const { default: next } = await import("next");

const port = Number(process.env.PORT) || 3000;
const MEDIA_PATH = "/api/twilio/media-stream";
const SIGNAL_PATH = "/api/live/signal";
/** How often staff get a level, and how much of the call a newly opened page is shown. */
const FRAME_MS = 100;
const HISTORY_FRAMES = 80;
/** Twilio's "start" message, which carries the key, must come quickly. */
const START_TIMEOUT_MS = 10_000;
/** How long a call stays live once its last page is gone: a page that reloads or reconnects keeps it. */
const IDLE_AFTER_MS = 15_000;
/** A call without sound is forgotten after this long, once nobody watches it. */
const FORGET_AFTER_MS = 120_000;
const MAX_CALLS = 200;
const MAX_WATCHERS = 20;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const same = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** src/lib/liveCall.ts signalKey, done the same way: proof that the app asked Twilio for this copy. */
const signalKey = (kind, id) => sha256(`ndi-live:${process.env.TWILIO_AUTH_TOKEN?.trim() ?? ""}:${kind}:${id}`).slice(0, 32);

/** src/lib/liveCall.ts isWatchRequest, done the same way: proof for the app that this server is asking. */
const watchKey = () => sha256(`ndi-live-watch:${process.env.TWILIO_AUTH_TOKEN?.trim() ?? ""}`);

/** src/lib/aidaStaff.ts isStaffRequest, done the same way: a staff token made from the Aida staff password. */
function isStaffToken(token) {
  const password = process.env.AIDA_STAFF_PASSWORD;
  if (!password || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  const expiresAt = Number(token.slice(0, dot));
  if (dot < 1 || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return same(sha256(`aida-staff:${password}:${expiresAt}`), token.slice(dot + 1));
}

// --- loudness ------------------------------------------------------------------------------------

/** Phone audio is G.711 µ-law, 8000 samples a second: one byte per sample, decoded with this table. */
const MULAW = new Int16Array(256);
for (let byte = 0; byte < 256; byte++) {
  const u = ~byte & 0xff;
  const magnitude = ((((u & 0x0f) << 3) + 0x84) << ((u >> 4) & 0x07)) - 0x84;
  MULAW[byte] = u & 0x80 ? -magnitude : magnitude;
}

/** 0 for silence to 1 for very loud: the frame's level from -60 dB to 0 dB. */
function loudness(payload) {
  if (typeof payload !== "string" || !payload) return 0;
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length) return 0;
  let sum = 0;
  for (const byte of bytes) sum += MULAW[byte] * MULAW[byte];
  const rms = Math.sqrt(sum / bytes.length);
  if (rms < 1) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms / 32768) + 60) / 60));
}

// --- the calls being listened to -----------------------------------------------------------------

/** "kind:id" → the call's sound as it stands, and the staff pages watching it. */
const calls = new Map();

function callFor(key) {
  let call = calls.get(key);
  if (!call && calls.size < MAX_CALLS) {
    call = { key, streamSid: null, live: false, peak: { c: 0, n: 0 }, history: [], watchers: new Set(), idle: null, forget: null };
    calls.set(key, call);
  }
  return call ?? null;
}

/** "live" while Twilio sends the call's sound; "waiting" before it starts, between two copies, and after. */
const stateOf = (call) => (call.live ? "live" : "waiting");

function send(call, message) {
  const text = JSON.stringify(message);
  for (const watcher of call.watchers) if (watcher.readyState === watcher.OPEN) watcher.send(text);
}

/** Forgets a call nobody needs any more: without sound and not watched. */
function forgetLater(call) {
  clearTimeout(call.forget);
  call.forget = setTimeout(() => {
    if (!call.watchers.size && !call.idle && !call.live) calls.delete(call.key);
  }, FORGET_AFTER_MS);
  call.forget.unref();
}

/** The copy stopped: the call ended, nobody watches it any more, or a hand-over is starting a new one. */
function silent(call) {
  if (!call.live) return;
  call.live = false;
  send(call, { type: "state", state: "waiting" });
  forgetLater(call);
}

/** Tells the app (src/app/api/live/watch) that a call is watched or not, or that nothing is. */
async function tellApp(body) {
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) return; // without Twilio, no call has a live view
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/live/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ndi-live": watchKey() },
      body: JSON.stringify(body),
    });
    if (!response.ok) console.error("live call: the app answered", response.status, body);
  } catch (error) {
    console.error("live call: the app could not be told", body, error);
  }
}

setInterval(() => {
  for (const call of calls.values()) {
    if (!call.live) continue;
    const frame = { c: Math.round(call.peak.c * 100) / 100, n: Math.round(call.peak.n * 100) / 100 };
    call.peak = { c: 0, n: 0 };
    call.history.push(frame);
    if (call.history.length > HISTORY_FRAMES) call.history.shift();
    if (call.watchers.size) send(call, { type: "level", ...frame });
  }
}, FRAME_MS).unref();

// --- Twilio: the call's audio ----------------------------------------------------------------------

const media = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

media.on("connection", (socket) => {
  let call = null;
  let streamSid = null;
  const unproven = setTimeout(() => socket.close(1008, "No start"), START_TIMEOUT_MS);

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.event === "start" && !call) {
      const { kind, id, key } = message.start?.customParameters ?? {};
      const known = (kind === "list" || kind === "incoming") && /^[0-9a-f-]{36}$/i.test(id ?? "") && same(signalKey(kind, id), key);
      call = known ? callFor(`${kind}:${id}`) : null;
      if (!call) return socket.close(1008, "Forbidden");
      clearTimeout(unproven);
      // The newest copy of a call is the one that counts: a hand-over starts a new one.
      streamSid = message.start.streamSid ?? message.streamSid ?? null;
      call.streamSid = streamSid;
      call.live = true;
      clearTimeout(call.forget);
      send(call, { type: "state", state: "live" });
      return;
    }
    if (!call || call.streamSid !== streamSid) return;
    if (message.event === "media") {
      // Inbound is the customer's voice; outbound is what they hear: Clara, or the colleague.
      const side = message.media?.track === "inbound" ? "c" : "n";
      call.peak[side] = Math.max(call.peak[side], loudness(message.media?.payload));
    } else if (message.event === "stop") {
      silent(call);
    }
  });

  socket.on("close", () => {
    clearTimeout(unproven);
    if (call && call.streamSid === streamSid) silent(call);
  });
});

// --- staff: watching a call ------------------------------------------------------------------------

const watching = new WebSocketServer({ noServer: true, maxPayload: 1024 });

watching.on("connection", (socket, key) => {
  const call = callFor(key);
  if (!call || call.watchers.size >= MAX_WATCHERS) return socket.close(1013, "Busy");
  call.watchers.add(socket);
  clearTimeout(call.forget);
  if (call.idle) {
    // Back before the call was let go: its sound and transcript are still running.
    clearTimeout(call.idle);
    call.idle = null;
  } else if (call.watchers.size === 1) {
    void tellApp({ key, watched: true });
  }
  socket.send(JSON.stringify({ type: "hello", state: stateOf(call), history: call.history }));
  socket.on("close", () => {
    call.watchers.delete(socket);
    if (call.watchers.size || call.idle) return;
    call.idle = setTimeout(() => {
      call.idle = null;
      if (call.watchers.size) return;
      void tellApp({ key, watched: false });
      forgetLater(call);
    }, IDLE_AFTER_MS);
    call.idle.unref();
  });
});

// Proxies close quiet connections: a page waiting for a call to start is pinged now and then.
setInterval(() => {
  for (const socket of watching.clients) socket.ping();
}, 25_000).unref();

// --- the server -----------------------------------------------------------------------------------

const app = next({ dev: false, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error("request failed", request.url, error);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === MEDIA_PATH) {
    media.handleUpgrade(request, socket, head, (ws) => media.emit("connection", ws, request));
    return;
  }
  if (url.pathname === SIGNAL_PATH) {
    const key = url.searchParams.get("key") ?? "";
    if (!/^(list|incoming):[0-9a-f-]{36}$/i.test(key) || !isStaffToken(url.searchParams.get("token"))) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    watching.handleUpgrade(request, socket, head, (ws) => watching.emit("connection", ws, key));
    return;
  }
  socket.destroy();
});

server.listen(port, "0.0.0.0", () => {
  console.log(`> NDI assistant ready on port ${port} (Next.js with the live calls)`);
  // No page watches anything yet: whatever a previous server left running for its pages stops.
  void tellApp({ reset: true });
});

// Railway stops the old server with SIGTERM when a new one is deployed.
process.on("SIGTERM", () => {
  for (const socket of [...media.clients, ...watching.clients]) socket.terminate();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
});
