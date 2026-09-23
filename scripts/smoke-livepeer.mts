import { livepeer } from "../src/livepeer/client";

const lp = livepeer();
const sla = await lp.describe("flux-schnell");
console.log("sla", sla);
const t0 = Date.now();
const r = await lp.runCapability({ capability: "flux-schnell", prompt: "a red paper boat on a still pond, overhead shot", timeoutS: 37, sessionId: "vouch_smoke" });
console.log("render", Date.now() - t0, "ms", r.url, "$" + r.costUsd);
const v = await lp.runCapability({ capability: "nemotron-omni-vision", prompt: "What color is the boat? One word.", inputs: { image_url: r.url }, timeoutS: 35, sessionId: "vouch_smoke" });
console.log("vision:", v.text, "$" + v.costUsd);
try { await lp.runCapability({ capability: "nope-model", prompt: "x", timeoutS: 10, sessionId: "vouch_smoke" }); } catch (e) { console.log("error ok:", (e as Error).message.slice(0, 80)); }
