import Link from "next/link";
import { notFound } from "next/navigation";
import { GradeBadge } from "@/components/GradeBadge";
import { ProofThumb } from "@/components/ProofThumb";
import { contender, estimateCostUsd } from "@/engine/contenders";
import { boardSnapshot } from "@/lib/boardView";
import { cap, money, pct, secs } from "@/lib/format";
import { store } from "@/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = contender((await params).id);
  return { title: `${c?.label ?? "Model"} · Vouch Studio` };
}

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const c = contender((await params).id);
  if (!c) notFound();
  const [snap, all] = await Promise.all([boardSnapshot(), store().list()]);
  const rows = snap.rows.filter((r) => r.model === c.id);
  const overall = rows.find((r) => r.category === "all");
  const byCat = rows.filter((r) => r.category !== "all");
  const renders = all
    .flatMap((s) => s.entries.filter((e) => e.model === c.id && e.outputUrl && e.score).map((e) => ({ s, e })))
    .slice(0, 12);

  return (
    <div className="wrap pt-12 pb-10">
      <p className="text-sm text-soft"><Link href={`/board?kind=${c.kind}`} className="hover:text-gold">The Board</Link> / {cap(c.kind)} models</p>
      <div className="mt-3 flex flex-wrap items-center gap-5">
        {overall && <GradeBadge grade={overall.grade} size="lg" />}
        <div>
          <h1 className="text-3xl sm:text-4xl">{c.label}</h1>
          <p className="text-soft mt-1">{c.vendor}. {c.blurb}</p>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 num">
        {[
          ["Vouch score", overall ? overall.meanScore.toFixed(1) : "—"],
          ["Matches brief", overall ? overall.meanFidelity.toFixed(0) : "—"],
          ["Cost per usable", overall ? money(overall.costPerUsable) : money(estimateCostUsd(c))],
          ["p50 time", overall ? secs(overall.p50Ms) : "—"],
          ["Win rate", overall?.shootouts ? `${pct(overall.winRate)} of ${overall.shootouts}` : "—"],
          ["Livepeer capability", c.id],
        ].map(([k, v]) => (
          <div key={k} className="panel p-4">
            <dt className="label">{k}</dt>
            <dd className="text-lg font-bold mt-1 break-all">{v}</dd>
          </div>
        ))}
      </dl>

      {byCat.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl mb-3">By kind of shot</h2>
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>Brief type</th><th>Grade</th><th className="r">Score</th><th className="r">Matches brief</th><th className="r">Cost per usable</th><th className="r">Renders</th></tr></thead>
              <tbody>
                {byCat.map((r) => (
                  <tr key={r.category}>
                    <td><Link href={`/board?kind=${c.kind}&category=${r.category}`} className="font-semibold hover:text-gold">{cap(r.category)}</Link></td>
                    <td><GradeBadge grade={r.grade} size="sm" /></td>
                    <td className="r font-bold">{r.meanScore.toFixed(1)}</td>
                    <td className="r">{r.meanFidelity.toFixed(0)}</td>
                    <td className="r">{money(r.costPerUsable)}</td>
                    <td className="r">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl mb-4">Its renders</h2>
        {renders.length === 0 ? (
          <p className="text-soft">No graded renders yet. <Link href="/" className="text-gold font-semibold hover:underline">Put it in a shootout.</Link></p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {renders.map(({ s, e }) => (
              <ProofThumb key={`${s.id}-${e.id}`} href={`/s/${s.id}`} url={e.outputUrl} kind={s.kind} grade={e.score?.grade} total={e.score?.total}
                caption={s.brief} sub={s.winnerId === e.id && s.entries.length > 1 ? "Won this shootout" : undefined} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
