/**
 * Seed benchmark: real shootouts on Livepeer so the Board opens with evidence.
 * Every image contender enters 3 shootouts and every video contender 2, rotated
 * so the pairings vary. Results are written to seed/shootouts and the media is
 * mirrored (downscaled) into public/seed-media so the demo never depends on
 * a third-party URL staying up.
 *
 *   pnpm benchmark            # run everything
 *   pnpm benchmark image      # only image briefs
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

process.env.DATA_DIR = path.resolve("seed/shootouts");
process.env.MAX_CONCURRENT_SHOOTOUTS = "4";
process.env.DAILY_SPEND_USD = "40";

const run = promisify(execFile);

const IMAGE_BRIEFS = [
  'A hand-painted shop sign reading "FRESH BAGELS" above a window display with exactly four sesame bagels on a wooden board, morning light',
  'A vintage travel poster with the words "VISIT LISBON" in bold yellow letters, a red tram climbing a steep cobbled street, blue sky',
  "A frosted glass perfume bottle on wet black slate, a single white orchid to its left, a thin gold cap, softbox rim light, studio product shot",
  "A matte black wireless headphone floating above a concrete plinth, one ear cup rotated toward the camera, orange backdrop, hard shadow",
  "Portrait of an elderly woman with silver braids playing chess in a park, her right hand lifting a black knight, shallow depth of field",
  "A turquoise alpine lake at sunrise with exactly three red canoes pulled up on a pebble shore, snowy peaks reflected in still water",
  "A small green robot with one round eye watering a potted sunflower on a windowsill, rain on the glass behind it, Pixar-style 3D",
  "A bowl of tonkotsu ramen seen from above: a halved soft-boiled egg, three slices of chashu, a sheet of nori standing upright, chopsticks resting on the rim",
  "A stack of three blueberry pancakes with a pat of butter melting on top, maple syrup mid-pour, a white plate on a blue gingham tablecloth",
  "A brutalist concrete library at dusk with a single glowing orange window on the top floor, a lone cyclist passing in the foreground",
];

const VIDEO_BRIEFS = [
  "Slow push-in on a barista pouring latte art into a white cup, steam rising, warm cafe light, the rosetta pattern forming",
  "A red fox trotting left to right across fresh snow at dawn, breath visible, tracking shot at the fox's eye level",
  "A glass perfume bottle rotating slowly on a mirrored turntable, soft pink backdrop, light glinting off its facets",
  "A skateboarder ollies over a concrete ledge at sunset, camera follows low and close, sparks of dust on landing",
];

async function main() {
  const { contendersFor } = await import("../src/engine/contenders");
  const { createShootout, runShootout, liveDeps } = await import("../src/engine/shootout");
  const { store } = await import("../src/store");
  const only = process.argv[2];
  const deps = liveDeps();

  const plan: { brief: string; kind: "image" | "video"; models: string[] }[] = [];
  const rotate = (kind: "image" | "video", briefs: string[]) => {
    const ids = contendersFor(kind).map((c) => c.id);
    briefs.forEach((brief, i) => {
      const models = [0, 1, 2].map((k) => ids[(i * 3 + k) % ids.length]);
      plan.push({ brief, kind, models });
    });
  };
  if (!only || only === "image") rotate("image", IMAGE_BRIEFS);
  if (!only || only === "video") rotate("video", VIDEO_BRIEFS);

  console.log(`Running ${plan.length} shootouts…`);
  const started = Date.now();
  const ids = await Promise.all(
    plan.map(async (p) => {
      const s = await createShootout(p, deps);
      s.seed = true;
      await deps.store.save(s);
      await runShootout(s.id, deps);
      const done = (await store().get(s.id))!;
      const line = done.entries.map((e) => `${e.model}=${e.score?.grade ?? e.status}${e.score ? `(${e.score.total})` : ""}`).join("  ");
      console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${done.kind} ${done.id} ${done.status}  ${line}`);
      return s.id;
    }),
  );

  console.log("Mirroring media…");
  const mediaDir = path.resolve("public/seed-media");
  await mkdir(mediaDir, { recursive: true });
  const ffmpeg = (await import("ffmpeg-static")).default as unknown as string;
  for (const id of ids) {
    const s = (await store().get(id))!;
    for (const e of s.entries) {
      if (!e.outputUrl || e.outputUrl.startsWith("/")) continue;
      const res = await fetch(e.outputUrl, { redirect: "follow" });
      if (!res.ok) continue;
      const raw = path.join(mediaDir, `${s.id}-${e.id}.src`);
      await writeFile(raw, Buffer.from(await res.arrayBuffer()));
      const out = s.kind === "video" ? `${s.id}-${e.id}.mp4` : `${s.id}-${e.id}.jpg`;
      const args =
        s.kind === "video"
          ? ["-y", "-i", raw, "-vf", "scale='min(960,iw)':-2", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", path.join(mediaDir, out)]
          : ["-y", "-i", raw, "-vf", "scale='min(1024,iw)':-2", "-q:v", "4", path.join(mediaDir, out)];
      await run(ffmpeg, args);
      await run("rm", [raw]);
      e.originalUrl = e.outputUrl;
      e.outputUrl = `/seed-media/${out}`;
    }
    await deps.store.save(s);
  }
  const all = (await store().list()).filter((s) => ids.includes(s.id));
  const spend = all.flatMap((s) => s.entries).reduce((t, e) => t + (e.renderCostUsd ?? 0) + (e.judge?.costUsd ?? 0), 0);
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s, spent $${spend.toFixed(2)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
