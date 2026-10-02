// Emails NDI staff when a customer is upset, so someone follows up while it still matters.
// Recipients: STAFF_ALERT_EMAIL (one address, or several separated by commas; the NDI mailbox itself
// works too). Without it nobody is emailed and the conversation simply waits on /admin → 😊 Mood.

import { appUrl } from "./appUrl";
import { mailConfigured, sendMail } from "./mailer";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CHANNEL_NAMES: Record<string, string> = {
  telegram: "Telegram",
  instagram: "Instagram",
  messenger: "Facebook Messenger",
  email: "Email",
  phone: "Phone",
  website: "Website",
  slack: "Slack",
  messaging: "Messaging app",
  hosted: "ElevenLabs page / QR code",
};

export function channelName(channel: string | null | undefined): string {
  return channel ? (CHANNEL_NAMES[channel] ?? channel) : "Unknown channel";
}

const isAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Every address in STAFF_ALERT_EMAIL, forgiving quotes and spaces around them. */
function listedAddresses(): string[] {
  return (process.env.STAFF_ALERT_EMAIL ?? "")
    .split(/[,;\s]+/)
    .map((address) => address.trim().replace(/^["'<]+|["'>]+$/g, "").toLowerCase())
    .filter(Boolean);
}

/**
 * The NDI mailbox itself is fine: the alert is sent from that mailbox, and the email channel ignores
 * mail from itself and anything marked Sent (src/lib/emailInbox.ts), so Clara never answers an alert.
 */
function recipients(): string[] {
  return listedAddresses().filter(isAddress);
}

export function moodAlertsConfigured(): boolean {
  return mailConfigured() && recipients().length > 0;
}

export type MoodAlertStatus =
  | { on: true; to: string[] }
  | { on: false; reason: "mail_not_configured" | "no_address" | "invalid_address" };

/** "jo***@example.com": enough for staff to recognise the address on the admin page. */
const masked = (address: string) => address.replace(/^(.{1,2})[^@]*@/, "$1***@");

/** Whether alerts can go out, and if not exactly why, for the admin page. */
export function moodAlertStatus(): MoodAlertStatus {
  const to = recipients();
  if (to.length && mailConfigured()) return { on: true, to: to.map(masked) };
  if (!mailConfigured()) return { on: false, reason: "mail_not_configured" };
  const listed = listedAddresses();
  if (!listed.length) return { on: false, reason: "no_address" };
  return { on: false, reason: "invalid_address" };
}

function adminLink(): string | null {
  const base = appUrl();
  return base ? `${base}/admin/mood` : null;
}

/** NDI's home time (Zug, Cologne, Milan, Paris), in the British date format. */
const NDI_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

type Alert =
  | {
      kind: "conversation";
      channel: string | null;
      customerName: string | null;
      when: Date;
      label: string;
      score: number;
      frustration: number;
      lowPoint: string | null;
      title: string | null;
      summary: string | null;
      followUp: boolean;
    }
  | {
      kind: "email";
      fromName: string | null;
      fromEmail: string | null;
      subject: string | null;
      when: Date;
      frustration: number;
      reason: string;
    };

/** True when at least one staff member was emailed. */
export async function sendMoodAlert(alert: Alert): Promise<boolean> {
  const to = recipients();
  if (!to.length || !mailConfigured()) return false;

  const rows: [string, string][] =
    alert.kind === "conversation"
      ? [
          ["Customer", alert.customerName ?? "Not identified"],
          ["Channel", channelName(alert.channel)],
          ["When", `${NDI_TIME.format(alert.when)} (Central European time)`],
          ["Mood", `${alert.label}, sentiment ${alert.score.toFixed(1)}, frustration ${Math.round(alert.frustration * 100)}%`],
          ...(alert.followUp ? ([["Follow-up", "Clara told the customer that the NDI team will get back to them"]] as [string, string][]) : []),
          ...(alert.lowPoint ? ([["Where it turned", `“${alert.lowPoint}”`]] as [string, string][]) : []),
          ...(alert.summary ? ([["Summary", alert.summary]] as [string, string][]) : []),
        ]
      : [
          ["From", alert.fromName ? `${alert.fromName} <${alert.fromEmail ?? ""}>` : alert.fromEmail ?? "Unknown sender"],
          ["Subject", alert.subject || "(no subject)"],
          ["When", `${NDI_TIME.format(alert.when)} (Central European time)`],
          ["Mood", `upset, frustration ${Math.round(alert.frustration * 100)}%${alert.reason ? ` (${alert.reason})` : ""}`],
          ["What Clara did", "She did not reply. Her answer is waiting as a Gmail draft labelled “Clara/Upset customer” for you to check."],
        ];

  const heading =
    alert.kind === "email"
      ? "An upset customer emailed NDI"
      : alert.followUp && alert.frustration < 0.6
        ? "A customer is waiting for a follow-up"
        : "A customer was upset talking to Clara";
  const subject =
    alert.kind === "email"
      ? `[NDI assistant] Upset customer email: ${alert.subject || "(no subject)"}`
      : `[NDI assistant] ${heading} (${channelName(alert.channel)})`;
  const link = adminLink();

  const text = [heading, "", ...rows.map(([name, value]) => `${name}: ${value}`), "", link ? `Open the Mood page: ${link}` : ""]
    .join("\n")
    .trim();
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#262626;border-top:4px solid #fe0100;padding-top:12px">
<h2 style="margin:0 0 12px;font-size:18px;color:#111111">${escapeHtml(heading)}</h2>
<table style="border-collapse:collapse;font-size:14px;width:100%">${rows
    .map(
      ([name, value]) =>
        `<tr><td style="padding:6px 10px;color:#525252;vertical-align:top;white-space:nowrap">${escapeHtml(name)}</td><td style="padding:6px 10px">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>
${link ? `<p style="margin-top:18px"><a href="${escapeHtml(link)}" style="color:#e00000">Open the Mood page</a></p>` : ""}
<p style="margin-top:18px;color:#999999;font-size:12px">Sent by NDI's assistant Clara. Mood scores come from ElevenLabs and Claude.</p>
</div>`;

  await sendMail({ to: to.join(", "), subject, text, html });
  return true;
}
