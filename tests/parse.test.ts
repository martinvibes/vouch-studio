import { describe, expect, it } from "vitest";
import {
  extractCost,
  extractErrorMessage,
  extractJobId,
  extractStatus,
  extractText,
  extractUrl,
  isToolError,
} from "@/livepeer/parse";
import imageInline from "./fixtures/image-inline.json";
import visionText from "./fixtures/vision-text.json";
import toolError from "./fixtures/tool-error.json";
import geminiText from "./fixtures/gemini-text.json";
import videoSubmit from "./fixtures/video-submit.json";
import videoRunning from "./fixtures/video-poll-running.json";
import videoDone from "./fixtures/video-poll-done.json";

describe("livepeer response parsing (recorded live fixtures)", () => {
  it("reads the hosted media url from an inline image result", () => {
    expect(extractUrl(imageInline)).toMatch(/^https:\/\/agent\.livepeer\.org\/a\/.+\.jpg$/);
  });

  it("falls back to the url in the text content when structuredContent has none", () => {
    const textOnly = {
      result: { content: [{ type: "text", text: "flux-dev → https://cdn.example.com/x/out.png" }] },
    };
    expect(extractUrl(textOnly)).toBe("https://cdn.example.com/x/out.png");
  });

  it("reads the job id from an async submit and treats it as not-yet-media", () => {
    expect(extractJobId(videoSubmit)).toMatch(/^mjob_[a-z0-9]+$/);
    expect(extractStatus(videoSubmit)).toBe("submitted");
    expect(extractUrl(videoSubmit)).toBeUndefined();
  });

  it("reads job status while running and once done", () => {
    expect(extractStatus(videoRunning)).toBe("running");
    expect(extractStatus(videoDone)).toBe("done");
    expect(extractUrl(videoDone)).toMatch(/\.mp4$/);
  });

  it("prefers the paid cost, else the estimate", () => {
    expect(extractCost(visionText)).toBeCloseTo(0.0051, 6);
    expect(extractCost(videoDone)).toBeCloseTo(0.3413, 6);
    expect(extractCost(imageInline)).toBeGreaterThan(0);
  });

  it("returns the model's text for text-output capabilities", () => {
    expect(extractText(visionText)).toContain("OPEN LATE");
    expect(extractText(geminiText)).toContain('"ok"');
  });

  it("detects tool errors and surfaces the reason", () => {
    expect(isToolError(toolError)).toBe(true);
    expect(extractErrorMessage(toolError)).toContain("not a registered capability");
    expect(isToolError(imageInline)).toBe(false);
  });

  it("treats a JSON-RPC level error as a tool error", () => {
    const rpcError = { error: { code: -32602, message: "Invalid params" } };
    expect(isToolError(rpcError)).toBe(true);
    expect(extractErrorMessage(rpcError)).toBe("Invalid params");
  });
});
