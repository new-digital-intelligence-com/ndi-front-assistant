import { signedInCustomerId } from "./account";
import { customerForChannel, customerStoreConfigured, rememberConversation } from "./customers";
import { visitorId } from "./visitor";

/**
 * Ties a website conversation (chat, voice or the avatar) to whoever is using the browser, so
 * Ellie recognises them the same way she does on Telegram or email.
 *
 * It runs when the session is created rather than through a dynamic variable: a variable that only
 * exists on the website would make the agent's tool call fail on every other channel.
 */
/**
 * `include_conversation_id=true` does not add a field to the response: it puts the id in the
 * signed URL's query string, so read it from there.
 */
export function conversationIdFromSignedUrl(signedUrl: string): string | null {
  try {
    return new URL(signedUrl).searchParams.get("conversation_id");
  } catch {
    return null;
  }
}

export async function registerWebsiteConversation(conversationId: string | undefined | null) {
  if (!conversationId || !customerStoreConfigured()) return;

  try {
    // A signed-in account wins, so chat on this browser joins the same person as their other
    // channels. Otherwise the browser cookie is the identity, which at least remembers a returning
    // visitor on this device.
    const accountId = await signedInCustomerId();
    const customerId =
      accountId ?? (await customerForChannel({ channel: "website", key: await visitorId() }, false)).id;

    await rememberConversation(conversationId, customerId, "website");
  } catch (error) {
    // Never block a conversation from starting because the memory could not be written.
    console.error("Could not register the website conversation", error);
  }
}
