import { signedInCustomerId } from "./account";
import { isStaffRequest } from "./aidaStaff";
import { getCustomer, type Customer } from "./customers";
import type { AidaRole } from "./livekit";

/**
 * Who is asking, in an Aida route. Staff are decided by the Aida staff token only. A customer may
 * also be signed in to their CDA account on the website (same browser): then we know their name,
 * so they are not asked for it, and Aida can use what we remember about them.
 */
export async function whoIsAsking(request: Request): Promise<{ role: AidaRole; account: Customer | null }> {
  if (await isStaffRequest(request)) return { role: "employee", account: null };
  try {
    const customerId = await signedInCustomerId();
    return { role: "customer", account: customerId ? await getCustomer(customerId) : null };
  } catch {
    return { role: "customer", account: null };
  }
}
