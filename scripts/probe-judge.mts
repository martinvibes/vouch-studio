import { buildChecklist } from "../src/engine/checklist";
import { judgeRender } from "../src/engine/judge";
import { scoreEntry } from "../src/engine/score";

const brief = "A ceramic coffee mug on a walnut desk, morning window light, product photo, the mug has a small blue fox logo";
const imgs: Record<string, string> = JSON.parse(process.argv[2]);
const t0 = Date.now();
const cl = await buildChecklist(brief, "image", "vouch_probe_judge");
console.log("checklist", Date.now() - t0, "ms", cl.source, cl.category, cl.requirements.map((r) => `${r.id}:${r.text}`));
const rows = await Promise.all(Object.entries(imgs).flatMap(([name, url]) => [0, 1].map(async (rep) => {
  const j = await judgeRender({ imageUrl: url, brief, requirements: cl.requirements, kind: "image", sessionId: "vouch_probe_judge" });
  const s = scoreEntry({ kind: "image", requirements: cl.requirements, judge: j, costUsd: 0.01, renderMs: 15000 });
  return `${name.padEnd(14)} #${rep} fid ${String(s.fidelity).padStart(5)} craft ${j.craft} aes ${j.aesthetics} → ${s.total} ${s.grade} | ${j.checks.map((c) => c.verdict[0]).join("")} | ${j.defects.join("; ").slice(0, 70)} | ${j.verdict.slice(0, 80)}`;
})));
rows.sort().forEach((r) => console.log(r));
