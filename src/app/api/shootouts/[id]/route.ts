import { json } from "@/lib/http";
import { shootoutView } from "@/lib/shootoutView";

export const dynamic = "force-dynamic";

/** One shootout plus its refine chain (root first) and child rounds. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await shootoutView(id);
  return view ? json(view) : json({ error: "Shootout not found." }, 404);
}
