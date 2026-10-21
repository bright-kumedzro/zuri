/** Builds avatars on a pool of Web Workers so pages stay responsive. Falls back to the main thread. */

import { assembleAvatar, type Avatar } from "./build.ts";
import { meshAvatar, type AvatarMeshes } from "./mesh.ts";
import { generateAvatar, type AvatarOptions, type AvatarParams } from "./params.ts";
import type { AvatarStyle } from "./head.ts";
import { spawnWorker } from "./spawn.ts";

interface Pending {
  resolve: (m: AvatarMeshes) => void;
  reject: (e: Error) => void;
  params: AvatarParams;
  quality: number;
  style: AvatarStyle;
}

export interface FactoryOptions {
  /** Number of workers. Default: cores - 1, at most 4. 0 disables workers. */
  workers?: number;
}

export class AvatarFactory {
  private readonly pool: { worker: Worker; load: number }[] = [];
  private readonly pending = new Map<number, Pending & { slot: { load: number } }>();
  private nextId = 1;

  constructor(options: FactoryOptions = {}) {
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
    const count = typeof Worker === "undefined" ? 0 : options.workers ?? Math.max(1, Math.min(4, cores - 1));
    for (let i = 0; i < count; i++) {
      let worker: Worker;
      try {
        worker = spawnWorker();
      } catch {
        break; // e.g. a Content-Security-Policy without worker-src blob: — mesh on the main thread instead
      }
      const slot = { worker, load: 0 };
      // A worker that fails to load drops out of the pool; its jobs finish on the main thread.
      worker.onerror = (e) => {
        e.preventDefault();
        worker.terminate();
        const index = this.pool.indexOf(slot);
        if (index >= 0) this.pool.splice(index, 1);
        for (const [id, job] of this.pending) {
          if (job.slot !== slot) continue;
          this.pending.delete(id);
          try {
            job.resolve(meshAvatar(job.params, job.quality, job.style));
          } catch (err) {
            job.reject(err as Error);
          }
        }
      };
      worker.onmessage = (e: MessageEvent<{ id: number; meshes?: AvatarMeshes; error?: string }>) => {
        const job = this.pending.get(e.data.id);
        if (!job) return;
        this.pending.delete(e.data.id);
        job.slot.load--;
        if (e.data.meshes) job.resolve(e.data.meshes);
        else job.reject(new Error(e.data.error ?? "zuri: worker failed"));
      };
      this.pool.push(slot);
    }
  }

  /** Mesh the params (in a worker when available). */
  mesh(params: AvatarParams, quality = 1, style: AvatarStyle = "soft"): Promise<AvatarMeshes> {
    if (!this.pool.length) return Promise.resolve(meshAvatar(params, quality, style));
    const slot = this.pool.reduce((a, b) => (b.load < a.load ? b : a));
    const id = this.nextId++;
    slot.load++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, slot, params, quality, style });
      slot.worker.postMessage({ id, params, quality, style });
    });
  }

  async create(seed: string, options: AvatarOptions & { quality?: number; style?: AvatarStyle } = {}): Promise<Avatar> {
    return this.build(generateAvatar(seed, options), options.quality, options.style);
  }

  async build(params: AvatarParams, quality = 1, style: AvatarStyle = "soft"): Promise<Avatar> {
    return assembleAvatar(params, await this.mesh(params, quality, style === "toon" ? "toon" : "soft"));
  }

  dispose() {
    for (const { worker } of this.pool) worker.terminate();
    this.pool.length = 0;
  }
}
