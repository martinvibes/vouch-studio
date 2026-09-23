import type { MediaKind } from "@/engine/types";

/**
 * Example briefs. Easy prompts make every model look good, so these carry the
 * things models genuinely differ on: exact text, counts, and placement.
 */
export const EXAMPLES: { kind: MediaKind; label: string; brief: string }[] = [
  { kind: "image", label: "Bakery sign", brief: 'A hand-painted shop sign reading "FRESH BAGELS" above a window display with exactly four sesame bagels on a wooden board, morning light' },
  { kind: "image", label: "Perfume ad", brief: "A frosted glass perfume bottle on wet black slate, a single white orchid to its left, a thin gold cap, softbox rim light, studio product shot" },
  { kind: "image", label: "Ramen shop", brief: 'A neon sign reading "OPEN LATE" above a ramen shop door on a rainy night, two paper lanterns, a black cat sitting by the door' },
  { kind: "image", label: "Chess portrait", brief: "Portrait of an elderly woman with silver braids playing chess in a park, her right hand lifting a black knight, shallow depth of field" },
  { kind: "video", label: "Coffee pour", brief: "Slow push-in on a barista pouring latte art into a white cup, steam rising, warm cafe light, the rosetta pattern forming" },
  { kind: "video", label: "Fox in snow", brief: "A red fox trotting left to right across fresh snow at dawn, breath visible, tracking shot at the fox's eye level" },
];
