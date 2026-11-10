// The scheduled jobs on Railway, which has no Vercel Cron. Started from src/instrumentation.ts.
// - Daily: renew the Gmail watch, refresh the Instagram token, compare sent email drafts and import the last
//   2 days of moods (all in /api/cron/daily), once a day at or after 06:00 UTC, exactly as Vercel Cron did. A
//   restart later the same day runs them again, which is harmless: every job is safe to repeat.
// - About once an hour, when the AI Employees API is set up: ask it whether NDI's AI Employees changed
//   (/api/cron/ai-employees), about 5 minutes after the API's own hourly check, so a change reaches Clara's and Aida's
//   knowledge within the hour (src/lib/aiEmployees.ts). The first check is a minute after the server starts. It
//   replaced the YouTube demo-video check on 10 Nov 2026: the API gives every AI Employee's demo video too.
// The app calls its own routes with the cron secret.

import { setInterval, setTimeout } from "node:timers";

const FIRST_CHECK_MS = 60_000;
const CHECK_EVERY_MS = 30 * 60_000;
const RUN_FROM_UTC_HOUR = 6;
/** Bounds for the wait before the next AI Employees check, and the wait after a failed one. */
const AI_EMPLOYEES_MIN_WAIT_MS = 60_000;
const AI_EMPLOYEES_MAX_WAIT_MS = 3 * 60 * 60_000;
const AI_EMPLOYEES_RETRY_MS = 15 * 60_000;

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
  setTimeout(runIfDue, FIRST_CHECK_MS).unref();
  setInterval(runIfDue, CHECK_EVERY_MS).unref();
  const aiEmployees = Boolean(process.env.AI_EMPLOYEES_API_URL && process.env.AI_EMPLOYEES_API_TOKEN);
  if (aiEmployees) setTimeout(askAiEmployees, FIRST_CHECK_MS).unref();
  console.log(`daily jobs: scheduled (once a day from 06:00 UTC${aiEmployees ? ", AI Employees about every hour" : ""})`);
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

/** Asks the API through the app's route, then waits until the time the route gives (about an hour). Logs only changes and failures. */
async function askAiEmployees() {
  let wait = AI_EMPLOYEES_RETRY_MS;
  try {
    const response = await callOwnRoute("/api/cron/ai-employees", 2 * 60_000);
    const body = await response.text();
    if (!response.ok || body.includes('"changed":true')) console.log(`AI Employees: ${response.status} ${body.slice(0, 300)}`);
    const askAgainAt = response.ok ? Date.parse((JSON.parse(body) as { askAgainAt?: string }).askAgainAt ?? "") : NaN;
    if (Number.isFinite(askAgainAt)) {
      wait = Math.min(Math.max(askAgainAt - Date.now(), AI_EMPLOYEES_MIN_WAIT_MS), AI_EMPLOYEES_MAX_WAIT_MS);
    }
  } catch (error) {
    console.error("AI Employees check could not run", error);
  } finally {
    setTimeout(askAiEmployees, wait).unref();
  }
}
