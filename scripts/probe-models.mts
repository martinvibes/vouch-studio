import { livepeer } from "../src/livepeer/client";
const lp = livepeer();
const models = process.argv.slice(2);
const prompt = "A ceramic coffee mug on a walnut desk, morning window light, product photo, the mug has a small blue fox logo";
await Promise.all(models.map(async (m) => {
  const t0 = Date.now();
  try {
    const r = await lp.runCapability({ capability: m, prompt, timeoutS: 180, sessionId: "vouch_probe_models" });
    console.log(`OK   ${m.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s $${r.costUsd} ${r.url}`);
  } catch (e) { console.log(`FAIL ${m.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s ${(e as Error).message.slice(0, 160)}`); }
}));
