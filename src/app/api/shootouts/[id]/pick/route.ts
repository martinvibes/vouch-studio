import { pickEntry } from "@/engine/shootout";
import { fail, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    const s = await pickEntry(id, body.entryId);
    return json({ id: s.id, userPickId: s.userPickId, winnerId: s.winnerId });
  } catch (err) {
    return fail(err);
  }
}
