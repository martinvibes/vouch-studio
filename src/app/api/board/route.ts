import { boardSnapshot } from "@/lib/boardView";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The Board as data: per-model aggregates, overall ("all") and per category. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const category = url.searchParams.get("category");
  const snap = await boardSnapshot();
  const rows = snap.rows.filter((r) => (!kind || r.kind === kind) && (!category || r.category === category));
  return json({ ...snap, rows });
}
