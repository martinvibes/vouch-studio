import Link from "next/link";
import { GradeBadge } from "@/components/GradeBadge";
import { categoriesFor } from "@/engine/checklist";
import { contender } from "@/engine/contenders";
import { boardSnapshot } from "@/lib/boardView";
import { cap, money, pct, secs } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "The Board · Vouch Studio" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ kind?: string; category?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "video" ? "video" : "image";
  const cats = categoriesFor(kind);
  const category = sp.category && (cats as readonly string[]).includes(sp.category) ? sp.category : "all";
  const snap = await boardSnapshot();
  const rows = snap.rows.filter((r) => r.kind === kind && r.category === category);
  const href = (k: string, c: string) => `/board?kind=${k}${c !== "all" ? `&category=${c}` : ""}`;

  return (
    <div className="wrap pt-12 pb-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] items-end">
        <div className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl">The Board</h1>
          <p className="mt-4 text-lg text-soft leading-relaxed">
            Every model ranked by renders Vouch paid for on Livepeer and graded blind. Filter by the kind of shot you need.
          </p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 num">
          <Stat k="Shootouts" v={String(snap.totals.shootouts)} />
          <Stat k="Graded renders" v={String(snap.totals.renders)} />
          <Stat k="Spent on Livepeer" v={money(snap.totals.spendUsd)} />
          <Stat k="Judge agrees with people" v={snap.agreement.picks ? `${pct(snap.agreement.rate)} of ${snap.agreement.picks}` : "No picks yet"} />
        </dl>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Media type">
          {(["image", "video"] as const).map((k) => (
            <Link key={k} href={href(k, "all")} aria-pressed={kind === k} className="seg-link">{cap(k)}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["all", ...cats].map((c) => (
            <Link key={c} href={href(kind, c)} className={`chip ${c === category ? "!bg-[var(--ink)] !text-[var(--bg)] !border-[var(--ink)]" : ""}`}>
              {c === "all" ? "All briefs" : cap(c)}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 panel overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-8 text-soft">
            Nothing graded here yet. <Link href="/" className="text-gold font-semibold hover:underline">Run a {kind} shootout</Link> and this row fills in.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Model</th><th>Grade</th><th className="r">Vouch score</th><th className="r">Quality</th><th className="r">Matches brief</th>
                <th className="r">Cost per usable</th><th className="r">p50 time</th><th className="r">Win rate</th><th className="r">Seals</th><th className="r">Success</th><th className="r">Renders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model}>
                  <td className="text-mute">{i + 1}</td>
                  <td>
                    <Link href={`/models/${r.model}`} className="font-semibold hover:text-gold">{contender(r.model)?.label ?? r.model}</Link>
                    <span className="block text-xs text-mute">{contender(r.model)?.vendor}</span>
                  </td>
                  <td><GradeBadge grade={r.grade} size="sm" /></td>
                  <td className="r font-bold">{r.meanScore.toFixed(1)}</td>
                  <td className="r">{r.meanQuality.toFixed(1)}</td>
                  <td className="r">{r.meanFidelity.toFixed(0)}</td>
                  <td className="r">{money(r.costPerUsable)}</td>
                  <td className="r">{secs(r.p50Ms)}</td>
                  <td className="r">{r.shootouts ? `${pct(r.winRate)} of ${r.shootouts}` : "—"}</td>
                  <td className="r">{r.seals}</td>
                  <td className="r">{pct(r.successRate)}</td>
                  <td className="r">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-4 text-sm text-mute max-w-3xl">
        Vouch score blends quality (70%), value (20%) and speed (10%). Win rate counts head-to-head shootouts only. <Link href="/methodology" className="underline underline-offset-4 hover:text-ink">How it&apos;s judged</Link>
      </p>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{v}</dd>
    </div>
  );
}
