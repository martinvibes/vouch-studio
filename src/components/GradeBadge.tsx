import type { GradeLetter } from "@/engine/types";
import { gradeClass } from "@/lib/format";

export function GradeBadge({ grade, size = "md" }: { grade: GradeLetter | string; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-7 min-w-7 px-1.5 text-sm", md: "h-10 min-w-10 px-2 text-lg", lg: "h-14 min-w-14 px-3 text-2xl" }[size];
  return (
    <span className={`grade ${gradeClass(grade)} ${dims}`} aria-label={`Grade ${grade}`}>
      {grade}
    </span>
  );
}
