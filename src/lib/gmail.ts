// The CDA mailbox through the Gmail API, signed in once with Google OAuth (scope gmail.modify):
// read new inbox mail, send or draft replies in the customer's thread, and put Ellie's labels on
// the customer's email. Server side only; the refresh token is as good as the mailbox password.

import type { GmailMessage } from "./emailParse";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

/** The mailbox's own address: mail from it is never answered. */
export function mailboxAddress(): string | null {
  return process.env.gmail_sender?.trim().toLowerCase() || null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  // invalid_grant means the sign-in was revoked or expired: run the Google consent again.
  if (!body.access_token) throw new GmailError(response.status, `Google sign-in failed: ${body.error ?? response.status}`);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function gmail<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GMAIL}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new GmailError(response.status, `Gmail ${path.split("?")[0]} failed with ${response.status}: ${detail}`);
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

// --- watching the inbox ------------------------------------------------------------------------

/** Asks Gmail to post to our Pub/Sub topic when the inbox changes. Lasts 7 days; renewed daily. */
export async function watchInbox(): Promise<{ historyId: string; expiration: string }> {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topicName) throw new Error("GMAIL_PUBSUB_TOPIC must be set");
  return gmail("watch", {
    method: "POST",
    body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "include" }),
  });
}

/** Messages that arrived in the inbox since `startHistoryId`, and where the mailbox is now. */
export async function inboxArrivalsSince(startHistoryId: string): Promise<{ ids: string[]; historyId: string }> {
  const ids = new Set<string>();
  let historyId = startHistoryId;
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", labelId: "INBOX" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await gmail<{
      history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[];
      historyId: string;
      nextPageToken?: string;
    }>(`history?${query}`);
    for (const change of page.history ?? []) {
      for (const { message } of change.messagesAdded ?? []) {
        if (message.labelIds?.includes("INBOX")) ids.add(message.id);
      }
    }
    historyId = page.historyId;
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { ids: [...ids], historyId };
}

export async function getMessage(id: string): Promise<GmailMessage | null> {
  try {
    return await gmail<GmailMessage>(`messages/${encodeURIComponent(id)}?format=full`);
  } catch (error) {
    // Deleted before we got to it.
    if (error instanceof GmailError && error.status === 404) return null;
    throw error;
  }
}

/** Every message of a thread, oldest first, including the ones the mailbox sent. */
export async function getThread(id: string): Promise<GmailMessage[]> {
  try {
    const thread = await gmail<{ messages?: GmailMessage[] }>(`threads/${encodeURIComponent(id)}?format=full`);
    return thread.messages ?? [];
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) return [];
    throw error;
  }
}

/**
 * False once a draft is gone: sent, or deleted by staff. Gmail keeps answering for a sent draft's
 * id, with the sent message behind it, so the DRAFT label is what tells a waiting draft apart.
 */
export async function draftExists(id: string): Promise<boolean> {
  try {
    const draft = await gmail<{ message?: { labelIds?: string[] } }>(`drafts/${encodeURIComponent(id)}?format=minimal`);
    return draft.message?.labelIds?.includes("DRAFT") ?? false;
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) return false;
    throw error;
  }
}

// --- replying ----------------------------------------------------------------------------------

export async function sendRaw(raw: string, threadId: string): Promise<string> {
  const sent = await gmail<{ id: string }>("messages/send", { method: "POST", body: JSON.stringify({ raw, threadId }) });
  return sent.id;
}

/** A draft in the customer's thread: staff open the email in Gmail, check it and press Send. */
export async function createDraft(raw: string, threadId: string): Promise<string> {
  const draft = await gmail<{ id: string }>("drafts", { method: "POST", body: JSON.stringify({ message: { raw, threadId } }) });
  return draft.id;
}

// --- Ellie's labels ----------------------------------------------------------------------------

export type Outcome = "replied" | "draft" | "skipped" | "failed";

/** Shown in Gmail's side bar under "Ellie", so staff see at a glance what happened to each email. */
const LABELS: Record<Outcome, { name: string; color: { backgroundColor: string; textColor: string } }> = {
  replied: { name: "Ellie/Replied", color: { backgroundColor: "#16a766", textColor: "#ffffff" } },
  draft: { name: "Ellie/Draft ready", color: { backgroundColor: "#ffad47", textColor: "#ffffff" } },
  skipped: { name: "Ellie/Skipped", color: { backgroundColor: "#cccccc", textColor: "#000000" } },
  failed: { name: "Ellie/Failed", color: { backgroundColor: "#fb4c2f", textColor: "#ffffff" } },
};

/** Put next to the outcome on an email whose writer was upset (😊 Mood); labelOutcome never removes it. */
const UPSET_LABEL = { name: "Ellie/Upset customer", color: { backgroundColor: "#cc3a21", textColor: "#ffffff" } };
const ALL_LABELS = [...Object.values(LABELS), UPSET_LABEL];

let labelIds: Map<string, string> | null = null;

async function createLabel(name: string, color?: { backgroundColor: string; textColor: string }) {
  const body = { name, labelListVisibility: "labelShow", messageListVisibility: "show" };
  try {
    return await gmail<{ id: string; name: string }>("labels", { method: "POST", body: JSON.stringify({ ...body, color }) });
  } catch (error) {
    // 409: another request created it a moment ago. 400: a colour Gmail does not accept.
    if (error instanceof GmailError && error.status === 400 && color) return createLabel(name);
    if (error instanceof GmailError && error.status === 409) return null;
    throw error;
  }
}

async function ellieLabelIds(): Promise<Map<string, string>> {
  const wanted = ["Ellie", ...ALL_LABELS.map((label) => label.name)];
  if (labelIds && wanted.every((name) => labelIds?.has(name))) return labelIds;

  const load = async () => {
    const { labels } = await gmail<{ labels: { id: string; name: string }[] }>("labels");
    return new Map(labels.map((label) => [label.name, label.id]));
  };
  let found = await load();
  const missing = wanted.filter((name) => !found.has(name));
  if (missing.length) {
    // The parent first, so Gmail nests the others under it.
    for (const name of missing) {
      await createLabel(name, ALL_LABELS.find((label) => label.name === name)?.color);
    }
    found = await load();
  }
  labelIds = found;
  return found;
}

/**
 * Puts the outcome label on the customer's email and takes any other Ellie label off it (a reply
 * that failed and then worked should not stay "Failed"). A sent reply also marks the email read;
 * a draft leaves it unread so staff notice it.
 */
export async function labelOutcome(gmailId: string, outcome: Outcome) {
  const ids = await ellieLabelIds();
  const add = [ids.get(LABELS[outcome].name)].filter((id): id is string => Boolean(id));
  const remove = (Object.keys(LABELS) as Outcome[])
    .filter((other) => other !== outcome)
    .map((other) => ids.get(LABELS[other].name))
    .filter((id): id is string => Boolean(id));
  if (outcome === "replied") remove.push("UNREAD");
  await gmail(`messages/${encodeURIComponent(gmailId)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

/** Marks the email "Ellie/Upset customer", on top of its outcome label. */
export async function labelUpset(gmailId: string) {
  const id = (await ellieLabelIds()).get(UPSET_LABEL.name);
  if (!id) return;
  await gmail(`messages/${encodeURIComponent(gmailId)}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [id], removeLabelIds: [] }),
  });
}
