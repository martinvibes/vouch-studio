import { fail, json, readJson } from "@/lib/http";
import { planLineup } from "@/lib/preflight";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    return json(await planLineup(body.brief, body.kind));
  } catch (err) {
    return fail(err);
  }
}
