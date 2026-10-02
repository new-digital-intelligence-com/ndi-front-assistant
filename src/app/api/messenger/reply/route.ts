import { messenger } from "@/lib/messenger";
import { metaReplyRoute } from "@/lib/metaChat";

// Reply Webhook URL of Clara's "CDA Messenger" Custom Channel trigger.
export const POST = metaReplyRoute(messenger, "MESSENGER_CHANNEL_SIGNING_SECRET");
