import { accountsConfigured, signIn, signUp, signedInCustomerId, signOut } from "@/lib/account";
import { createLinkCode, linkPhone, listChannels, normaliseEmail, removeChannel } from "@/lib/customers";
import { hasValidSession } from "@/lib/session";

// The customer account behind the demo site: sign up, sign in, and the linked channels.
// The site password still guards this route, so only people inside the demo can reach it.

type Body = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The channels linked to whoever is signed in. */
export async function GET() {
  if (!(await hasValidSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!accountsConfigured()) return Response.json({ error: "Accounts are not configured" }, { status: 503 });

  const customerId = await signedInCustomerId();
  if (!customerId) return Response.json({ signedIn: false });

  return Response.json({ signedIn: true, channels: await listChannels(customerId) });
}

export async function POST(request: Request) {
  if (!(await hasValidSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!accountsConfigured()) return Response.json({ error: "Accounts are not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const action = text(body.action);

  if (action === "signout") {
    await signOut();
    return Response.json({ ok: true });
  }

  if (action === "code") {
    const customerId = await signedInCustomerId();
    if (!customerId) return Response.json({ error: "Please sign in first" }, { status: 401 });
    return Response.json(await createLinkCode(customerId));
  }

  // Their own phone number: Ellie then knows them when they call CDA, and when CDA calls them.
  if (action === "phone") {
    const customerId = await signedInCustomerId();
    if (!customerId) return Response.json({ error: "Please sign in first" }, { status: 401 });
    const result = await linkPhone(customerId, text(body.phone));
    if (!result.ok) {
      const error =
        result.reason === "invalid" ? "Please enter a valid phone number" : "This number is already linked to another CDA account";
      return Response.json({ error }, { status: result.reason === "invalid" ? 400 : 409 });
    }
    return Response.json({ ok: true });
  }

  if (action === "signup" || action === "signin") {
    const email = normaliseEmail(body.email);
    const password = text(body.password);
    if (!email) return Response.json({ error: "Please enter a valid email address" }, { status: 400 });
    if (password.length < 8) {
      return Response.json({ error: "Please use a password of at least 8 characters" }, { status: 400 });
    }

    const name = text(body.name) || undefined;
    const result = action === "signup" ? await signUp(email, password, name) : await signIn(email, password);
    if (!result.ok) return Response.json({ error: result.message }, { status: 400 });

    return Response.json({ ok: true, name: result.customer.name });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

/** Unlink one channel. */
export async function DELETE(request: Request) {
  if (!(await hasValidSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const customerId = await signedInCustomerId();
  if (!customerId) return Response.json({ error: "Please sign in first" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const channel = text(body.channel);
  const channelKey = text(body.channel_key);
  if (!channel || !channelKey) return Response.json({ error: "Missing channel" }, { status: 400 });

  await removeChannel(customerId, channel, channelKey);
  return Response.json({ ok: true });
}
