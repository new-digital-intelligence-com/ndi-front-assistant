// The scheduled jobs on Railway, which has no Vercel Cron. Started from src/instrumentation.ts.
// - Daily: renew the Gmail watch, refresh the Instagram token, compare sent email drafts and import the last
//   2 days of moods (all in /api/cron/daily), once a day at or after 06:00 UTC, exactly as Vercel Cron did. A
//   restart later the same day runs them again, which is harmless: every job is safe to repeat.
// - Hourly, when YOUTUBE_API_KEY is set: check NDI's YouTube demo videos (/api/cron/demos), so a new video
//   reaches Clara's knowledge within about an hour (src/lib/demoVideos.ts).
// The app calls its own routes with the cron secret.

import { setInterval, setTimeout } from "node:timers";

const FIRST_CHECK_MS = 60_000;
const CHECK_EVERY_MS = 30 * 60_000;
const RUN_FROM_UTC_HOUR = 6;
const DEMOS_EVERY_MS = 60 * 60_000;

let started = false;
let lastRunDay: string | null = null;
let lastDemosCheck = 0;

/**
 * Starts the timer, once per server. Off on a laptop (`next dev`), during `next build`, without
 * CRON_SECRET, and with DAILY_JOBS=off. The timers never keep a process alive on their own.
 */
export function startDailyJobs() {
  if (started) return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.CRON_SECRET || process.env.DAILY_JOBS === "off") return;
  started = true;
  setTimeout(tick, FIRST_CHECK_MS).unref();
  setInterval(tick, CHECK_EVERY_MS).unref();
  console.log(`daily jobs: scheduled (once a day from 06:00 UTC${process.env.YOUTUBE_API_KEY ? ", demo videos hourly" : ""})`);
}

function tick() {
  void runIfDue();
  void checkDemosIfDue();
}

/** GET on one of the app's own routes, with the cron secret. */
function callOwnRoute(path: string, timeoutMs: number) {
  return fetch(`http://127.0.0.1:${process.env.PORT || 3000}${path}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function runIfDue() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastRunDay === today || now.getUTCHours() < RUN_FROM_UTC_HOUR) return;
  lastRunDay = today;
  try {
    const response = await callOwnRoute("/api/cron/daily", 10 * 60_000);
    console.log(`daily jobs: ${response.status} ${(await response.text()).slice(0, 800)}`);
    // Not run (the server was not ready, say): try again at the next check.
    if (!response.ok) lastRunDay = null;
  } catch (error) {
    console.error("daily jobs could not run", error);
    lastRunDay = null;
  }
}

/** Roughly every hour (every other 30-minute tick). Logs only when something changed or failed. */
async function checkDemosIfDue() {
  if (!process.env.YOUTUBE_API_KEY || Date.now() - lastDemosCheck < DEMOS_EVERY_MS - 60_000) return;
  lastDemosCheck = Date.now();
  try {
    const response = await callOwnRoute("/api/cron/demos", 2 * 60_000);
    const body = await response.text();
    if (!response.ok || body.includes('"changed":true')) console.log(`demo videos: ${response.status} ${body.slice(0, 300)}`);
  } catch (error) {
    console.error("demo videos check could not run", error);
  }
}
