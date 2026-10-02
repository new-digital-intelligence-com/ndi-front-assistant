import { instagram } from "@/lib/instagram";
import { metaReplyRoute } from "@/lib/metaChat";

// Reply Webhook URL of Ellie's Instagram Custom Channel trigger.
export const POST = metaReplyRoute(instagram, "INSTAGRAM_CHANNEL_SIGNING_SECRET");
