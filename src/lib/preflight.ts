import { guessCategory } from "@/engine/checklist";
import { contender, contendersFor, estimateCostUsd } from "@/engine/contenders";
import { proposeLineup } from "@/engine/lineup";
import { validateBrief } from "@/engine/shootout";
import type { MediaKind } from "@/engine/types";
import { livepeer } from "@/livepeer/client";
import { boardSnapshot } from "./boardView";

/**
 * Before anything is spent: classify the brief, propose a lineup from the
 * Board, and attach each contender's live rate card and network SLA.
 */
export async function planLineup(briefIn: unknown, kindIn: unknown) {
  const kind: MediaKind = kindIn === "video" ? "video" : "image";
  const brief = validateBrief(briefIn);
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

  return {
    kind,
    brief,
    category,
    lineup: lineup.map((p, i) => ({ ...p, sla: slas[i] ?? null })),
    contenders: contendersFor(kind).map((c) => ({ ...c, estimateUsd: estimateCostUsd(c), board: rowFor(c.id) ?? null })),
    estimateUsd: lineup.reduce((s, p) => s + estimateCostUsd(contender(p.model)!), 0),
  };
}
