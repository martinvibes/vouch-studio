export type MediaKind = "image" | "video";

export type GradeLetter = "S" | "A" | "B" | "C" | "D" | "F";

export const IMAGE_CATEGORIES = [
  "product",
  "portrait",
  "landscape",
  "typography",
  "character",
  "food",
  "architecture",
] as const;
export const VIDEO_CATEGORIES = ["product", "nature", "character", "action"] as const;
export type Category = (typeof IMAGE_CATEGORIES)[number] | (typeof VIDEO_CATEGORIES)[number];

export type Requirement = {
  id: string; // "r1".."r8"
  text: string;
  /** Added from user feedback during a refine round. */
  fromFeedback?: boolean;
};

export type CheckVerdict = "yes" | "partial" | "no";

export type Check = { id: string; verdict: CheckVerdict; note: string };

export type JudgeResult = {
  checks: Check[];
  craft: number; // 0-10
  aesthetics: number; // 0-10
  defects: string[];
  verdict: string;
  judgeModel: string;
  /** For video: the contact sheet the judge actually looked at. */
  judgedUrl?: string;
  costUsd?: number;
  /** How many independent blind passes were merged into this verdict. */
  passes?: number;
};

export type ScoreBreakdown = {
  fidelity: number;
  craft: number;
  aesthetics: number;
  quality: number;
  value: number;
  speed: number;
  total: number;
  grade: GradeLetter;
  caps: string[];
};

export type EntryStatus = "queued" | "rendering" | "judging" | "done" | "failed" | "ungraded";

export type Entry = {
  id: string; // "e1".."e3"
  model: string; // contender id (Livepeer capability name)
  prompt: string; // exactly what was sent
  status: EntryStatus;
  startedAt?: number;
  renderMs?: number;
  outputUrl?: string;
  renderCostUsd?: number;
  judge?: JudgeResult;
  score?: ScoreBreakdown;
  error?: string;
};

export type ShootoutStatus = "queued" | "planning" | "running" | "done" | "failed";

export type Shootout = {
  id: string;
  createdAt: number;
  updatedAt: number;
  brief: string;
  kind: MediaKind;
  category: Category;
  requirements: Requirement[];
  entries: Entry[];
  status: ShootoutStatus;
  /** Judge's winner (highest total among graded entries). */
  winnerId?: string;
  /** The human's pick, if they overruled or confirmed. */
  userPickId?: string;
  /** Refine chain. */
  parentId?: string;
  parentEntryId?: string;
  round: number;
  feedback?: string;
  childIds?: string[];
  /** Livepeer session for the cost receipt. */
  sessionId: string;
  seed?: boolean;
  error?: string;
};
