"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { gradeClass } from "@/lib/format";

export type ReelEntry = { url: string; label: string; grade: string; total: number; ticks: ("yes" | "partial" | "no")[]; cost: string };
export type Reel = { id: string; brief: string; winner: number; entries: ReelEntry[] };

// When each beat of the replay starts, in ms from the start of a reel.
const BEATS: [string, number][] = [
  ["deal", 1300],
  ["resolve", 1700],
  ["judge", 2900],
  ["stamp", 4400],
  ["crown", 5300],
  ["out", 7900],
];
const REEL_MS = 8300;
const TYPE_MS = 1150;

export function HeroReel({ reels }: { reels: Reel[] }) {
  const [i, setI] = useState(0);
  const [beats, setBeats] = useState<string[]>([]);
  const [typed, setTyped] = useState(0);
  const reel = reels[i % reels.length];

  useEffect(() => {
    if (!reel) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setTyped(reel.brief.length);
      setBeats(BEATS.map(([b]) => b).filter((b) => b !== "out"));
      const t = setTimeout(() => setI((n) => n + 1), 7000);
      return () => clearTimeout(t);
    }
    setBeats([]);
    setTyped(0);
    const step = Math.max(8, TYPE_MS / reel.brief.length);
    const typer = setInterval(() => setTyped((n) => (n >= reel.brief.length ? n : n + 1)), step);
    const timers = BEATS.map(([b, at]) => setTimeout(() => setBeats((prev) => [...prev, b]), at));
    timers.push(setTimeout(() => setI((n) => n + 1), REEL_MS));
    // Warm the next reel's renders so they are ready when it starts.
    reels[(i + 1) % reels.length]?.entries.forEach((e) => { const img = new Image(); img.src = e.url; });
    return () => { clearInterval(typer); timers.forEach(clearTimeout); };
  }, [i, reel, reels]);

  if (!reel) return null;
  const has = (b: string) => beats.includes(b);
  const w = reel.entries[reel.winner];

  return (
    <figure
      className={`reel ${beats.map((b) => `is-${b}`).join(" ")}`}
      aria-label={`Replay of a real shootout: ${reel.brief}. ${w.label} won with ${w.grade} ${w.total.toFixed(1)}.`}
    >
      <div className="reel-brief" aria-hidden>
        <span className="reel-brief-label">Brief</span>
        <p>
          {reel.brief.slice(0, typed)}
          <span className="reel-caret" />
        </p>
      </div>

      <div className="reel-cards" aria-hidden>
        {reel.entries.map((e, n) => (
          <div key={`${reel.id}-${n}`} className={`reel-card ${n === reel.winner ? "is-win" : ""}`} style={{ ["--i" as string]: n }}>
            <div className="reel-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt="" />
              <i className="reel-scan" />
              {has("stamp") && (
                <span className={`stamp stamp-sm animate-stamp ${gradeClass(e.grade)}`} style={{ animationDelay: `${n * 160}ms` }}>
                  <b>{e.grade}</b>
                  <span>{e.total.toFixed(1)}</span>
                </span>
              )}
            </div>
            <div className="reel-ticks">
              {e.ticks.map((t, k) => (
                <i key={k} className={`reel-tick t-${t}`} style={{ ["--k" as string]: k }} />
              ))}
            </div>
            <p className="reel-model">
              <span>{e.label}</span>
              <span className="num">{e.cost}</span>
            </p>
          </div>
        ))}
      </div>

      <figcaption className="reel-foot">
        <span className="reel-verdict">
          <span className={`grade ${gradeClass(w.grade)} h-6 min-w-6 px-1 text-xs`}>{w.grade}</span>
          {w.label} gets the vouch
        </span>
        <Link href={`/s/${reel.id}`} className="reel-open">Open this shootout</Link>
      </figcaption>
    </figure>
  );
}
