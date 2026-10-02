import { messenger } from "@/lib/messenger";
import { metaWebhookRoute } from "@/lib/metaChat";

// The Meta app's Messenger webhook (Callback URL): /api/messenger/webhook?token=<MESSENGER_WEBHOOK_SECRET>.
const route = metaWebhookRoute(messenger, "MESSENGER_WEBHOOK_SECRET");

export const GET = route.GET;
export const POST = route.POST;
