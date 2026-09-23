import Link from "next/link";
import { Composer } from "@/components/Composer";
import { GradeBadge } from "@/components/GradeBadge";
import { ProofThumb } from "@/components/ProofThumb";
import { contender } from "@/engine/contenders";
import { boardSnapshot } from "@/lib/boardView";
import { money, secs } from "@/lib/format";
import { store } from "@/store";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const [all, snap] = await Promise.all([store().list(), boardSnapshot()]);
  const recent = all.filter((s) => s.round === 1 && s.status === "done" && s.winnerId).slice(0, 8);
  const leaders = (kind: "image" | "video") => snap.rows.filter((r) => r.kind === kind && r.category === "all").slice(0, 5);

  return (
    <>
      <section className="wrap pt-12 sm:pt-16 pb-10">
        <div className="max-w-3xl">
          <h1 className="text-[2.1rem] sm:text-5xl leading-[1.05]">Which model should render this shot?</h1>
          <p className="mt-5 text-lg text-soft max-w-2xl leading-relaxed">
            Describe it once. Three models render it on the Livepeer network, a blind judge grades each render against your brief,
            and you get the winner with the evidence: what it got right, what it missed, what it cost.
          </p>
        </div>
        <div className="mt-8">
          <Composer />
        </div>
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
