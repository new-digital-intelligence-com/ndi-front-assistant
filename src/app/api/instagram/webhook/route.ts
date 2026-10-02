import { instagram } from "@/lib/instagram";
import { metaWebhookRoute } from "@/lib/metaChat";

// The Meta app's Instagram webhook (Callback URL): /api/instagram/webhook?token=<INSTAGRAM_WEBHOOK_SECRET>.
const route = metaWebhookRoute(instagram, "INSTAGRAM_WEBHOOK_SECRET");

export const GET = route.GET;
export const POST = route.POST;
