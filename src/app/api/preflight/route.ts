import { guessCategory } from "@/engine/checklist";
import { contender, contendersFor, estimateCostUsd } from "@/engine/contenders";
import { proposeLineup } from "@/engine/lineup";
import { validateBrief } from "@/engine/shootout";
import { boardSnapshot } from "@/lib/boardView";
import { fail, json, readJson } from "@/lib/http";
import { livepeer } from "@/livepeer/client";
import type { MediaKind } from "@/engine/types";

export const dynamic = "force-dynamic";

/**
 * Before anything is spent: classify the brief, propose a lineup from the
 * Board, and attach each contender's live rate card and network SLA.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const kind: MediaKind = body.kind === "video" ? "video" : "image";
    const brief = validateBrief(body.brief);
    const category = guessCategory(brief, kind);
    const { rows } = await boardSnapshot();
    const lineup = proposeLineup({ rows, kind, category });

    const slas = await Promise.all(
      lineup.map((p) =>
        Promise.race([
          livepeer().describe(p.model).catch(() => undefined),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000)),
        ]),
      ),
    );

    const rowFor = (model: string) =>
      rows.find((r) => r.model === model && r.kind === kind && r.category === category) ??
      rows.find((r) => r.model === model && r.kind === kind && r.category === "all");

    return json({
      kind,
      category,
      lineup: lineup.map((p, i) => ({ ...p, sla: slas[i] ?? null })),
      contenders: contendersFor(kind).map((c) => ({ ...c, estimateUsd: estimateCostUsd(c), board: rowFor(c.id) ?? null })),
      estimateUsd: lineup.reduce((s, p) => s + estimateCostUsd(contender(p.model)!), 0),
    });
  } catch (err) {
    return fail(err);
  }
}
