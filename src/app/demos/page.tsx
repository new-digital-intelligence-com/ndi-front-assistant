import type { Metadata } from "next";
import { connection } from "next/server";
import { COMPANY_VIDEOS, NDI_YOUTUBE_CHANNEL, getAiEmployees } from "@/lib/aiEmployees";

// NDI's public demo videos, from NDI's AI Employees API (src/lib/aiEmployees.ts) plus the videos about NDI. Clara's
// and Aida's knowledge reads this page (an ElevenLabs URL document, always in their context), so it is short plain
// text with every link written out in full. No password (see src/proxy.ts) and nothing secret: names and links only.

export const metadata: Metadata = {
  title: "Demo videos – NDI Assistant",
  description: "Demo videos of NDI's AI Employees on NDI's YouTube channel.",
  robots: { index: false, follow: false },
};

const UPDATED = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" });

export default async function DemosPage() {
  await connection(); // read at request time, never frozen at build time
  const list = await getAiEmployees();
  const withVideo = list?.employees.filter((employee) => employee.videoUrl) ?? [];
  const comingSoon = list?.employees.filter((employee) => employee.demoComingSoon && !employee.videoUrl) ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 bg-white px-6 py-8 text-ink">
      <h1 className="text-2xl font-bold text-heading">NDI (New Digital Intelligence) – Public Demo Videos</h1>
      <p className="mt-2 text-sm text-muted">
        Demo videos of NDI AI Employees on NDI&apos;s YouTube channel ({NDI_YOUTUBE_CHANNEL}). Each line gives the AI
        Employee&apos;s code and name and the link to watch the demo. An AI Employee that is not listed here has no public
        demo video yet; for a live demo, people can book a call with the NDI team.
      </p>

      <section>
        <h2 className="mt-6 text-lg font-semibold text-heading">Videos about NDI</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {COMPANY_VIDEOS.map((video) => (
            <li key={video.url}>
              {video.title}: {video.url}
            </li>
          ))}
        </ul>
      </section>

      {list ? (
        <>
          {list.categories.map((category) => {
            const demos = withVideo.filter((employee) => employee.code.startsWith(`${category.prefix}-`));
            if (!demos.length) return null;
            return (
              <section key={category.prefix}>
                <h2 className="mt-6 text-lg font-semibold text-heading">{category.name}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {demos.map((employee) => (
                    <li key={employee.code}>
                      {employee.code} {employee.name} – demo video: {employee.videoUrl}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {comingSoon.length > 0 && (
            <section>
              <h2 className="mt-6 text-lg font-semibold text-heading">Demo coming soon (no video yet)</h2>
              <p className="mt-1 text-sm text-muted">Never promise a demo, a date or a finished product for these.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {comingSoon.map((employee) => (
                  <li key={employee.code}>
                    {employee.code} {employee.name}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-8 text-xs text-muted">
            {withVideo.length} AI Employee demo videos. List read from NDI&apos;s AI Employee catalogue on{" "}
            {UPDATED.format(new Date(list.checkedAt))} (UTC).
          </p>
        </>
      ) : (
        <p className="mt-6 text-sm">NDI&apos;s demo videos are on NDI&apos;s YouTube channel: {NDI_YOUTUBE_CHANNEL}</p>
      )}
    </main>
  );
}
