// The daily jobs on Railway, which has no Vercel Cron: renew the Gmail watch, refresh the Instagram
// token, compare sent email drafts and import the last 2 days of moods (all in /api/cron/daily).
// The app calls its own route once a day, at or after 06:00 UTC, with the cron secret, exactly as
// Vercel Cron did. A restart later the same day runs them again, which is harmless: every job is
// safe to repeat. Started from src/instrumentation.ts.

import { setInterval, setTimeout } from "node:timers";

const FIRST_CHECK_MS = 60_000;
const CHECK_EVERY_MS = 30 * 60_000;
const RUN_FROM_UTC_HOUR = 6;

let started = false;
let lastRunDay: string | null = null;

/**
 * Starts the timer, once per server. Off on a laptop (`next dev`), during `next build`, without
 * CRON_SECRET, and with DAILY_JOBS=off. The timers never keep a process alive on their own.
 */
export function startDailyJobs() {
  if (started) return;
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.CRON_SECRET || process.env.DAILY_JOBS === "off") return;
  started = true;
  setTimeout(() => void runIfDue(), FIRST_CHECK_MS).unref();
  setInterval(() => void runIfDue(), CHECK_EVERY_MS).unref();
  console.log("daily jobs: scheduled (once a day from 06:00 UTC)");
}

async function runIfDue() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastRunDay === today || now.getUTCHours() < RUN_FROM_UTC_HOUR) return;
  lastRunDay = today;
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/cron/daily`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10 * 60_000),
    });
    console.log(`daily jobs: ${response.status} ${(await response.text()).slice(0, 800)}`);
    // Not run (the server was not ready, say): try again at the next check.
    if (!response.ok) lastRunDay = null;
  } catch (error) {
    console.error("daily jobs could not run", error);
    lastRunDay = null;
  }
}
