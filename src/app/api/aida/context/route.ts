import { findRoomByLivekitName, roomCustomerId } from "@/lib/aida";
import { getCustomer, profileFor } from "@/lib/customers";
import { ticketFromRequest } from "@/lib/livekit";

// What we already know about the room's customer, from every channel, for the host employee to hand
// to Aida so her drafts can build on earlier conversations. Only when the customer joined signed in
// to their CDA account. Staff only: an employee ticket for this room.
export async function GET(request: Request) {
  const ticket = await ticketFromRequest(request);
  if (!ticket || ticket.role !== "employee") return Response.json({ error: "Unauthorized" }, { status: 401 });

  const room = await findRoomByLivekitName(ticket.roomName);
  const customerId = room ? await roomCustomerId(room.id) : null;
  const customer = customerId ? await getCustomer(customerId) : null;
  if (!customer) return Response.json({ known: false });

  const profile = await profileFor(customer);
  const lines = [
    "Background about the customer in this call, from earlier conversations with CDA on other channels.",
    "Use it to write better drafts. Do not read it out, and do not quote personal details from it.",
    `Name: ${profile.name ?? "not given"}. Known to CDA on: ${profile.channels.join(", ") || "the website"}.`,
    ...(profile.recent.length
      ? ["Their recent conversations, newest first:", ...profile.recent.map((note) => `- ${note}`)]
      : ["No earlier conversations are recorded."]),
  ];
  return Response.json({ known: true, name: profile.name, text: lines.join("\n") });
}
