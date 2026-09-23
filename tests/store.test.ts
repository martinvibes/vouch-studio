import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore } from "@/store";
import type { Shootout } from "@/engine/types";

const make = (id: string, createdAt: number, brief = "b"): Shootout => ({
  id,
  createdAt,
  updatedAt: createdAt,
  brief,
  kind: "image",
  category: "product",
  requirements: [],
  entries: [],
  status: "done",
  round: 1,
  sessionId: "x",
});

describe("FileStore", () => {
  it("round-trips, lists newest first, and lets runtime override seed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vouch-store-"));
    const seed = path.join(root, "seed");
    await mkdir(seed);
    await writeFile(path.join(seed, "seed01.json"), JSON.stringify(make("seed01", 1, "from seed")));
    const s = new FileStore(path.join(root, "data"), seed);

    await s.save(make("run0001", 5));
    const override = make("seed01", 1, "edited at runtime");
    await s.save(override);

    expect((await s.list()).map((x) => x.id)).toEqual(["run0001", "seed01"]);
    expect((await s.get("seed01"))?.brief).toBe("edited at runtime");
    const onDisk = JSON.parse(await readFile(path.join(root, "data", "run0001.json"), "utf8"));
    expect(onDisk.id).toBe("run0001");
    expect(s.version()).toBe(2);
  });

  it("rejects path-traversal ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vouch-store-"));
    const s = new FileStore(path.join(root, "data"));
    expect(await s.get("../etc/passwd")).toBeUndefined();
    await expect(s.save(make("../evil", 1))).rejects.toThrow(/Unsafe/);
  });
});
