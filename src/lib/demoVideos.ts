// NDI's public demo videos, read from NDI's YouTube channel with the YouTube Data API. The API key only reads
// public data (titles and links); it cannot change anything on the channel, and it stays on the server.
//
//   YouTube ──(at most once an hour)──► this list ──► /demos ──► Clara's knowledge (an ElevenLabs URL document)
//
// Visitors never reach YouTube themselves: the list is kept for an hour. The hourly check (src/lib/dailyJobs.ts →
// /api/cron/demos) reads YouTube and, when the list changed, asks ElevenLabs to re-read /demos at once, so Clara
// knows a new video within about an hour; ElevenLabs' own daily re-read catches up if that ever fails.
// No imports, so the list logic can be tried on its own.

const CHANNEL_HANDLE = "@NewDigitalIntelligence-j5c";
export const CHANNEL_URL = `https://www.youtube.com/${CHANNEL_HANDLE}`;
const API = "https://www.googleapis.com/youtube/v3";
const MAX_AGE_MS = 60 * 60_000;

export const DEMO_CATEGORIES: [string, string][] = [
  ["FO", "Front Office Digital Assistants"],
  ["DO", "Document Assistants"],
  ["UO", "Unified Digital Outreach Assistants"],
  ["GP", "General Process Assistants"],
  ["DR", "Data and Research Analysts"],
  ["KT", "Knowledge, Training and Education Assistants"],
  ["PA", "Personal Assistants"],
  ["SD", "Software Development Lifecycle Assistants"],
];
/** Videos about NDI itself that are worth sharing. */
const COMPANY_VIDEOS = new Set(["NDI Teaser", "Building your AI factory with NDI", "Build your AI factory"]);
/** Videos about one client, investor material and older company videos: not demos to share. */
const LEAVE_OUT = /NSC|Atlas|Crowdcube|Podcast|Intro Video|^\d+\. \w+ \d{4}$/i;
/** The AI Employee's catalog code at the start of a title: "[FO-01] …", "GP 08 …", "[DO -04] …". */
const CODE = /^\[?\s*([A-Z]{2})\s*[- ]?\s*(\d{1,2})([a-z]?)\s*\]?\s*/;

export type Upload = { title: string; videoId: string; publishedAt: string };
export type DemoVideo = { prefix: string; code: string; name: string; url: string };
export type DemoList = { demos: DemoVideo[]; company: { title: string; url: string }[]; checkedAt: string };

const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** The newest video of each AI Employee, sorted by code, and the videos about NDI. */
export function toDemoList(uploads: Upload[]): Omit<DemoList, "checkedAt"> {
  const demos = new Map<string, DemoVideo>();
  const company: DemoList["company"] = [];
  for (const upload of [...uploads].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const title = upload.title.trim();
    if (LEAVE_OUT.test(title)) continue;
    if (COMPANY_VIDEOS.has(title)) {
      if (!company.some((video) => video.title === title)) company.push({ title, url: watchUrl(upload.videoId) });
      continue;
    }
    const match = title.match(CODE);
    if (!match) continue;
    let name = title.replace(CODE, "").replace(/[-_]V\d+$/, "");
    if (!name.includes(" ")) name = name.replace(/-/g, " "); // a title written like B2B-Sales-Outreach-Assistant
    name = name.replace("E mail", "E-mail").replace(/\s+demo(\s+English)?$/i, "").trim();
    const key = name.toLowerCase();
    if (demos.has(key)) continue; // an older video of the same AI Employee
    demos.set(key, {
      prefix: match[1],
      code: `${match[1]}-${match[2].padStart(2, "0")}${match[3]}`,
      name,
      url: watchUrl(upload.videoId),
    });
  }
  return { demos: [...demos.values()].sort((a, b) => a.code.localeCompare(b.code)), company };
}

export const demoVideosConfigured = () => Boolean(process.env.YOUTUBE_API_KEY);

async function youtube<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY ?? "" });
  const response = await fetch(`${API}/${path}?${query}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  // The message never includes the URL: it holds the key.
  if (!response.ok) throw new Error(`YouTube ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

type PlaylistPage = {
  nextPageToken?: string;
  items?: { snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }[];
};

// Kept on globalThis, so the page and the hourly check share one list in this server process.
const store = globalThis as typeof globalThis & {
  ndiDemoVideos?: { at: number; list: DemoList } | null;
  ndiDemoPlaylist?: string;
  ndiDemoSignature?: string;
};

/** Every public video on the channel (2 to 3 API units: one per 50 videos). */
async function channelUploads(): Promise<Upload[]> {
  if (!store.ndiDemoPlaylist) {
    const channel = await youtube<{ items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>("channels", {
      part: "contentDetails",
      forHandle: CHANNEL_HANDLE,
    });
    const playlist = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlist) throw new Error("YouTube channel not found");
    store.ndiDemoPlaylist = playlist;
  }
  const uploads: Upload[] = [];
  let pageToken = "";
  do {
    const page = await youtube<PlaylistPage>("playlistItems", {
      part: "snippet,status",
      playlistId: store.ndiDemoPlaylist,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.items ?? []) {
      const title = item.snippet?.title?.trim();
      const videoId = item.snippet?.resourceId?.videoId;
      if (title && videoId && item.status?.privacyStatus === "public") {
        uploads.push({ title, videoId, publishedAt: item.snippet?.publishedAt ?? "" });
      }
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken && uploads.length < 1000);
  return uploads;
}

/**
 * The demo list, at most `maxAgeMs` old (0 reads YouTube now). When YouTube cannot be read, the last list is
 * kept; null only when there has never been one (or no YOUTUBE_API_KEY).
 */
export async function getDemoVideos(maxAgeMs = MAX_AGE_MS): Promise<DemoList | null> {
  const saved = store.ndiDemoVideos;
  if (saved && Date.now() - saved.at < maxAgeMs) return saved.list;
  if (!demoVideosConfigured()) return null;
  try {
    const list = { ...toDemoList(await channelUploads()), checkedAt: new Date().toISOString() };
    store.ndiDemoVideos = { at: Date.now(), list };
    return list;
  } catch (error) {
    console.error("demo videos could not be read", error instanceof Error ? error.message : error);
    return saved?.list ?? null;
  }
}

/** Asks ElevenLabs to read a URL document again (here: /demos), so Clara's knowledge follows. */
async function refreshKnowledgeDocument(documentId: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${encodeURIComponent(documentId)}/refresh`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ElevenLabs refresh failed with ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

export type DemoCheck = { changed: boolean; refreshed: boolean; demos?: number; skipped?: string };

/**
 * The hourly check: reads YouTube now and, when the list differs from the last one, asks ElevenLabs to re-read
 * /demos (ELEVENLABS_DEMOS_DOCUMENT_ID). A failed refresh is tried again at the next check. The first check
 * after a start always refreshes once, which is harmless.
 */
export async function checkDemoVideos(): Promise<DemoCheck> {
  if (!demoVideosConfigured()) return { changed: false, refreshed: false, skipped: "YOUTUBE_API_KEY is not set" };
  const list = await getDemoVideos(0);
  if (!list) return { changed: false, refreshed: false, skipped: "YouTube could not be read" };
  const signature = JSON.stringify([list.demos.map((demo) => [demo.code, demo.name, demo.url]), list.company]);
  const changed = signature !== store.ndiDemoSignature;
  const documentId = process.env.ELEVENLABS_DEMOS_DOCUMENT_ID;
  if (!changed) return { changed, refreshed: false, demos: list.demos.length };
  if (!documentId) {
    store.ndiDemoSignature = signature;
    return { changed, refreshed: false, demos: list.demos.length, skipped: "ELEVENLABS_DEMOS_DOCUMENT_ID is not set" };
  }
  await refreshKnowledgeDocument(documentId);
  store.ndiDemoSignature = signature;
  return { changed, refreshed: true, demos: list.demos.length };
}
