// Instagram direct messages for @new_digital_intelligence (how it works: src/lib/metaChat.ts).
//
// Meta's Instagram tokens last at most 60 days. The current token is kept in Supabase
// (channel_tokens) and the daily cron refreshes it every 7 days, so it never runs out.
// INSTAGRAM_ACCESS_TOKEN is only the starting token, used until the first refresh.

import type { MetaChannel } from "./metaChat";
import { supabaseRest as rest } from "./supabase";

const API = "https://graph.instagram.com/v25.0";
const REFRESH_EVERY_MS = 7 * 86_400_000;

type StoredToken = { token: string; refreshed_at: string; expires_at: string | null };

let cached: { token: string; at: number } | null = null;

async function storedToken(): Promise<StoredToken | null> {
  const rows = await rest<StoredToken[]>("channel_tokens?channel=eq.instagram&select=token,refreshed_at,expires_at&limit=1");
  return rows[0] ?? null;
}

async function instagramToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.token;
  const stored = await storedToken().catch(() => null);
  const token = stored?.token ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  cached = { token, at: Date.now() };
  return token;
}

export const instagram: MetaChannel = {
  channel: "instagram",
  label: "Instagram",
  table: "instagram_threads",
  prefix: "ig|",
  webhookObject: "instagram",
  maxText: 1000,
  ownId: () => process.env.INSTAGRAM_USER_ID,
  inbound: () => ({ url: process.env.INSTAGRAM_CHANNEL_INBOUND_URL, secret: process.env.INSTAGRAM_CHANNEL_INBOUND_SECRET }),
  hasToken: () => Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
  token: instagramToken,
  api: API,
  sendPath: () => `${process.env.INSTAGRAM_USER_ID}/messages`,
  messagingType: false,
  profileFields: "name,username",
  profileName: (profile) =>
    (typeof profile.name === "string" && profile.name) || (typeof profile.username === "string" && profile.username) || undefined,
  acceptsBareIds: true,
};

/**
 * Called by the daily cron. A refreshed token is valid for another 60 days; Meta only refreshes a
 * token that is at least 24 hours old and not yet expired.
 */
export async function refreshInstagramToken(): Promise<{ refreshed: boolean; expiresAt?: string | null; reason?: string }> {
  const stored = await storedToken();
  if (stored && Date.now() - new Date(stored.refreshed_at).getTime() < REFRESH_EVERY_MS) {
    return { refreshed: false, expiresAt: stored.expires_at, reason: "refreshed less than 7 days ago" };
  }
  const current = stored?.token ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!current) return { refreshed: false, reason: "no token" };

  const response = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`,
    { cache: "no-store", signal: AbortSignal.timeout(15_000) },
  );
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!response.ok || !body.access_token) {
    throw new Error(`Instagram token refresh failed with ${response.status}: ${body.error?.message ?? ""}`);
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (body.expires_in ?? 60 * 86_400) * 1000).toISOString();
  await rest("channel_tokens?on_conflict=channel", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({ channel: "instagram", token: body.access_token, refreshed_at: now.toISOString(), expires_at: expiresAt }),
  });
  cached = null;
  return { refreshed: true, expiresAt };
}
