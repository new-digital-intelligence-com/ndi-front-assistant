// NDI's AI Employees, read from NDI's AI Employees API (it reads NDI's catalog, master sheet and pricing files).
// Prices and other internal details never leave the server: only the fields copied in `toPublic` are kept, so a
// field the API adds later stays out until someone adds it here.
//
//   AI Employees API ──(hourly, only when changed)──► this list ──► /ai-employees (every AI Employee)
//                                                                └► /demos (the demo videos)
//   Both pages are ElevenLabs URL documents in Clara's and Aida's knowledge; a new version asks ElevenLabs to read
//   them again at once (ElevenLabs' own daily re-read catches up if that ever fails).
//
// The API says when it checks its files next (`nextCheckAt`, every hour). The app's scheduler (src/lib/dailyJobs.ts →
// /api/cron/ai-employees) asks about 5 minutes after that, with `If-None-Match: "<version>"`: while nothing changed the
// reply is an empty 304. The list is kept in memory only, so it is read again once when the server starts.
// No imports, so the list logic can be tried on its own.

export type AiEmployee = {
  code: string;
  name: string;
  category: string;
  tagline: string;
  trigger: string;
  features: string[];
  humanInTheLoop: string;
  timeSaving: string;
  benefits: string[];
  outcome: string;
  channels: string[];
  integrations: string[];
  outputs: string[];
  demoComingSoon: boolean;
  videoUrl: string | null;
};
export type AiEmployeeList = {
  version: string;
  categories: { prefix: string; name: string }[];
  employees: AiEmployee[];
  /** When the app last heard from the API (a 304 counts). */
  checkedAt: string;
};

export const NDI_YOUTUBE_CHANNEL = "https://www.youtube.com/@NewDigitalIntelligence-j5c";
/** Videos about NDI itself (not in the AI Employees API), as they were on /demos on 10 Nov 2026. */
export const COMPANY_VIDEOS = [
  { title: "NDI Teaser", url: "https://www.youtube.com/watch?v=G77yqt4itfI" },
  { title: "Building your AI factory with NDI", url: "https://www.youtube.com/watch?v=OhaaEU4Kj0s" },
  { title: "Build your AI factory", url: "https://www.youtube.com/watch?v=Ayluvdg_444" },
];

/** About 5 minutes after the API's own check. */
const AFTER_API_CHECK_MS = 5 * 60_000;
const DEFAULT_EVERY_MS = 60 * 60_000;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const texts = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const link = (value: unknown) => (/^https?:\/\/\S+$/.test(text(value)) ? text(value) : null);

/** The public part of one AI Employee: no business case, prices, maturity, priority, agents or platform services. */
function toPublic(raw: Record<string, unknown>): AiEmployee {
  return {
    code: text(raw.code),
    name: text(raw.name),
    category: text(raw.category),
    tagline: text(raw.tagline),
    trigger: text(raw.trigger),
    features: texts(raw.features),
    humanInTheLoop: text(raw.humanInTheLoop),
    timeSaving: text(raw.timeSaving),
    benefits: texts(raw.benefits),
    outcome: text(raw.outcome),
    channels: texts(raw.channels),
    integrations: texts(raw.integrations),
    outputs: texts(raw.outputs),
    demoComingSoon: raw.demoComingSoon === true,
    videoUrl: link(raw.videoUrl),
  };
}

/** The API's reply, without anything internal. Throws when it holds no AI Employees, so the last list is kept. */
export function toPublicList(body: unknown, checkedAt: string): AiEmployeeList {
  const data = (body ?? {}) as Record<string, unknown>;
  const version = text(data.version);
  const rows = Array.isArray(data.aiEmployees) ? (data.aiEmployees as Record<string, unknown>[]) : [];
  const employees = rows.filter((row) => row && typeof row === "object").map(toPublic).filter((row) => row.code && row.name);
  if (!version || !employees.length) throw new Error("AI Employees API reply has no version or no AI Employees");
  const categories = (Array.isArray(data.categories) ? (data.categories as Record<string, unknown>[]) : [])
    .map((category) => ({ prefix: text(category?.prefix), name: text(category?.name) }))
    .filter((category) => category.prefix && category.name);
  return { version, categories, employees, checkedAt };
}

/** The next time to ask: `nextCheckAt` plus 5 minutes, moved on by the API's interval until it is in the future. */
export function nextAskAt(nextCheckAt: number, everyMs: number, now: number) {
  let at = (Number.isFinite(nextCheckAt) ? nextCheckAt : now) + AFTER_API_CHECK_MS;
  while (at <= now) at += everyMs;
  return at;
}

export const aiEmployeesConfigured = () => Boolean(process.env.AI_EMPLOYEES_API_URL && process.env.AI_EMPLOYEES_API_TOKEN);

// Kept on globalThis, so the pages and the scheduled check share one list in this server process.
const store = globalThis as typeof globalThis & {
  ndiAiEmployees?: { list: AiEmployeeList; nextCheckAt: number; everyMs: number };
  ndiAiEmployeesReading?: Promise<boolean> | null;
  ndiAiEmployeesSent?: string;
};

const savedList = () => store.ndiAiEmployees?.list ?? null;

/** Asks the API once. True when a new version came in. Throws when the API cannot be read (the last list stays). */
function readApi(): Promise<boolean> {
  store.ndiAiEmployeesReading ??= (async () => {
    const saved = store.ndiAiEmployees;
    const response = await fetch(process.env.AI_EMPLOYEES_API_URL ?? "", {
      headers: {
        Authorization: `Bearer ${process.env.AI_EMPLOYEES_API_TOKEN ?? ""}`,
        ...(saved ? { "If-None-Match": `"${saved.list.version}"` } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const now = new Date();
    if (response.status === 304 && saved) {
      saved.list = { ...saved.list, checkedAt: now.toISOString() };
      saved.nextCheckAt = nextAskAt(saved.nextCheckAt, saved.everyMs, now.getTime()) - AFTER_API_CHECK_MS;
      return false;
    }
    // The message never includes the token.
    if (!response.ok) throw new Error(`AI Employees API failed with ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const list = toPublicList(body, now.toISOString());
    const minutes = Number(body.checkEveryMinutes);
    const everyMs = minutes >= 5 && minutes <= 24 * 60 ? minutes * 60_000 : DEFAULT_EVERY_MS;
    const nextCheckAt = nextAskAt(Date.parse(text(body.nextCheckAt)), everyMs, now.getTime()) - AFTER_API_CHECK_MS;
    store.ndiAiEmployees = { list, nextCheckAt, everyMs };
    return list.version !== saved?.list.version;
  })().finally(() => {
    store.ndiAiEmployeesReading = null;
  });
  return store.ndiAiEmployeesReading;
}

/** The list for the pages. Read from the API only when the server has none yet; null when it cannot be read. */
export async function getAiEmployees(): Promise<AiEmployeeList | null> {
  if (savedList()) return savedList();
  if (!aiEmployeesConfigured()) return null;
  try {
    await readApi();
  } catch (error) {
    console.error("AI Employees could not be read", error instanceof Error ? error.message : error);
  }
  return savedList();
}

/** Asks ElevenLabs to read a URL document again, so Clara's and Aida's knowledge follows. */
async function refreshKnowledgeDocument(documentId: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${encodeURIComponent(documentId)}/refresh`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ElevenLabs refresh failed with ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

export type AiEmployeesCheck = {
  changed: boolean;
  refreshed: string[];
  employees?: number;
  version?: string;
  /** When the scheduler should ask again: about 5 minutes after the API's next check. */
  askAgainAt?: string;
  skipped?: string;
};

/**
 * The hourly check: asks the API and, when this server has not yet sent the current version to ElevenLabs, asks
 * ElevenLabs to re-read /ai-employees and /demos. A failed refresh is tried again at the next check. The first check
 * after a start always refreshes once, which is harmless.
 */
export async function checkAiEmployees(): Promise<AiEmployeesCheck> {
  if (!aiEmployeesConfigured()) return { changed: false, refreshed: [], skipped: "AI_EMPLOYEES_API_URL or AI_EMPLOYEES_API_TOKEN is not set" };
  const changed = await readApi();
  const saved = store.ndiAiEmployees!;
  const result: AiEmployeesCheck = {
    changed,
    refreshed: [],
    employees: saved.list.employees.length,
    version: saved.list.version,
    askAgainAt: new Date(saved.nextCheckAt + AFTER_API_CHECK_MS).toISOString(),
  };
  if (store.ndiAiEmployeesSent === saved.list.version) return result;
  const documents = [
    ["ai-employees", process.env.ELEVENLABS_AI_EMPLOYEES_DOCUMENT_ID],
    ["demos", process.env.ELEVENLABS_DEMOS_DOCUMENT_ID],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  for (const [name, documentId] of documents) {
    await refreshKnowledgeDocument(documentId);
    result.refreshed.push(name);
  }
  store.ndiAiEmployeesSent = saved.list.version;
  return result;
}
