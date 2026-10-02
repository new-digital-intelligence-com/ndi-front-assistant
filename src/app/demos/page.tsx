import type { Metadata } from "next";
import { connection } from "next/server";
import { CHANNEL_URL, DEMO_CATEGORIES, getDemoVideos } from "@/lib/demoVideos";

// NDI's public demo videos, read from YouTube (src/lib/demoVideos.ts). Clara's knowledge base reads this page (an
// ElevenLabs URL document), so it is plain text with every link written out in full. No password (see
// src/proxy.ts) and nothing secret: only public video titles and links.

export const metadata: Metadata = {
  title: "Demo videos – NDI Assistant",
  description: "Demo videos of NDI's AI Employees on NDI's YouTube channel.",
  robots: { index: false, follow: false },
};

const UPDATED = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });

export default async function DemosPage() {
  await connection(); // read at request time, never frozen at build time
  const list = await getDemoVideos();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 bg-white px-6 py-8 text-ink">
      <h1 className="text-2xl font-bold text-heading">NDI (New Digital Intelligence) – Public Demo Videos</h1>
      <p className="mt-2 text-sm text-muted">
        Demo videos of NDI AI Employees published on NDI&apos;s YouTube channel ({CHANNEL_URL}). Each line gives the AI
        Employee&apos;s code and name as in the video title, and the link to watch the demo. An AI Employee that is not
        listed here has no public demo video yet; for a live demo, people can book a call with the NDI team.
      </p>

      {list ? (
        <>
          {list.company.length > 0 && (
            <section>
              <h2 className="mt-6 text-lg font-semibold text-heading">Videos about NDI</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {list.company.map((video) => (
                  <li key={video.url}>
                    {video.title}: {video.url}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {DEMO_CATEGORIES.map(([prefix, category]) => {
            const demos = list.demos.filter((demo) => demo.prefix === prefix);
            if (!demos.length) return null;
            return (
              <section key={prefix}>
                <h2 className="mt-6 text-lg font-semibold text-heading">{category}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {demos.map((demo) => (
                    <li key={demo.url}>
                      {demo.code} {demo.name} – demo video: {demo.url}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="mt-8 text-xs text-muted">
            {list.demos.length} AI Employee demo videos. List read from YouTube on {UPDATED.format(new Date(list.checkedAt))} (UTC).
          </p>
        </>
      ) : (
        <p className="mt-6 text-sm">NDI&apos;s demo videos are on NDI&apos;s YouTube channel: {CHANNEL_URL}</p>
      )}
    </main>
  );
}
