"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Contender } from "@/engine/contenders";
import type { BoardRow } from "@/engine/board";
import type { LineupPick } from "@/engine/lineup";
import type { CapabilitySla } from "@/livepeer/client";
import { EXAMPLES } from "@/lib/examples";
import { cap, money, pct, secs } from "@/lib/format";
import { GradeBadge } from "./GradeBadge";

type Kind = "image" | "video";
type Plan = {
  kind: Kind;
  category: string;
  lineup: (LineupPick & { sla: CapabilitySla | null })[];
  contenders: (Contender & { estimateUsd: number; board: BoardRow | null })[];
};

const ROLE: Record<string, string> = { top: "Best on the Board", value: "Best value", challenger: "Challenger", default: "Starter pick" };

export function Composer() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("image");
  const [brief, setBrief] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"plan" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function planShootout(nextBrief = brief, nextKind = kind) {
    setError(null);
    setBusy("plan");
    try {
      const res = await fetch("/api/preflight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief: nextBrief, kind: nextKind }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not plan the shootout.");
      setPlan(data);
      setModels(data.lineup.map((p: LineupPick) => p.model));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setError(null);
    setBusy("run");
    try {
      const res = await fetch("/api/shootouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief, kind, models }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the shootout.");
      router.push(`/s/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  function switchKind(k: Kind) {
    if (k === kind) return;
    setKind(k);
    setPlan(null);
    setModels([]);
  }

  const byId = new Map(plan?.contenders.map((c) => [c.id, c]));
  const estimate = models.reduce((s, m) => s + (byId.get(m)?.estimateUsd ?? 0), 0);
  const examples = EXAMPLES.filter((e) => e.kind === kind);

  return (
    <div>
      <form
        className="panel p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          planShootout();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <label htmlFor="brief" className="font-semibold">Describe the shot</label>
          <div className="seg" role="group" aria-label="Media type">
            {(["image", "video"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => switchKind(k)}>{cap(k)}</button>
            ))}
          </div>
        </div>
        <textarea
          id="brief"
          className="field min-h-28 text-[1.05rem] leading-relaxed"
          placeholder={kind === "image" ? 'e.g. A hand-painted sign reading "FRESH BAGELS" above exactly four sesame bagels' : "e.g. Slow push-in on latte art forming in a white cup"}
          value={brief}
          maxLength={600}
          onChange={(e) => setBrief(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-mute mr-1">Try</span>
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="chip"
              onClick={() => {
                setBrief(ex.brief);
                planShootout(ex.brief, kind);
              }}
            >
              {ex.label}
            </button>
          ))}
          <button type="submit" className="btn btn-ghost btn-sm ml-auto" disabled={busy !== null || brief.trim().length < 8}>
            {busy === "plan" ? "Planning…" : plan ? "Re-plan lineup" : "Plan the lineup"}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="mt-4 text-[var(--grade-f)] font-medium">{error}</p>}

      {plan && (
        <section className="mt-6" aria-label="Proposed lineup">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-lg">The lineup</h2>
            <p className="text-sm text-soft">
              Read as a <strong className="text-ink">{plan.category}</strong> brief. Swap any contender before you run it.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {models.map((m, i) => {
              const pick = plan.lineup[i];
              const c = byId.get(m);
              const sla = pick && pick.model === m ? pick.sla : null;
              return (
                <div key={i} className="panel p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gold">{pick && pick.model === m ? ROLE[pick.role] : "Your pick"}</span>
                    {c?.board && <GradeBadge grade={c.board.grade} size="sm" />}
                  </div>
                  <select
                    className="field py-2 font-semibold"
                    aria-label={`Contender ${i + 1}`}
                    value={m}
                    onChange={(e) => setModels(models.map((x, j) => (j === i ? e.target.value : x)))}
                  >
                    {plan.contenders.map((o) => (
                      <option key={o.id} value={o.id} disabled={o.id !== m && models.includes(o.id)}>
                        {o.label} ({money(o.estimateUsd)})
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-soft leading-snug min-h-[2.6em]">
                    {pick && pick.model === m ? pick.reason : c?.blurb}
                  </p>
                  <dl className="grid grid-cols-3 gap-2 text-sm num border-t border-line pt-3">
                    <div><dt className="label">Price</dt><dd className="font-semibold">{money(c?.estimateUsd)}</dd></div>
                    <div><dt className="label">Network p50</dt><dd className="font-semibold">{secs(sla?.p50Ms ?? c?.board?.p50Ms)}</dd></div>
                    <div><dt className="label">Success</dt><dd className="font-semibold">{sla?.successRate !== undefined ? pct(sla.successRate) : c?.board ? pct(c.board.successRate) : "—"}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" className="btn btn-primary" onClick={run} disabled={busy !== null || brief.trim().length < 8}>
              {busy === "run" ? "Starting…" : `Run the shootout · ${money(estimate)}`}
            </button>
            <p className="text-sm text-soft max-w-md">
              Each model renders on Livepeer, then a vision model grades every render blind against a checklist written from your brief.
              {kind === "video" ? " Video takes one to five minutes." : " Takes about 30 seconds."}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
