"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SEAL_THRESHOLD } from "@/engine/score";
import type { Entry, Requirement, Shootout } from "@/engine/types";
import { gradeClass, gradeColor, money, secs } from "@/lib/format";
import type { RoundSummary, ShootoutView } from "@/lib/shootoutView";
import { Media } from "./Media";
import { Seal } from "./Seal";

type Labels = Record<string, { label: string; vendor: string }>;

const LIVE = new Set(["queued", "planning", "running"]);

export function Arena({ initial, labels }: { initial: ShootoutView; labels: Labels }) {
  const [view, setView] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const s = view.shootout;
  const live = LIVE.has(s.status);
  // Entries already graded on first paint don't replay the stamp animation.
  const seen = useRef(new Set(initial.shootout.entries.filter((e) => e.score).map((e) => e.id)));

  const childLive = view.children.some((c) => c.status && LIVE.has(c.status));
  useEffect(() => {
    if (!live && !childLive) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/shootouts/${s.id}`, { cache: "no-store" });
        if (res.ok) setView(await res.json());
      } catch {}
    }, 2500);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [live, childLive, s.id]);

  const winner = s.entries.find((e) => e.id === s.winnerId);
  const landed = s.entries.filter((e) => e.outputUrl || e.status === "failed").length;
  const spend = s.entries.reduce((sum, e) => sum + (e.renderCostUsd ?? 0) + (e.judge?.costUsd ?? 0), 0);
  const parent = view.chain.at(-1);
  const parentBest = parent?.entries.find((e) => e.id === s.parentEntryId);

  return (
    <div className="wrap pt-8 pb-10">
      {(view.chain.length > 0 || view.children.length > 0) && <RoundTrail view={view} labels={labels} />}

      <header className="grid gap-6 lg:grid-cols-[1fr_auto] items-start">
        <div className="max-w-3xl">
          <p className="text-sm text-soft mb-3">
            {s.round > 1 ? `Round ${s.round}, refining ${labels[s.entries[0]?.model]?.label ?? "a render"}` : `${s.kind === "video" ? "Video" : "Image"} shootout`}, {s.category} brief
          </p>
          <h1 className="text-2xl sm:text-[2.1rem] leading-[1.15] font-semibold" style={{ fontWeight: 600 }}>“{s.brief}”</h1>
          {s.feedback && (
            <p className="mt-3 text-soft">
              Feedback for this round: <span className="text-ink font-medium">“{s.feedback}”</span>
            </p>
          )}
          <StatusLine s={s} landed={landed} winnerLabel={winner ? labels[winner.model]?.label : undefined} />
        </div>
        {winner?.score && winner.score.total >= SEAL_THRESHOLD && s.entries.length > 1 && (
          <div className="flex items-center gap-4 lg:flex-col lg:items-center">
            <Seal id={s.id} grade={winner.score.grade} score={winner.score.total} size={150} animate={!seen.current.has(winner.id)} />
            <p className="text-sm text-soft lg:text-center max-w-[12rem]">Vouched: the best render of this brief, cleared {SEAL_THRESHOLD}.</p>
          </div>
        )}
      </header>

      <Checklist requirements={s.requirements} planning={s.status === "planning" || s.status === "queued"} />

      <div className={`mt-8 grid gap-6 ${s.entries.length === 1 ? "max-w-xl" : s.entries.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {s.entries.map((e) => (
          <ProofCard
            key={e.id}
            s={s}
            e={e}
            label={labels[e.model]}
            now={now}
            animate={!seen.current.has(e.id)}
            previousTotal={s.round > 1 ? parentBest?.total : undefined}
            onChange={setView}
          />
        ))}
      </div>

      <footer className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-soft border-t border-line pt-5 num">
        <span>Spent on Livepeer <strong className="text-ink">{money(spend)}</strong> (renders and judging)</span>
        <span>Session <code className="inline">{s.sessionId}</code></span>
        <span>Judged blind by <code className="inline">nemotron-omni-vision</code>, two passes merged</span>
        <Link href="/methodology" className="text-gold font-semibold hover:underline underline-offset-4">How the score works</Link>
      </footer>
    </div>
  );
}

function StatusLine({ s, landed, winnerLabel }: { s: Shootout; landed: number; winnerLabel?: string }) {
  const text =
    s.status === "queued"
      ? "Waiting for a free render slot"
      : s.status === "planning"
        ? s.round > 1
          ? "Turning your feedback into requirements and a sharper prompt"
          : "Writing a checklist from your brief"
        : s.status === "running"
          ? `Rendering on Livepeer: ${landed} of ${s.entries.length} landed`
          : s.status === "failed"
            ? s.error ?? "No contender produced a render."
            : winnerLabel
              ? s.entries.length > 1
                ? `${winnerLabel} wins.`
                : `${winnerLabel} graded.`
              : "Finished, but no render could be graded.";
  return (
    <p className="mt-4 flex items-center gap-2.5 font-medium" aria-live="polite">
      {LIVE.has(s.status) && <span className="status-dot" aria-hidden />}
      <span className={s.status === "failed" ? "text-[var(--grade-f)]" : ""}>{text}</span>
    </p>
  );
}

function Checklist({ requirements, planning }: { requirements: Requirement[]; planning: boolean }) {
  if (planning && requirements.length === 0) {
    return <div className="mt-6 h-10 max-w-2xl rounded-xl bg-[var(--surface-2)] animate-pulse" aria-hidden />;
  }
  if (requirements.length === 0) return null;
  return (
    <section className="mt-6" aria-label="What the judge checks">
      <h2 className="text-base mb-2 font-semibold" style={{ fontFamily: "var(--font-sans)" }}>What the judge checks</h2>
      <ol className="flex flex-wrap gap-2">
        {requirements.map((r) => (
          <li key={r.id} className={`chip cursor-default ${r.fromFeedback ? "border-[var(--gold-3)] text-ink" : ""}`} title={r.fromFeedback ? "Added from your feedback" : undefined}>
            <span className="text-mute num text-xs">{r.id.slice(1)}</span>
            {r.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

const TICK = {
  yes: <svg width="18" height="18" viewBox="0 0 20 20" className="tick-yes" aria-label="Met"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  partial: <svg width="18" height="18" viewBox="0 0 20 20" className="tick-partial" aria-label="Partly met"><path d="M5 10h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>,
  no: <svg width="18" height="18" viewBox="0 0 20 20" className="tick-no" aria-label="Missed"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>,
};

function ProofCard({
  s,
  e,
  label,
  now,
  animate,
  previousTotal,
  onChange,
}: {
  s: Shootout;
  e: Entry;
  label?: { label: string; vendor: string };
  now: number;
  animate: boolean;
  previousTotal?: number;
  onChange: (v: ShootoutView) => void;
}) {
  const router = useRouter();
  const [refining, setRefining] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isWinner = s.winnerId === e.id && s.entries.length > 1;
  const isPick = s.userPickId === e.id;
  const sc = e.score;
  const pending = e.status === "queued" || e.status === "rendering";
  const elapsed = e.startedAt ? now - e.startedAt : 0;

  async function post(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shootouts/${s.id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    if (await post("pick", { entryId: e.id })) {
      const res = await fetch(`/api/shootouts/${s.id}`, { cache: "no-store" });
      if (res.ok) onChange(await res.json());
    }
  }

  async function refine() {
    const data = await post("refine", { entryId: e.id, feedback });
    if (data?.id) router.push(`/s/${data.id}`);
  }

  return (
    <article className={`proof ${isWinner ? "is-winner" : ""}`} aria-label={label?.label ?? e.model}>
      <div className={`proof-frame ${s.kind === "video" ? "video" : ""} ${pending ? "pending" : ""}`}>
        {e.outputUrl ? (
          <Media url={e.outputUrl} kind={s.kind} alt={`${label?.label ?? e.model}'s render of the brief`} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center p-6">
            <div>
              <p className="font-semibold">{e.status === "failed" ? "Render failed" : e.status === "queued" ? "Waiting to start" : "Rendering"}</p>
              <p className="text-sm text-soft mt-1 num">{e.status === "failed" ? e.error : e.startedAt ? secs(elapsed) : ""}</p>
            </div>
          </div>
        )}
        {e.status === "judging" && <div className="absolute left-3 bottom-3 chip cursor-default"><span className="status-dot" aria-hidden />Judging</div>}
        {sc && (
          <div className={`stamp ${gradeClass(sc.grade)} ${animate ? "animate-stamp" : ""}`}>
            <b>{sc.grade}</b>
            <span>{sc.total.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base leading-tight truncate" style={{ fontFamily: "var(--font-sans)", fontWeight: 700 }}>
              <Link href={`/models/${e.model}`} className="hover:text-gold">{label?.label ?? e.model}</Link>
            </h3>
            <p className="text-sm text-soft num">
              {label?.vendor}
              {e.renderCostUsd !== undefined && <>, {money(e.renderCostUsd)}</>}
              {e.renderMs !== undefined && <> in {secs(e.renderMs)}</>}
            </p>
          </div>
          <div className="text-right shrink-0">
            {isWinner && <p className="text-xs font-bold text-gold">Judge&apos;s pick</p>}
            {isPick && <p className="text-xs font-bold" style={{ color: "var(--grade-b)" }}>Your pick</p>}
            {previousTotal !== undefined && sc && (
              <p className="text-xs font-semibold num" style={{ color: sc.total >= previousTotal ? "var(--grade-a)" : "var(--grade-f)" }}>
                {sc.total >= previousTotal ? "+" : ""}
                {(sc.total - previousTotal).toFixed(1)} vs last round
              </p>
            )}
          </div>
        </div>

        {sc && e.status === "done" && (
          <>
            <div className="grid gap-2">
              <Bar name="Matches the brief" v={sc.fidelity} g={gradeColor(sc.grade)} />
              <Bar name="Craft" v={sc.craft} />
              <Bar name="Aesthetics" v={sc.aesthetics} />
              <Bar name="Value" v={sc.value} />
              <Bar name="Speed" v={sc.speed} />
            </div>
            {sc.caps.length > 0 && <p className="text-sm font-semibold text-[var(--grade-d)]">Capped: {sc.caps.join(", ")}</p>}
            <ul className="grid gap-1.5">
              {s.requirements.map((r) => {
                const c = e.judge?.checks.find((x) => x.id === r.id);
                const v = c?.verdict ?? "no";
                return (
                  <li key={r.id} className="check" title={c?.note}>
                    {TICK[v]}
                    <span>
                      <span className={v === "yes" ? "" : "text-ink font-medium"}>{r.text}</span>
                      {v !== "yes" && c?.note && <span className="block text-soft text-[.82rem]">{c.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(e.judge?.defects.length ?? 0) > 0 && (
              <div>
                <p className="label mb-1">Flaws the judge saw</p>
                <ul className="text-sm text-soft list-disc pl-5 grid gap-0.5">
                  {e.judge!.defects.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </div>
            )}
            {e.judge?.verdict && <p className="text-sm italic text-soft border-l-2 border-[var(--gold)] pl-3">{e.judge.verdict}</p>}
          </>
        )}
        {e.status === "ungraded" && <p className="text-sm text-soft">{e.error ?? "The judge could not grade this render."} It stays off the Board.</p>}

        {s.status === "done" && e.outputUrl && (
          <div className="mt-auto pt-2 flex flex-wrap gap-2">
            {s.entries.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy || isPick} onClick={pick}>
                {isPick ? "You picked this" : "I prefer this one"}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={refining} onClick={() => setRefining((v) => !v)}>
              Refine this render
            </button>
          </div>
        )}
        {refining && (
          <form
            className="grid gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              refine();
            }}
          >
            <label htmlFor={`fb-${e.id}`} className="text-sm font-semibold">What should change?</label>
            <textarea id={`fb-${e.id}`} className="field min-h-20 text-sm" maxLength={400} value={feedback} onChange={(ev) => setFeedback(ev.target.value)}
              placeholder="e.g. Make the lettering gold and add steam rising from the cup" />
            <button type="submit" className="btn btn-primary btn-sm justify-self-start" disabled={busy || feedback.trim().length < 3}>
              {busy ? "Starting…" : `Run round ${s.round + 1}`}
            </button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-[var(--grade-f)]">{error}</p>}
      </div>
    </article>
  );
}

function Bar({ name, v, g }: { name: string; v: number; g?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2.6rem] items-center gap-3 text-sm">
      <span className="text-soft">{name}</span>
      <div className="meter" style={{ ["--g" as string]: g ?? "var(--ink-soft)" }}>
        <i style={{ width: `${Math.max(2, Math.min(100, v))}%` }} />
      </div>
      <span className="num text-right font-semibold">{Math.round(v)}</span>
    </div>
  );
}

function RoundTrail({ view, labels }: { view: ShootoutView; labels: Labels }) {
  const s = view.shootout;
  const best = (r: RoundSummary) => [...r.entries].sort((a, b) => (b.total ?? -1) - (a.total ?? -1))[0];
  const rounds: (RoundSummary & { current?: boolean })[] = [
    ...view.chain,
    { id: s.id, round: s.round, status: s.status, feedback: s.feedback, entries: s.entries.map((e) => ({ id: e.id, model: e.model, outputUrl: e.outputUrl, total: e.score?.total, grade: e.score?.grade })), current: true },
    ...view.children,
  ];
  return (
    <nav aria-label="Refine rounds" className="mb-8 overflow-x-auto">
      <ol className="flex items-stretch gap-2 min-w-max">
        {rounds.map((r, i) => {
          const b = best(r);
          return (
            <li key={r.id} className="flex items-center gap-2">
              {i > 0 && <span className="text-mute" aria-hidden>›</span>}
              <Link href={`/s/${r.id}`} aria-current={r.current ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm ${r.current ? "border-[var(--hard)] bg-[var(--surface)] font-semibold" : "border-line hover:border-[var(--gold-3)]"}`}>
                {b?.outputUrl && s.kind === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.outputUrl} alt="" className="w-8 h-8 rounded-md object-cover" />
                )}
                <span>
                  Round {r.round}
                  <span className="block text-xs text-soft font-normal max-w-[14rem] truncate">
                    {r.feedback ? `“${r.feedback}”` : r.entries.length > 1 ? `${r.entries.length} models` : labels[r.entries[0]?.model]?.label}
                  </span>
                </span>
                {b?.grade && <span className={`grade ${gradeClass(b.grade)} h-7 min-w-7 px-1.5 text-sm`}>{b.grade}</span>}
                {!b?.grade && r.status && LIVE.has(r.status) && <span className="status-dot" aria-label="Running" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
