import Link from "next/link";
import { gradeClass } from "@/lib/format";
import { Media } from "./Media";

/** A finished render as a small proof with its grade stamped on. */
export function ProofThumb({ href, url, kind, grade, total, caption, sub }: { href: string; url?: string; kind: "image" | "video"; grade?: string; total?: number; caption: string; sub?: string }) {
  return (
    <Link href={href} className="group block">
      <div className="proof-frame rounded-[var(--radius-sm)] border border-line">
        {url && <Media url={url} kind={kind} alt={caption} thumb />}
        {grade && (
          <div className={`stamp ${gradeClass(grade)}`} style={{ width: 58, height: 58, right: 10, top: 10, borderWidth: 2.5 }}>
            <b style={{ fontSize: "1.4rem", marginTop: 4 }}>{grade}</b>
            {total !== undefined && <span style={{ fontSize: ".6rem", marginTop: -6 }}>{total.toFixed(1)}</span>}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm leading-snug line-clamp-2 group-hover:text-gold">{caption}</p>
      {sub && <p className="text-xs text-mute mt-0.5">{sub}</p>}
    </Link>
  );
}
