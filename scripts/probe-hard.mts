import { livepeer } from "../src/livepeer/client";
import { buildChecklist } from "../src/engine/checklist";
import { judgeRender } from "../src/engine/judge";
import { scoreEntry } from "../src/engine/score";
const brief = process.argv[2];
const models = process.argv.slice(3);
const sid = "vouch_probe_hard";
const [cl, renders] = await Promise.all([
  buildChecklist(brief, "image", sid),
  Promise.all(models.map(async (m) => { const t0 = Date.now(); const r = await livepeer().runCapability({ capability: m, prompt: brief, timeoutS: 150, sessionId: sid }); return { m, url: r.url!, cost: r.costUsd ?? 0, ms: Date.now() - t0 }; })),
]);
console.log(cl.category, cl.requirements.map((r) => `${r.id}:${r.text}`).join(" | "));
for (const r of renders) {
  const j = await judgeRender({ imageUrl: r.url, brief, requirements: cl.requirements, kind: "image", sessionId: sid });
  const s = scoreEntry({ kind: "image", requirements: cl.requirements, judge: j, costUsd: r.cost, renderMs: r.ms });
  console.log(`${r.m.padEnd(14)} fid ${s.fidelity} craft ${j.craft} aes ${j.aesthetics} q ${s.quality} val ${s.value} spd ${s.speed} → ${s.total} ${s.grade} | ${j.checks.map((c) => c.verdict[0]).join("")} | ${j.checks.filter(c=>c.verdict!=="yes").map(c=>c.id+":"+c.note).join(" / ").slice(0,160)} | defects: ${j.defects.join("; ").slice(0, 100)}`);
  console.log("   ", r.url);
}
