// Facebook Messenger for the "New Digital Intelligence" Page (how it works: src/lib/metaChat.ts).
// The Page token never expires.

import type { MetaChannel } from "./metaChat";

export const messenger: MetaChannel = {
  channel: "messenger",
  label: "Messenger",
  table: "messenger_threads",
  prefix: "msgr|",
  webhookObject: "page",
  maxText: 2000,
  ownId: () => process.env.MESSENGER_PAGE_ID,
  inbound: () => ({ url: process.env.MESSENGER_CHANNEL_INBOUND_URL, secret: process.env.MESSENGER_CHANNEL_INBOUND_SECRET }),
  hasToken: () => Boolean(process.env.MESSENGER_PAGE_TOKEN),
  token: async () => process.env.MESSENGER_PAGE_TOKEN ?? "",
  api: "https://graph.facebook.com/v25.0",
  sendPath: () => "me/messages",
  messagingType: true,
  profileFields: "first_name,last_name",
  profileName: (profile) =>
    [profile.first_name, profile.last_name].filter((part) => typeof part === "string" && part).join(" ") || undefined,
  acceptsBareIds: false,
};
