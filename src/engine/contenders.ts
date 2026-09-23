import type { MediaKind } from "./types";

/**
 * The curated field. Every id is an exact Livepeer capability name — the raw
 * surface never substitutes a model, so what we name is what renders. Input
 * shapes differ between siblings (video duration is `5`, `"5"` or `"5s"`
 * depending on the provider), so each contender owns its own inputs, copied
 * from `describe_capability`.
 */

export type Tier = "draft" | "standard" | "premium";

export type Contender = {
  id: string;
  label: string;
  vendor: string;
  kind: MediaKind;
  tier: Tier;
  /** Billing unit on the rate card; we bill 1 image / ~1 MP / `seconds` of video. */
  unit: "image" | "megapixel" | "second";
  /** Rate-card price per unit (USD), from get_pricing on 2026-09-23. */
  priceUsd: number;
  /** Timeout sized from the measured p95 (under-sizing aborts a render that still bills). */
  timeoutS: number;
  inputs?: Record<string, unknown>;
  /** Video length we request, in seconds. */
  seconds?: number;
  blurb: string;
};

export const CONTENDERS: Contender[] = [
  // ── Image ──────────────────────────────────────────────────────────────
  { id: "flux-schnell", label: "FLUX.1 schnell", vendor: "Black Forest Labs", kind: "image", tier: "draft", unit: "megapixel", priceUsd: 0.00315, timeoutS: 37, blurb: "The fastest draft model on the network." },
  { id: "gemini-image", label: "Gemini 2.5 Flash Image", vendor: "Google", kind: "image", tier: "draft", unit: "image", priceUsd: 0.0041, timeoutS: 39, blurb: "Cheap, instruction-following image model." },
  { id: "krea-2-turbo", label: "Krea 2 Turbo", vendor: "Krea", kind: "image", tier: "draft", unit: "image", priceUsd: 0.01575, timeoutS: 90, blurb: "Krea's fast aesthetic tier." },
  { id: "ideogram-v4", label: "Ideogram v4", vendor: "Ideogram", kind: "image", tier: "standard", unit: "megapixel", priceUsd: 0.01575, timeoutS: 90, blurb: "Known for legible in-image typography." },
  { id: "flux-dev", label: "FLUX.1 dev", vendor: "Black Forest Labs", kind: "image", tier: "standard", unit: "megapixel", priceUsd: 0.02625, timeoutS: 41, blurb: "The network's default photoreal text-to-image." },
  { id: "krea-2", label: "Krea 2", vendor: "Krea", kind: "image", tier: "standard", unit: "image", priceUsd: 0.0315, timeoutS: 90, blurb: "Krea's full-quality medium model." },
  { id: "seedream-5-lite", label: "Seedream 5 Lite", vendor: "ByteDance", kind: "image", tier: "standard", unit: "image", priceUsd: 0.03675, timeoutS: 70, blurb: "ByteDance's lightweight Seedream." },
  { id: "uni-1-t2i", label: "Luma Uni-1", vendor: "Luma", kind: "image", tier: "premium", unit: "image", priceUsd: 0.0441, timeoutS: 150, blurb: "Luma's unified image model." },
  { id: "grok-imagine-quality", label: "Grok Imagine (quality)", vendor: "xAI", kind: "image", tier: "premium", unit: "image", priceUsd: 0.0525, timeoutS: 130, blurb: "xAI's quality image tier." },
  { id: "flux-pro", label: "FLUX1.1 pro ultra", vendor: "Black Forest Labs", kind: "image", tier: "premium", unit: "image", priceUsd: 0.063, timeoutS: 65, blurb: "BFL's flagship high-resolution model." },

  // ── Video (text-to-video) ──────────────────────────────────────────────
  { id: "ltx-25-t2v-fast", label: "LTX 2.5 Fast", vendor: "Lightricks", kind: "video", tier: "draft", unit: "second", priceUsd: 0.0945, timeoutS: 200, seconds: 6, inputs: { duration: 6, resolution: "720p", aspect_ratio: "16:9" }, blurb: "Cheapest way to see if a shot works, with native audio." },
  { id: "pixverse-t2v", label: "PixVerse C1", vendor: "PixVerse", kind: "video", tier: "draft", unit: "second", priceUsd: 0.06825, timeoutS: 255, seconds: 5, inputs: { duration: 5 }, blurb: "Quick, stylised text-to-video." },
  { id: "ltx-t2v", label: "LTX 2.3", vendor: "Lightricks", kind: "video", tier: "standard", unit: "second", priceUsd: 0.063, timeoutS: 270, seconds: 6, inputs: { duration: 6 }, blurb: "Open-weights LTX at a low per-second price." },
  { id: "kling-v3-turbo-t2v", label: "Kling 3 Turbo", vendor: "Kuaishou", kind: "video", tier: "standard", unit: "second", priceUsd: 0.1176, timeoutS: 550, seconds: 5, inputs: { duration: "5" }, blurb: "Kling's turbo tier, strong on motion." },
  { id: "ray-32-t2v", label: "Luma Ray 3.2", vendor: "Luma", kind: "video", tier: "premium", unit: "second", priceUsd: 0.063, timeoutS: 700, seconds: 5, inputs: { duration: "5s" }, blurb: "Luma's cinematic video model." },
  { id: "minimax-h3-t2v", label: "MiniMax H3", vendor: "MiniMax", kind: "video", tier: "premium", unit: "second", priceUsd: 0.084, timeoutS: 420, seconds: 6, inputs: { duration: 6, resolution: "768P", aspect_ratio: "16:9" }, blurb: "Frontier text-to-video from MiniMax." },
];

const BY_ID = new Map(CONTENDERS.map((c) => [c.id, c]));

export function contender(id: string): Contender | undefined {
  return BY_ID.get(id);
}

export function contendersFor(kind: MediaKind): Contender[] {
  return CONTENDERS.filter((c) => c.kind === kind);
}

/** Rate-card estimate for one render (1 image ≈ 1 MP at default size). */
export function estimateCostUsd(c: Contender): number {
  const units = c.unit === "second" ? (c.seconds ?? 5) : 1;
  return Math.round(c.priceUsd * units * 10_000) / 10_000;
}

/** Fallback lineup when the Board has nothing to say yet: one per tier. */
export const DEFAULT_LINEUPS: Record<MediaKind, string[]> = {
  image: ["flux-dev", "ideogram-v4", "gemini-image"],
  video: ["ltx-25-t2v-fast", "pixverse-t2v", "kling-v3-turbo-t2v"],
};
