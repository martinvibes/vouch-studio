import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { livepeer } from "@/livepeer/client";

/**
 * Video → one image the vision judge can read. Three frames sampled at 15%,
 * 50% and 85% of the clip are laid side by side (start → end), so the judge
 * sees the subject, the setting and whether things stay consistent over time.
 * The sheet is re-hosted on Livepeer so `nemotron-omni-vision` can fetch it.
 */

const run = promisify(execFile);
export const FRAME_POINTS = [0.15, 0.5, 0.85] as const;

function ffmpeg(): string {
  if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");
  return ffmpegPath as unknown as string;
}

export function parseDurationSeconds(ffmpegStderr: string): number | undefined {
  const m = ffmpegStderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return secs > 0 ? secs : undefined;
}

async function probeDuration(file: string): Promise<number | undefined> {
  // `ffmpeg -i` with no output exits non-zero but prints the header to stderr.
  try {
    await run(ffmpeg(), ["-hide_banner", "-i", file]);
  } catch (err) {
    return parseDurationSeconds(String((err as { stderr?: string }).stderr ?? ""));
  }
  return undefined;
}

/** Build the 3-frame sheet locally; returns JPEG bytes. */
export async function contactSheetBytes(videoUrl: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "vouch-frames-"));
  try {
    const res = await fetch(videoUrl, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Could not fetch video (${res.status})`);
    const input = path.join(dir, "in.mp4");
    await writeFile(input, Buffer.from(await res.arrayBuffer()));

    const duration = (await probeDuration(input)) ?? 5;
    const out = path.join(dir, "sheet.jpg");
    const seeks = FRAME_POINTS.flatMap((p) => ["-ss", (duration * p).toFixed(2), "-i", input]);
    const scale = FRAME_POINTS.map((_, i) => `[${i}:v]scale=512:-2,setsar=1[f${i}]`).join(";");
    const stack = `${FRAME_POINTS.map((_, i) => `[f${i}]`).join("")}hstack=inputs=${FRAME_POINTS.length}`;
    await run(ffmpeg(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...seeks,
      "-filter_complex",
      `${scale};${stack}`,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function contactSheetUrl(videoUrl: string, name: string): Promise<string> {
  const bytes = await contactSheetBytes(videoUrl);
  return livepeer().uploadBase64(bytes, "image/jpeg", `${name.replace(/[^a-z0-9_-]/gi, "_")}-frames.jpg`);
}
