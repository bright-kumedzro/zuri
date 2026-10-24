/**
 * Browser helpers that framework components (and plain JS) build on: a shared worker pool, cached images, and a
 * live 3D canvas that cleans up after itself. Nothing here runs at import time, so it is safe to import during
 * server-side rendering; just call the functions in the browser.
 */

import { disposeAvatar, type Avatar } from "./build.ts";
import { AvatarFactory } from "./factory.ts";
import type { AvatarStyle } from "./head.ts";
import type { AvatarOptions } from "./params.ts";
import { AvatarStage, snapshotAvatar, type Framing } from "./stage.ts";

let shared: AvatarFactory | null = null;
/** One worker pool for the whole page. */
export const sharedFactory = (): AvatarFactory => (shared ??= new AvatarFactory());

export interface AvatarImageOptions extends AvatarOptions {
  /** Pixel size of the (square) image. Default 128; render at 2x the displayed size for sharp results. */
  size?: number;
  style?: AvatarStyle;
  framing?: Framing;
  transparent?: boolean;
  type?: "image/png" | "image/webp" | "image/jpeg";
}

const cache = new Map<string, Promise<string>>();
const CACHE_LIMIT = 300;

/** A 3D avatar rendered to a data URL. Identical requests share one render. */
export function avatarImage(seed: string, options: AvatarImageOptions = {}): Promise<string> {
  const key = JSON.stringify([seed, options]);
  let hit = cache.get(key);
  if (!hit) {
    const { size = 128, framing, transparent, type, ...traits } = options;
    hit = sharedFactory()
      .create(seed, { ...traits, quality: size <= 160 ? 0.75 : 1 })
      .then((avatar) => {
        const url = snapshotAvatar(avatar, { size, framing, transparent, type });
        disposeAvatar(avatar);
        return url;
      });
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
    // Keep memory bounded: drop the oldest entries.
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  }
  return hit;
}

export interface MountOptions extends AvatarOptions {
  style?: AvatarStyle;
  framing?: Framing;
  transparent?: boolean;
  /** Idle blinking and sway. Default true (off when the user prefers reduced motion). */
  animate?: boolean;
  /** Drag to rotate. Default true. */
  interactive?: boolean;
}

export interface MountedAvatar {
  /** Show a different seed or options; the canvas and renderer are reused. */
  update: (seed: string, options?: MountOptions) => void;
  /** Stop rendering and free the GPU resources. */
  dispose: () => void;
}

/** Live 3D in an existing canvas: sized to the canvas, animated, drag to rotate, disposed on request. */
export function mountAvatar(canvas: HTMLCanvasElement, seed: string, options: MountOptions = {}): MountedAvatar {
  const stage = new AvatarStage({ canvas, transparent: options.transparent });
  let opts = options;
  let request = 0, frame = 0, yaw = 0, disposed = false;
  let drag: { x: number; yaw: number } | null = null;
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const resize = () => {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (w && h) stage.setSize(w, h);
  };
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  resize();

  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const a = stage.avatar as Avatar | null;
    if (!a) return;
    const animate = (opts.animate ?? true) && !reduced;
    a.userData.tick(animate ? now / 1000 : 0);
    if (!animate) a.rotation.set(0, 0, 0);
    if (!drag) yaw *= 0.9;
    a.rotation.y += yaw;
    stage.render();
  };
  frame = requestAnimationFrame(loop);

  const down = (e: PointerEvent) => {
    if (opts.interactive === false) return;
    drag = { x: e.clientX, yaw };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012;
  };
  const up = () => (drag = null);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const show = (s: string, o: MountOptions) => {
    const id = ++request;
    const { framing, transparent: _, animate: __, interactive: ___, ...traits } = o;
    if (framing) stage.frame(framing);
    sharedFactory()
      .create(s, traits)
      .then((avatar) => {
        if (disposed || id !== request) return disposeAvatar(avatar);
        stage.show(avatar);
      });
  };
  show(seed, opts);

  return {
    update: (s, o = {}) => {
      opts = o;
      show(s, o);
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      stage.dispose();
    },
  };
}
