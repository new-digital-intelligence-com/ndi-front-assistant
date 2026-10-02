// The email channel's pure helpers: reading a Gmail message, deciding whether a person wrote it,
// and building Ellie's reply. No network and no imports, so they can be tried on real messages
// on their own.

export type GmailHeader = { name: string; value: string };

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
};

export type IncomingEmail = {
  gmailId: string;
  threadId: string;
  labelIds: string[];
  receivedAt: Date;
  fromEmail: string | null;
  fromName: string | null;
  /** Where a reply goes: the Reply-To address if there is one, otherwise the sender. */
  replyTo: string | null;
  subject: string;
  /** The RFC 822 Message-ID, so the reply lands in the same thread in every mail program. */
  messageId: string | null;
  references: string | null;
  text: string;
  attachments: string[];
  /** Lower-case header name -> first value. */
  headers: Map<string, string>;
};

/** Ellie is handed at most this much of an email; long threads quote everything before them. */
export const MAX_EMAIL_TEXT = 6000;

// --- reading a message -------------------------------------------------------------------------

function decodeBase64Url(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, "base64url"));
}

function decodeBytes(bytes: Uint8Array, charset: string | undefined): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Headers can carry non-English text as `=?UTF-8?B?...?=` or `=?ISO-8859-1?Q?...?=`. */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, encoding: string, text: string) => {
      const bytes =
        encoding.toUpperCase() === "B"
          ? Uint8Array.from(Buffer.from(text, "base64"))
          : Uint8Array.from(
              text
                .replace(/_/g, " ")
                .replace(/=([0-9A-Fa-f]{2})|([\s\S])/g, (_m: string, hex: string, char: string) =>
                  hex ? String.fromCharCode(parseInt(hex, 16)) : char,
                ),
              (char) => char.charCodeAt(0),
            );
      return decodeBytes(bytes, charset);
    });
}

function charsetOf(part: GmailPart): string | undefined {
  const contentType = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "";
  return contentType.match(/charset="?([^";\s]+)"?/i)?.[1];
}

/** `"Jane Doe" <jane@example.com>`, `Jane <jane@x.com>`, `jane@x.com` or `jane@x.com (Jane)`. */
export function parseAddress(value: string | undefined): { email: string | null; name: string | null } {
  if (!value) return { email: null, name: null };
  const decoded = decodeEncodedWords(value).trim();
  const angle = decoded.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  const bare = decoded.match(/([^\s<>"(),;:]+@[^\s<>"(),;:]+)/);
  const email = (angle?.[2] ?? bare?.[1] ?? "").trim().toLowerCase() || null;
  let name = angle ? angle[1] : (decoded.match(/\(([^)]+)\)/)?.[1] ?? "");
  name = name.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\\"/g, '"').trim();
  return { email, name: name && name.toLowerCase() !== email ? name : null };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectParts(part: GmailPart, found: { plain: string[]; html: string[]; attachments: string[] }) {
  const type = (part.mimeType ?? "").toLowerCase();
  if (part.filename) {
    found.attachments.push(part.filename);
  } else if (type === "text/plain" && part.body?.data) {
    found.plain.push(decodeBytes(decodeBase64Url(part.body.data), charsetOf(part)));
  } else if (type === "text/html" && part.body?.data) {
    found.html.push(decodeBytes(decodeBase64Url(part.body.data), charsetOf(part)));
  }
  for (const child of part.parts ?? []) collectParts(child, found);
}

export function parseGmailMessage(message: GmailMessage): IncomingEmail {
  const payload = message.payload ?? {};
  const headers = new Map<string, string>();
  for (const { name, value } of payload.headers ?? []) {
    const key = name.toLowerCase();
    if (!headers.has(key)) headers.set(key, value);
  }

  const found = { plain: [] as string[], html: [] as string[], attachments: [] as string[] };
  collectParts(payload, found);
  const text = (found.plain.length ? found.plain.join("\n\n") : htmlToText(found.html.join("\n\n")))
    .replace(/\r\n/g, "\n")
    .trim();

  const from = parseAddress(headers.get("from"));
  const replyTo = parseAddress(headers.get("reply-to")).email;

  return {
    gmailId: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds ?? [],
    receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    fromEmail: from.email,
    fromName: from.name,
    replyTo: replyTo ?? from.email,
    subject: decodeEncodedWords(headers.get("subject") ?? "").trim(),
    messageId: headers.get("message-id")?.trim() ?? null,
    references: headers.get("references")?.trim() ?? null,
    text,
    attachments: found.attachments,
    headers,
  };
}

// --- was it written by a person? ---------------------------------------------------------------

/** Anywhere in the address before the @: no-reply, noreply, do-not-reply, ... */
const NO_REPLY = /no[-_.]?reply|do[-_.]?not[-_.]?reply/i;
/** The whole mailbox name, optionally followed by -something: robots, not people. */
const ROBOT_MAILBOX =
  /^(mailer[-_.]?daemon|postmaster|bounces?|notifications?|notify|alerts?|security|verify|verification|newsletters?)([-_.+].*)?$/i;
/** Senders that only ever send notifications and codes. */
const ROBOT_DOMAINS = ["facebookmail.com", "mail.instagram.com", "accounts.google.com"];
const ROBOT_SUBJECT =
  /\b(verification|security|confirmation|login|sign[- ]in|one[- ]time) code\b|\bOTP\b|new sign[- ]in|sign[- ]in attempt|delivery status notification|undeliverable|mail delivery failed|out of office|automatic reply|auto[- ]?reply/i;
/** An address that only robots send from: no-reply mailboxes and notification services. */
export function isRobotAddress(address: string): boolean {
  const [mailbox, domain = ""] = address.toLowerCase().split("@");
  return (
    NO_REPLY.test(mailbox) ||
    ROBOT_MAILBOX.test(mailbox) ||
    ROBOT_DOMAINS.some((robot) => domain === robot || domain.endsWith(`.${robot}`))
  );
}

const GMAIL_CATEGORIES: Record<string, string> = {
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_FORUMS: "Forums",
};

/**
 * Why an email should not get a reply, or null when it looks like a person wrote it. These are
 * cheap rules that run before Ellie is involved; she makes the final call on anything they let
 * through (see the "Email only" rule in her prompt).
 */
export function automatedReason(email: IncomingEmail, ownAddress: string | null): string | null {
  if (!email.fromEmail) return "no sender address";
  if (ownAddress && email.fromEmail === ownAddress.toLowerCase()) return "sent by this mailbox";
  if (email.labelIds.includes("SPAM") || email.labelIds.includes("TRASH")) return "spam";

  // Most specific first, so the reason staff see says what the email actually was.
  const [mailbox, domain = ""] = email.fromEmail.split("@");
  if (NO_REPLY.test(mailbox) || ROBOT_MAILBOX.test(mailbox)) return "sent from a no-reply address";
  if (ROBOT_DOMAINS.some((robot) => domain === robot || domain.endsWith(`.${robot}`))) return "notification service";
  if (ROBOT_SUBJECT.test(email.subject)) return "code, alert or automatic reply";
  for (const label of email.labelIds) {
    if (GMAIL_CATEGORIES[label]) return `Gmail filed it under ${GMAIL_CATEGORIES[label]}`;
  }

  const header = (name: string) => email.headers.get(name)?.trim().toLowerCase();
  const autoSubmitted = header("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return "automatic email";
  if (["bulk", "list", "junk", "auto_reply"].includes(header("precedence") ?? "")) return "bulk email";
  if (email.headers.has("list-unsubscribe") || email.headers.has("list-id")) return "newsletter or mailing list";
  if (email.headers.has("x-autoreply") || email.headers.has("x-autorespond")) return "automatic reply";
  if (header("return-path") === "<>") return "bounce";
  if ((header("content-type") ?? "").startsWith("multipart/report")) return "delivery report";
  return null;
}

// --- what Ellie is given, and what comes back ---------------------------------------------------

/** The marker Ellie's prompt looks for: it tells her this message is an email. */
export const EMAIL_MARKER = "[Email to CDA customer care]";

export function textForEllie(email: IncomingEmail): string {
  const sender = email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail;
  const body = email.text.length > MAX_EMAIL_TEXT
    ? `${email.text.slice(0, MAX_EMAIL_TEXT)}\n[... the rest of the email was cut]`
    : email.text || "(The email has no text.)";
  const attachments = email.attachments.length
    ? `\n\n[Attached: ${email.attachments.join(", ")}. You cannot open attachments.]`
    : "";
  return `${EMAIL_MARKER}\nFrom: ${sender}\nSubject: ${email.subject || "(no subject)"}\n\n${body}${attachments}`;
}

/** Ellie's answer when an email was not written by someone who wants help from CDA. */
export function isSkip(reply: string): boolean {
  return /^\W*skip\W*$/i.test(reply.trim());
}

/**
 * Ellie is handed the email under a small header ([Email to CDA customer care], From, Subject) and
 * sometimes copies that header to the top of her answer. The customer should only see the answer.
 */
function withoutEchoedHeader(reply: string): string {
  const lines = reply.split("\n");
  let skip = 0;
  while (skip < lines.length && (lines[skip].trim() === EMAIL_MARKER || /^(from|to|subject|date)\s*:/i.test(lines[skip].trim()))) {
    skip++;
  }
  return skip ? lines.slice(skip).join("\n") : reply;
}

/** Email is plain text: take out any markdown that slipped through, and any copied header. */
export function plainReply(reply: string): string {
  return withoutEchoedHeader(reply.replace(/\r\n/g, "\n").trim())
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*•]\s+/gm, "$1- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- the reply itself ----------------------------------------------------------------------------

export function replySubject(subject: string): string {
  if (!subject) return "Re: your email to CDA";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

/** A header value in plain ASCII, or as UTF-8 encoded words of at most 75 characters each. */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const char of value) {
    if (Buffer.byteLength(chunk + char) > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word).toString("base64")}?=`).join("\r\n ");
}

/**
 * The raw message Gmail sends or keeps as a draft, base64url encoded. In-Reply-To and References
 * put it in the customer's thread everywhere, not only in Gmail. Replies sent without a person
 * checking them say so in Auto-Submitted, so other robots (out-of-office replies) don't answer
 * and start a loop.
 */
export function buildReply(reply: {
  from: string;
  to: string;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
  text: string;
  automatic: boolean;
}): string {
  const references = [reply.references, reply.inReplyTo].filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
  const body = Buffer.from(reply.text.replace(/\r?\n/g, "\r\n"))
    .toString("base64")
    .replace(/.{76}/g, "$&\r\n");
  const lines = [
    `From: ${reply.from}`,
    `To: ${reply.to}`,
    `Subject: ${encodeHeader(reply.subject)}`,
    ...(reply.inReplyTo ? [`In-Reply-To: ${reply.inReplyTo}`] : []),
    ...(references.length ? [`References: ${references.join("\r\n ")}`] : []),
    ...(reply.automatic ? ["Auto-Submitted: auto-replied"] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}
