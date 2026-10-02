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
              line.highlight ? "#e00000" : "#111111"
            }">${escapeHtml(line.speaker)}</td><td style="padding:6px 10px;color:#262626">${escapeHtml(line.text).replace(
              /\n/g,
              "<br>",
            )}</td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:6px 10px;color:#525252">No messages</td></tr>`;

  const extra = sections
    .map(
      (section) =>
        `<h3 style="margin:24px 0 8px;font-size:15px;color:#111111">${escapeHtml(section.heading)}</h3><ul style="margin:0;padding-left:18px;color:#262626">${section.lines
          .map((line) => `<li style="margin:4px 0">${escapeHtml(line)}</li>`)
          .join("")}</ul>`,
    )
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">
<div style="background:#ffffff;padding:12px 18px;border-bottom:4px solid #fe0100"><span style="color:#fe0100;font-family:'Arial Black',Arial,Helvetica,sans-serif;font-weight:900;font-size:28px;letter-spacing:-0.5px;line-height:1">NDI</span></div>
<div style="padding:18px">
<h2 style="margin:0 0 6px;font-size:18px;color:#111111">${escapeHtml(heading)}</h2>
<p style="margin:0 0 16px;color:#525252;font-size:14px">${escapeHtml(intro)}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px;background:#f5f5f5;border-radius:8px">${rows}</table>
${extra}
<p style="margin-top:24px;color:#999999;font-size:12px">${escapeHtml(footer)}</p>
</div></div>`;

  return { text, html };
}
