import { isStaffRequest } from "@/lib/aidaStaff";
import {
  advanceActiveLists,
  createList,
  MAX_CALLS_PER_LIST,
  normalisePhone,
  recentLists,
  type NewCall,
} from "@/lib/outboundCalls";
import { supabaseConfigured } from "@/lib/supabase";

const MAX_INSTRUCTIONS = 1_000;
const MAX_NAME = 80;
const MAX_TITLE = 80;

// Call lists on /admin. Staff only (Aida staff token).
//   GET  → the recent lists; also moves any running list forward, which is what keeps a list
//          going while the staff page is open (it asks every few seconds)
//   POST → a new list, whose first call starts at once
export async function GET(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return Response.json({ error: "The database is not configured" }, { status: 503 });
  try {
    await advanceActiveLists();
    return Response.json({ lists: await recentLists() });
  } catch (error) {
    console.error("call lists failed", error);
    return Response.json({ error: "Could not load the call lists" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseConfigured()) return Response.json({ error: "The database is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; createdBy?: unknown; calls?: unknown };
  const rows = Array.isArray(body.calls) ? body.calls : [];
  if (rows.length === 0) return Response.json({ error: "Add at least one number." }, { status: 400 });
  if (rows.length > MAX_CALLS_PER_LIST) {
    return Response.json({ error: `A list can hold up to ${MAX_CALLS_PER_LIST} numbers.` }, { status: 400 });
  }

  const calls: NewCall[] = [];
  const problems: string[] = [];
  rows.forEach((row: { phone?: unknown; name?: unknown; instructions?: unknown }, index) => {
    const phone = normalisePhone(typeof row?.phone === "string" ? row.phone : "");
    const instructions = typeof row?.instructions === "string" ? row.instructions.trim() : "";
    const name = typeof row?.name === "string" ? row.name.trim().slice(0, MAX_NAME) : "";
    if (!phone) problems.push(`Line ${index + 1}: the phone number is not valid (use +44…, or 07… for the UK).`);
    if (!instructions) problems.push(`Line ${index + 1}: tell Ellie what the call is about.`);
    if (phone && instructions) calls.push({ phone, name: name || null, instructions: instructions.slice(0, MAX_INSTRUCTIONS) });
  });
  if (problems.length) return Response.json({ error: problems.join(" ") }, { status: 400 });

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, MAX_TITLE) : null;
  const createdBy = typeof body.createdBy === "string" && body.createdBy.trim() ? body.createdBy.trim().slice(0, MAX_NAME) : null;
  try {
    const id = await createList({ title, createdBy, calls });
    return Response.json({ id, lists: await recentLists() });
  } catch (error) {
    console.error("call list could not start", error);
    return Response.json({ error: "Could not start the call list" }, { status: 502 });
  }
}
