import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Shootout } from "@/engine/types";

/**
 * Persistence behind one small interface, so the backing can change (e.g. a
 * DKG-published ledger) without touching the engine. The file store keeps one
 * JSON document per shootout: runtime writes go to DATA_DIR, and the committed
 * seed benchmark is read from ./seed/shootouts (runtime wins on id clash).
 */
export interface Store {
  get(id: string): Promise<Shootout | undefined>;
  save(s: Shootout): Promise<void>;
  list(): Promise<Shootout[]>;
  /** Bumps on every save; lets readers cache derived views (the Board). */
  version(): number;
}

const SAFE_ID = /^[a-z0-9_-]{4,64}$/i;

export class FileStore implements Store {
  private cache = new Map<string, Shootout>();
  private loaded: Promise<void> | undefined;
  private rev = 0;
  private writes = new Map<string, Promise<void>>();

  constructor(
    private readonly dataDir: string,
    private readonly seedDir?: string,
  ) {}

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      for (const dir of [this.seedDir, this.dataDir]) {
        if (!dir) continue;
        let files: string[] = [];
        try {
          files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
        } catch {
          continue; // directory not created yet
        }
        for (const f of files) {
          try {
            const s = JSON.parse(await readFile(path.join(dir, f), "utf8")) as Shootout;
            if (s?.id) this.cache.set(s.id, s);
          } catch {
            /* skip a corrupt file rather than take the Board down */
          }
        }
      }
    })();
    return this.loaded;
  }

  async get(id: string): Promise<Shootout | undefined> {
    if (!SAFE_ID.test(id)) return undefined;
    await this.load();
    return this.cache.get(id);
  }

  async list(): Promise<Shootout[]> {
    await this.load();
    return [...this.cache.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  version(): number {
    return this.rev;
  }

  async save(s: Shootout): Promise<void> {
    if (!SAFE_ID.test(s.id)) throw new Error(`Unsafe shootout id: ${s.id}`);
    await this.load();
    s.updatedAt = Date.now();
    this.cache.set(s.id, s);
    this.rev++;
    // Serialise writes per id so an older snapshot can never land last.
    const prev = this.writes.get(s.id) ?? Promise.resolve();
    const next = prev.then(() => this.writeFile(s)).catch(() => this.writeFile(s));
    this.writes.set(s.id, next);
    await next;
  }

  private async writeFile(s: Shootout): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const file = path.join(this.dataDir, `${s.id}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(s, null, 2));
    await rename(tmp, file);
  }
}

// One store per server process, surviving Next.js dev hot-reloads.
const g = globalThis as unknown as { __vouchStore?: Store };

export function store(): Store {
  g.__vouchStore ??= new FileStore(
    path.resolve(process.env.DATA_DIR || "./data"),
    path.resolve(process.cwd(), "seed/shootouts"),
  );
  return g.__vouchStore;
}
