// Runs once when a Next.js server starts. On Railway it starts the daily jobs (src/lib/dailyJobs.ts);
// nothing else in the app depends on it. Node.js only: the timer and fetch to itself need a server.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDailyJobs } = await import("./lib/dailyJobs");
    startDailyJobs();
  }
}
