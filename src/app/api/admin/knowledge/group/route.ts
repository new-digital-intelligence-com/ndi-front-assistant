import { isStaffRequest } from "@/lib/aidaStaff";
import { groupGaps, knowledgeState } from "@/lib/knowledge";

// Claude Haiku groups the open questions that ask the same thing and suggests wording for staff to
// check. Nothing is stored: the groups live on the staff page until someone approves or dismisses.
export async function POST(request: Request) {
  if (!(await isStaffRequest(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { gaps } = await knowledgeState();
    return Response.json({ groups: await groupGaps(gaps) });
  } catch (error) {
    console.error("knowledge grouping failed", error);
    return Response.json({ error: "Claude could not group the questions just now" }, { status: 502 });
  }
}
