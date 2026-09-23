import { checkRate } from "@/engine/guards";
import { createRefine, startShootout } from "@/engine/shootout";
import { clientIp, fail, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Feedback on one render → a new round on the same model with a rewritten prompt. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    checkRate(clientIp(req));
    const child = await createRefine({ parentId: id, entryId: body.entryId, feedback: body.feedback });
    startShootout(child.id);
    return json({ id: child.id }, 201);
  } catch (err) {
    return fail(err);
  }
}
