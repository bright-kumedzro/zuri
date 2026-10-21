/** Reusable garment pieces: collars, plackets, button rows, V openings and lapels. */

import type { SDF } from "../sdf.ts";
import { ellipsoid, noise3, smax, smin } from "../sdf.ts";
import type { Kit } from "./kit.ts";

/** Knit ribs running down the fabric. */
export const knit = (x: number, y: number, z: number) => 0.006 * Math.abs(Math.sin(x * 55 + 0.6 * Math.sin(y * 3)));

/** Soft, low-frequency folds. */
export const folds = (x: number, y: number, z: number, amount = 0.012) => amount * noise3(x * 2.2, y * 3.5, z * 2.2);

/** A shirt collar on `layer`: a band around the neck that drops at the front into two points. */
export function shirtCollar(k: Kit, layer: SDF, gap = 0.03): SDF {
  const { nr, nz, cy, yF } = k;
  const top = yF + 0.02;
  const fz = k.frontZ(layer, top);
  return (x, y, z) => {
    const r = Math.hypot(x, z - nz);
    const band = Math.abs(r - (nr + 0.06)) - 0.03;
    const frontness = Math.max(0, (z - nz) / (nr + 0.06));
    const low = cy - 0.08 - 0.2 * frontness * frontness, high = cy + 0.2 - 0.08 * frontness;
    let d = smax(band, Math.max(low - y, y - high), 0.02);
    const ax = Math.abs(x);
    const wing = Math.max(Math.abs(z - fz(y) - 0.03) - 0.025, ax - 0.05 - (top - y) * 0.7, 0.03 - ax + (top - y) * 0.15, y - top - 0.02, yF - 0.27 - y);
    d = Math.min(d, wing);
    return smax(d, gap - ax, 0.01);
  };
}

/** A raised strip down the center front, from `top` to the bottom of the bust. */
export function placket(k: Kit, layer: SDF, top: number, halfWidth = 0.035): SDF {
  return (x, y, z) => smax(layer(x, y, z) - 0.012, Math.max(Math.abs(x) - halfWidth, y - top), 0.01);
}

/** Buttons at x, every `step` from `top` down. */
export function buttonRow(k: Kit, layer: SDF, x: number, top: number, step: number, r = 0.028): SDF {
  const parts: SDF[] = [];
  for (let y = top; y > k.bottom + 0.04; y -= step) parts.push(k.button(layer, x, y, r));
  return (px, py, pz) => {
    let d = Infinity;
    for (const b of parts) d = Math.min(d, b(px, py, pz));
    return d;
  };
}

/** Distance to the inside of a V opening that narrows to `bottom` (half-width grows by `slope` per unit up). */
export const vOpening = (bottom: number, slope: number, min = 0.04) => (x: number, y: number, z: number) =>
  Math.max(Math.abs(x) - (min + (y - bottom) * slope), bottom - y, 0.05 - z);

/** Raised lapels along a V edge with a notch, as used on jackets and coats. */
export function lapels(k: Kit, jacket: SDF, edge: (y: number) => number, bottom: number, notchY: number): SDF {
  const top = k.yF + 0.02;
  return (x, y, z) => {
    const ax = Math.abs(x);
    const lapel = Math.max(Math.abs(ax - edge(y) - 0.13) - 0.13, bottom - 0.02 - y, y - top - 0.06, -z);
    const notch = Math.abs(y - notchY) - 0.025 + (ax - edge(y) - 0.16) * 0.2;
    return smax(jacket(x, y, z) - 0.045, Math.max(lapel, -notch), 0.022);
  };
}

/** A patch pocket (or pocket flap) lying on a layer. */
export function pocket(layer: SDF, cx: number, cy: number, w: number, h: number, raise = 0.014): SDF {
  return (x, y, z) => smax(layer(x, y, z) - raise, Math.max(Math.abs(x - cx) - w, Math.abs(y - cy) - h), 0.012);
}

/** Merge pieces (smooth union of the first with the rest). */
export const union = (...parts: SDF[]): SDF => (x, y, z) => {
  let d = Infinity;
  for (const f of parts) d = Math.min(d, f(x, y, z));
  return d;
};

export { ellipsoid, smax, smin };
