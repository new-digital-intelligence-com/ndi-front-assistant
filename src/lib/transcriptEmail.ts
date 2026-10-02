// One email layout for every conversation we send out: Aida rooms and the website's chat, voice
// and avatar. Plain text plus a simple HTML version.

export type TranscriptLine = { speaker: string; text: string; highlight?: boolean };

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatDate(iso: string | number | Date) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
}

export function transcriptEmail(options: {
  heading: string;
  intro: string;
  lines: TranscriptLine[];
  /** Extra blocks only some readers get, for example Aida's drafts for staff. */
  sections?: { heading: string; lines: string[] }[];
}): { text: string; html: string } {
  const { heading, intro, lines, sections = [] } = options;
  const footer = "NDI - New Digital Intelligence · new-digital-intelligence.com · mail@new-digital-intelligence.com";

  const text = [
    heading,
    intro,
    "",
    ...(lines.length ? lines.map((line) => `${line.speaker}: ${line.text}`) : ["(No messages)"]),
    ...sections.flatMap((section) => ["", section.heading, ...section.lines.map((line) => `- ${line}`)]),
    "",
    footer,
  ].join("\n");

  const rows = lines.length
    ? lines
        .map(
          (line) =>
            `<tr><td style="padding:6px 10px;vertical-align:top;white-space:nowrap;font-weight:600;color:${
              line.highlight ? "#1190cb" : "#0f172a"
            }">${escapeHtml(line.speaker)}</td><td style="padding:6px 10px;color:#1e293b">${escapeHtml(line.text).replace(
              /\n/g,
              "<br>",
            )}</td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:6px 10px;color:#475569">No messages</td></tr>`;

  const extra = sections
    .map(
      (section) =>
        `<h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">${escapeHtml(section.heading)}</h3><ul style="margin:0;padding-left:18px;color:#1e293b">${section.lines
          .map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`)
          .join("")}</ul>`,
    )
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">
<div style="background:#002a6c;padding:14px 18px;border-bottom:4px solid #1190cb"><span style="background:#ffffff;color:#002a6c;font-weight:800;padding:4px 8px;border-radius:4px;letter-spacing:1px">NDI</span></div>
<div style="padding:18px">
<h2 style="margin:0 0 6px;font-size:18px;color:#0f172a">${escapeHtml(heading)}</h2>
<p style="margin:0 0 16px;color:#475569;font-size:14px">${escapeHtml(intro)}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px;background:#eef4fb;border-radius:8px">${rows}</table>
${extra}
<p style="margin-top:24px;color:#999999;font-size:12px">${escapeHtml(footer)}</p>
</div></div>`;

  return { text, html };
}
