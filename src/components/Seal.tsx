import type { GradeLetter } from "@/engine/types";
import { gradeColor } from "@/lib/format";

/**
 * The Vouch Seal, issued to a shootout winner that clears the bar: a notary
 * rosette with the grade struck in the centre. Server-renderable (fixed ids
 * are namespaced by `id`).
 */
export function Seal({ grade, score, size = 120, id, animate = false }: { grade: GradeLetter; score?: number; size?: number; id: string; animate?: boolean }) {
  const pathId = `seal-rim-${id}`;
  const color = gradeColor(grade);
  const c = 120;
  const p = (n: number) => Math.round(n * 1000) / 1000;
  const teeth = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    return (
      <line key={i} x1={p(c + 109 * Math.cos(a))} y1={p(c + 109 * Math.sin(a))} x2={p(c + 116 * Math.cos(a))} y2={p(c + 116 * Math.sin(a))}
        stroke="var(--gold)" strokeWidth={i % 5 === 0 ? 2.4 : 1.2} strokeLinecap="round" opacity={0.9} />
    );
  });
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} role="img" className={animate ? "animate-stamp" : undefined}
      aria-label={`Vouch seal, grade ${grade}${score !== undefined ? `, ${score} out of 100` : ""}`} style={{ overflow: "visible" }}>
      <defs>
        <path id={pathId} d={`M ${c},${c} m -104,0 a 104,104 0 1,1 208,0 a 104,104 0 1,1 -208,0`} fill="none" />
      </defs>
      <circle cx={c} cy={c} r="112" fill="var(--surface)" />
      {teeth}
      <circle cx={c} cy={c} r="105" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.5" />
      <circle cx={c} cy={c} r="92" fill="none" stroke="var(--gold)" strokeWidth="1.4" opacity="0.85" />
      <circle cx={c} cy={c} r="70" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
      <text fill="var(--gold-3)" style={{ fontFamily: "var(--font-sans)", fontSize: "15px", fontWeight: 800, letterSpacing: "4px" }}>
        <textPath href={`#${pathId}`}>VOUCHED · VOUCH STUDIO · VOUCHED · VOUCH STUDIO ·</textPath>
      </text>
      <text x={c} y={score !== undefined ? c - 2 : c + 22} textAnchor="middle" fill={color}
        style={{ fontFamily: "var(--font-display)", fontSize: "64px", fontWeight: 800, letterSpacing: "-2px" }}>
        {grade}
      </text>
      {score !== undefined && (
        <text x={c} y={c + 32} textAnchor="middle" fill="var(--ink-soft)" style={{ fontFamily: "var(--font-sans)", fontSize: "15px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {score.toFixed(1)}
        </text>
      )}
    </svg>
  );
}
