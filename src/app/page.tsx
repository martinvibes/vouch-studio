import Link from "next/link";
import { Composer } from "@/components/Composer";
import { GradeBadge } from "@/components/GradeBadge";
import { HeroReel, type Reel } from "@/components/HeroReel";
import { ProofThumb } from "@/components/ProofThumb";
import { contender } from "@/engine/contenders";
import { boardSnapshot } from "@/lib/boardView";
import { money, secs } from "@/lib/format";
import { store } from "@/store";
import type { Shootout } from "@/engine/types";

// Real image shootouts for the hero replay, the ones where the grades differ most first.
function reelsFrom(all: Shootout[]): Reel[] {
  const spread = (s: Shootout) => {
    const t = s.entries.map((e) => e.score?.total ?? 0);
    return Math.max(...t) - Math.min(...t);
  };
  return all
    .filter((s) => s.kind === "image" && s.round === 1 && s.status === "done" && s.entries.length === 3
      && s.entries.every((e) => e.status === "done" && e.score && e.judge && e.outputUrl?.startsWith("/")))
    .sort((a, b) => spread(b) - spread(a))
    .slice(0, 4)
    .map((s) => ({
      id: s.id,
      brief: s.brief,
      winner: Math.max(0, s.entries.findIndex((e) => e.id === s.winnerId)),
      entries: s.entries.map((e) => ({
        url: e.outputUrl!,
        label: contender(e.model)?.label ?? e.model,
        grade: e.score!.grade,
        total: e.score!.total,
        ticks: e.judge!.checks.map((c) => c.verdict),
        cost: money(e.renderCostUsd),
      })),
    }));
}

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const [all, snap] = await Promise.all([store().list(), boardSnapshot()]);
  const recent = all.filter((s) => s.round === 1 && s.status === "done" && s.winnerId).slice(0, 8);
  const reels = reelsFrom(all);
  const leaders = (kind: "image" | "video") => snap.rows.filter((r) => r.kind === kind && r.category === "all").slice(0, 5);

  return (
    <>
      <section className="wrap pt-10 sm:pt-14 pb-6 grid gap-x-14 gap-y-10 lg:grid-cols-[1fr_1.15fr] items-start">
        <h1 className="hero-title lg:col-span-2">
            <span className="l1">
              {"Three models enter.".split(" ").map((w, n) => (
                <span key={n}><span className="w" style={{ ["--w" as string]: n }}>{w}</span>{n < 2 ? " " : ""}</span>
              ))}
            </span>
            <span className="l2">One gets vouched.</span>
        </h1>
        <div className="lg:pt-6">
          <p className="text-lg text-soft max-w-[34rem] leading-relaxed">
            Describe any shot. Vouch Studio renders it on three AI models across the Livepeer network, grades every render blind
            against your brief, and tells you which one to trust. You see what each got right, what it missed and what it cost.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#run" className="btn btn-primary">Run a shootout</a>
            <Link href="/board" className="btn btn-ghost">See which models win</Link>
          </div>
          {snap.totals.renders > 0 && (
            <p className="mt-6 text-sm text-mute">
              Built from {snap.totals.renders} graded renders across {snap.totals.models} models, every one run on Livepeer.
            </p>
          )}
        </div>
        <HeroReel reels={reels} />
      </section>

      <section id="run" className="wrap pt-10 pb-10 scroll-mt-24" aria-label="Run a shootout">
        <Composer />
      </section>

      {recent.length > 0 && (
        <section className="wrap py-10" aria-labelledby="recent">
          <div className="flex items-baseline justify-between mb-5">
            <h2 id="recent" className="text-xl">Recent verdicts</h2>
            <Link href="/board" className="text-sm font-semibold text-gold hover:underline underline-offset-4">See the Board</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {recent.map((s) => {
              const w = s.entries.find((e) => e.id === s.winnerId)!;
              return (
                <ProofThumb key={s.id} href={`/s/${s.id}`} url={w.outputUrl} kind={s.kind} grade={w.score?.grade} total={w.score?.total}
                  caption={s.brief} sub={`${contender(w.model)?.label ?? w.model} won against ${s.entries.length - 1}`} />
              );
            })}
          </div>
        </section>
      )}

      {snap.rows.length > 0 && (
        <section className="wrap py-10 grid gap-8 md:grid-cols-2" aria-label="Board leaders">
          {(["image", "video"] as const).map((k) => (
            <div key={k}>
              <h2 className="text-xl mb-4">{k === "image" ? "Best image models" : "Best video models"}</h2>
              <ol className="panel divide-y divide-[var(--line)]">
                {leaders(k).length === 0 && <li className="p-4 text-soft text-sm">No graded {k} renders yet. Run the first shootout.</li>}
                {leaders(k).map((r, i) => (
                  <li key={r.model}>
                    <Link href={`/models/${r.model}`} className="flex items-center gap-3 p-3 hover:bg-[color-mix(in_srgb,var(--gold)_6%,transparent)]">
                      <span className="w-5 text-mute num text-sm">{i + 1}</span>
                      <GradeBadge grade={r.grade} size="sm" />
                      <span className="font-semibold flex-1 truncate">{contender(r.model)?.label ?? r.model}</span>
                      <span className="text-sm text-soft num hidden sm:inline">{money(r.costPerUsable)} · {secs(r.p50Ms)}</span>
                      <span className="font-semibold num w-12 text-right">{r.meanScore.toFixed(1)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
