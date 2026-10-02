import { whoIsAsking } from "@/lib/aidaAccess";
import { accountEmail } from "@/lib/customers";

// Tells a page whether this browser is signed in to a CDA account: a known customer is not asked for
// their name in Aida, and "Email me this conversation" can go straight to their own address. It only
// ever answers about the person asking, from their own cookie. Used by the main site too.
export async function GET(request: Request) {
  const { account } = await whoIsAsking(request);
  if (!account) return Response.json({ signedIn: false });
  const email = await accountEmail(account.id).catch(() => null);
  return Response.json({ signedIn: true, name: account.name, email });
}
