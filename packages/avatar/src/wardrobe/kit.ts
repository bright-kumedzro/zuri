/**
 * Tailoring helpers shared by every garment: the torso to offset fabric from, the neck hole, the neckline the
 * collars sit on, and the front surface of a layer (for ties, plackets and buttons). Units match head.ts.
 */

import type { AvatarParams } from "../params.ts";
import { BODY_BOTTOM, SHOULDER_Y, type Rig } from "../head.ts";
import { surfaceZ } from "../mesher.ts";
import { type SDF, capsule, ellipsoid, torus } from "../sdf.ts";

export interface Kit {
  rig: Rig;
  /** Fabric `offset` units off the torso. */
  shell: (x: number, y: number, z: number, offset?: number) => number;
  /** Vertical capsule through the neck, for cutting neck holes of radius r. */
  neckHole: (x: number, y: number, z: number, r: number) => number;
  /** Torus following the tilted neckline, for ribbed collars and bands. */
  ring: (x: number, y: number, z: number, R: number, r: number, lift?: number) => number;
  /** Front neckline height, back neckline height, and their middle. */
  yF: number;
  yB: number;
  cy: number;
  /** Neck radius and center z; the default neck-hole radius. */
  nr: number;
  nz: number;
  holeR: number;
  /** Front surface z at x = 0 of a layer, for y from `top` down to the bottom of the bust. */
  frontZ: (layer: SDF, top: number) => (y: number) => number;
  /** A button lying on a layer at (x, y). */
  button: (layer: SDF, x: number, y: number, r?: number) => SDF;
  bottom: number;
}

export function makeKit(p: AvatarParams, rig: Rig): Kit {
  const nr = rig.neck.radius, nz = rig.neck.z;
  const holeR = nr + 0.06;
  const shell = (x: number, y: number, z: number, offset = 0.055) => rig.torso(x, y, z) - offset;
  const neckHole = (x: number, y: number, z: number, r: number) => capsule(x, y, z, 0, SHOULDER_Y + 0.8, nz, 0, SHOULDER_Y - 0.45, nz + 0.05, r);
  // Where the fabric meets the neck, front and back (same probe as the original tops).
  const probe = (z: number) => {
    for (let y = SHOULDER_Y + 0.6; y > SHOULDER_Y - 0.9; y -= 0.005) if (shell(0, y, z) < 0) return y;
    return SHOULDER_Y;
  };
  const yF = probe(nz + holeR + 0.005), yB = probe(nz - holeR - 0.005);
  const cy = (yF + yB) / 2;
  const tilt = Math.atan2(yB - yF, 2 * holeR);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const ring = (x: number, y: number, z: number, R: number, r: number, lift = 0) => {
    const dy = y - cy - lift, dz = z - nz;
    return torus(x, dy * ct + dz * st, dz * ct - dy * st, R, r);
  };
  const frontZ = (layer: SDF, top: number) => {
    const step = 0.01, n = Math.ceil((top - BODY_BOTTOM + 0.1) / step);
    const table: number[] = [];
    for (let i = 0; i <= n; i++) table.push(surfaceZ(layer, 0, top - i * step, 1.5, -0.5));
    return (y: number) => {
      const f = Math.min(n - 0.001, Math.max(0, (top - y) / step)), i = Math.floor(f);
      return table[i]! + (table[i + 1]! - table[i]!) * (f - i);
    };
  };
  const button = (layer: SDF, x: number, y: number, r = 0.032): SDF => {
    const z0 = surfaceZ(layer, x, y, 1.5, -0.5);
    return (px, py, pz) => ellipsoid(px - x, py - y, pz - z0 - 0.004, r, r, r * 0.5);
  };
  void p;
  return { rig, shell, neckHole, ring, yF, yB, cy, nr, nz, holeR, frontZ, button, bottom: BODY_BOTTOM };
}

/** Garment output: the fabric field, which palette entry each surface point gets, and optional colors. */
export interface GarmentShape {
  sdf: SDF;
  /** 0 = main color, 1 = accent, 2 = white, 3+ = `extra[i - 3]`. */
  region: (x: number, y: number, z: number) => number;
  /** Extra colors (prints, gold buttons) as `#rrggbb`, addressed by region 3, 4, … */
  extra?: string[];
  /** Override the main color (a suit jacket is a deep shade of the outfit color). */
  main?: string;
  cell?: number;
}

/** What the flat (SVG) renderer hands a garment. */
export interface FlatKit {
  CX: number;
  /** Shoulder line y. */
  s: number;
  color: string;
  accent: string;
  /** The outfit color, darker. */
  shade: string;
  skin: string;
  print: readonly string[];
  mix: (a: string, b: string, t: number) => string;
  /** Unique id prefix for clip paths. */
  id: string;
}

export interface FlatGarment {
  /** SVG drawn over the torso fill. */
  body: string;
  /** SVG drawn behind the neck (hoods, robes). */
  behind?: string;
  /** Torso outline to fill with the main color; default is the standard shoulders. */
  torso?: string;
}

export interface Garment {
  build: (p: AvatarParams, k: Kit) => GarmentShape;
  flat: (p: AvatarParams, f: FlatKit) => FlatGarment;
}
