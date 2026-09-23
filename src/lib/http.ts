import { NextResponse } from "next/server";
import { GuardError } from "@/engine/guards";
import { ShootoutError } from "@/engine/shootout";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export function fail(err: unknown) {
  if (err instanceof ShootoutError || err instanceof GuardError) return json({ error: err.message }, err.status);
  console.error("[vouch] api error:", err);
  return json({ error: "Something went wrong on our side." }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new ShootoutError("Send a JSON body.");
  }
}

/** First hop of X-Forwarded-For (Railway's edge sets it), else a shared bucket. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
