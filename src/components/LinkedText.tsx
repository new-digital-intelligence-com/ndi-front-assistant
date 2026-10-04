"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { linkSegments, youtubeIds } from "@/lib/richText";

// Text from Clara, Aida, staff or customers, with every address clickable (opening in a new tab) and a
// preview card under it for each YouTube video it links to, the way YouTube shows a video: its picture,
// a play button and its title. Used wherever the website shows a conversation (src/lib/richText.ts).
// Everything it renders is inline, so it can sit inside a <p>.

export function LinkedText({ text, previews = true }: { text: string; previews?: boolean }) {
  const segments = useMemo(() => linkSegments(text), [text]);
  const videos = useMemo(() => (previews ? youtubeIds(text) : []), [text, previews]);
  return (
    <>
      {segments.map((piece, index) =>
        piece.href ? (
          <a key={index} href={piece.href} target="_blank" rel="noopener noreferrer" className="break-words underline underline-offset-2">
            {piece.text}
          </a>
        ) : (
          <Fragment key={index}>{piece.text}</Fragment>
        ),
      )}
      {videos.map((id) => (
        <YouTubeCard key={id} id={id} />
      ))}
    </>
  );
}

/** Video titles known on this page, and the one request per video that finds them (YouTube's oEmbed, free). */
const titles = new Map<string, string>();
const requests = new Map<string, Promise<string | null>>();

function videoTitle(id: string): Promise<string | null> {
  let request = requests.get(id);
  if (!request) {
    const watch = `https://www.youtube.com/watch?v=${id}`;
    request = fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`)
      .then((response) => (response.ok ? (response.json() as Promise<{ title?: string }>) : null))
      .then((body) => {
        if (body?.title) titles.set(id, body.title);
        return body?.title ?? null;
      })
      .catch(() => null);
    requests.set(id, request);
  }
  return request;
}

/** A YouTube video as a card: its picture with a play button, and its title. */
export function YouTubeCard({ id }: { id: string }) {
  const [title, setTitle] = useState<string | null>(() => titles.get(id) ?? null);
  useEffect(() => {
    if (titles.has(id)) return;
    let alive = true;
    void videoTitle(id).then((found) => {
      if (alive && found) setTitle(found);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <a
      href={`https://www.youtube.com/watch?v=${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block w-full max-w-xs overflow-hidden rounded-xl bg-white text-left text-heading no-underline shadow-sm ring-1 ring-black/10 transition hover:ring-black/30"
    >
      <span className="relative block aspect-video bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail, any size */}
        <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-9 w-12 items-center justify-center rounded-xl bg-[#ff0000] shadow-md">
            <svg viewBox="0 0 24 24" className="ms-0.5 h-5 w-5 fill-white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </span>
      <span className="block px-3 py-2 text-xs font-semibold leading-snug">{title ?? "Watch on YouTube"}</span>
    </a>
  );
}
