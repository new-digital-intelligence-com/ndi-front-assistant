// LiveKit carries the voice and the messages of Aida rooms. This file only mints and checks the
// tickets (LiveKit access tokens); the rooms themselves are created by LiveKit on first join.
//
// The role is written into the ticket by our server. LiveKit does not let a participant change its
// own attributes unless the ticket allows it, and ours never does, so everyone else in the room can
// trust `participant.attributes.role`.

import { AccessToken, RoomServiceClient, TokenVerifier, TrackSource } from "livekit-server-sdk";

export type AidaRole = "employee" | "customer";

export type RoomTicket = {
  url: string;
  token: string;
  identity: string;
  name: string;
  role: AidaRole;
};

export type TicketClaims = { identity: string; name: string; role: AidaRole; roomName: string };

const TICKET_TTL = "4h";

function config() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set");
  }
  return { url, apiKey, apiSecret };
}

export function livekitConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

export async function roomTicket(roomName: string, name: string, role: AidaRole): Promise<RoomTicket> {
  const { url, apiKey, apiSecret } = config();
  const identity = `${role}-${crypto.randomUUID().slice(0, 8)}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: TICKET_TTL,
    attributes: { role },
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublishData: true,
    // Voice only: the microphone is the one thing anyone may publish.
    canPublishSources: [TrackSource.MICROPHONE],
    canUpdateOwnMetadata: false,
  });
  return { url, token: await token.toJwt(), identity, name, role };
}

/** Checks a ticket the browser sends back to our own routes, and says who and where it is for. */
export async function verifyTicket(token: string | null | undefined): Promise<TicketClaims | null> {
  if (!token || !livekitConfigured()) return null;
  const { apiKey, apiSecret } = config();
  try {
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(token);
    const role = claims.attributes?.role;
    const roomName = claims.video?.room;
    if (!claims.sub || !roomName || (role !== "employee" && role !== "customer")) return null;
    return { identity: claims.sub, name: claims.name ?? "", role, roomName };
  } catch {
    return null;
  }
}

/** The ticket arrives as `Authorization: Bearer <ticket>` on our Aida routes. */
export async function ticketFromRequest(request: Request): Promise<TicketClaims | null> {
  const header = request.headers.get("authorization") ?? "";
  return verifyTicket(header.startsWith("Bearer ") ? header.slice(7) : null);
}

/** Ends a room for everyone in it. LiveKit's API lives on https, the same host as the wss URL. */
export async function deleteLivekitRoom(roomName: string) {
  const { url, apiKey, apiSecret } = config();
  const host = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    await new RoomServiceClient(host, apiKey, apiSecret).deleteRoom(roomName);
  } catch (error) {
    // The room may simply have emptied out already; closing it in our records is what matters.
    console.error("Could not delete the LiveKit room", roomName, error);
  }
}
