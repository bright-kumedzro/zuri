/** Tops as signed distance fields offset from the torso, with per-vertex color regions. */

import type { AvatarParams } from "./params.ts";
import { BODY_BOTTOM, SHOULDER_Y, type Rig } from "./head.ts";
import type { Box } from "./mesher.ts";
import { type SDF, capsule, ellipsoid, smax, smin, torus } from "./sdf.ts";
import { GARMENTS, makeKit } from "./wardrobe/index.ts";
import { scarf } from "./wardrobe/accessories.ts";

export interface OutfitShape {
  sdf: SDF;
  box: Box;
  cell: number;
  /** Palette entry for a surface point: 0 = main, 1 = accent, 2 = white detail, 3+ = `extra`. */
  region: (x: number, y: number, z: number) => number;
  extra?: string[];
  /** Overrides the main color. */
  main?: string;
}

export function buildOutfit(p: AvatarParams, rig: Rig): OutfitShape {
  const base = buildTop(p, rig);
  if (p.accessory !== "scarf") return base;
  // The scarf wraps over whatever is worn, in the accent color.
  const wrapped = scarf(makeKit(p, rig), base.sdf);
  return {
    ...base,
    sdf: (x, y, z) => Math.min(base.sdf(x, y, z), wrapped(x, y, z)),
    region: (x, y, z) => (wrapped(x, y, z) < Math.abs(base.sdf(x, y, z)) ? 1 : base.region(x, y, z)),
    cell: Math.min(base.cell, 0.024),
  };
}

function buildTop(p: AvatarParams, rig: Rig): OutfitShape {
  const style = p.outfit.style;
  const garment = GARMENTS[style];
  if (garment) {
    const g = garment.build(p, makeKit(p, rig));
    return { sdf: g.sdf, region: g.region, extra: g.extra, main: g.main, cell: g.cell ?? 0.026, box: { min: [-1.85, BODY_BOTTOM - 0.06, -1.15], max: [1.85, SHOULDER_Y + 0.9, 1.05] } };
  }
  const nr = rig.neck.radius;
  const nz = rig.neck.z;
  const holeR = nr + 0.06;
  const shell = (x: number, y: number, z: number) => rig.torso(x, y, z) - 0.055;
  const neckHole = (x: number, y: number, z: number, r: number) =>
    capsule(x, y, z, 0, SHOULDER_Y + 0.8, nz, 0, SHOULDER_Y - 0.45, nz + 0.05, r);

  // Measure where the fabric meets the neck, front and back, so collars sit on the neckline.
  const probe = (z: number) => {
    for (let y = SHOULDER_Y + 0.6; y > SHOULDER_Y - 0.9; y -= 0.005) if (shell(0, y, z) < 0) return y;
    return SHOULDER_Y;
  };
  const yF = probe(nz + holeR + 0.005), yB = probe(nz - holeR - 0.005);
  const cy = (yF + yB) / 2;
  const tilt = Math.atan2(yB - yF, 2 * holeR);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  /** Torus following the (tilted) neckline. */
  const ring = (x: number, y: number, z: number, R: number, r: number, lift = 0) => {
    const dy = y - cy - lift, dz = z - nz;
    return torus(x, dy * ct + dz * st, dz * ct - dy * st, R, r);
  };

  const vDepth = yF - (style === "blazer" ? 0.62 : 0.4);
  const vee = (x: number, y: number, z: number) => Math.max(Math.abs(x) - (y - vDepth) * 0.42, 0.05 - z);

  let sdf: SDF;
  let cell = 0.03;
  const white = 2;
  let region: OutfitShape["region"] = () => 0;

  switch (style) {
    case "tank": {
      const top = yF - 0.16;
      sdf = (x, y, z) => {
        let d = smax(shell(x, y, z), y - top + 0.05 * Math.cos(x * 3), 0.04);
        const sx = Math.abs(x);
        const strap = Math.min(
          capsule(sx, y, z, 0.4, top - 0.02, 0.25, 0.47, SHOULDER_Y + 0.33, -0.2, 0.04),
          capsule(sx, y, z, 0.47, SHOULDER_Y + 0.33, -0.2, 0.42, top - 0.02, -0.6, 0.04),
        );
        return Math.min(d, smax(strap, -shell(x, y, z) - 0.01, 0.01));
      };
      break;
    }
    case "turtleneck":
      sdf = (x, y, z) => {
        let d = smin(shell(x, y, z), capsule(x, y, z, 0, yF + 0.45, nz, 0, yF - 0.3, nz, nr + 0.13), 0.12);
        d = smax(d, y - (yF + 0.45), 0.03);
        d = smin(d, ring(x, y, z, nr + 0.13, 0.065, 0.36), 0.05);
        // Hollow out the neck so the collar doesn't swallow the chin.
        return smax(d, -capsule(x, y, z, 0, yF + 1, nz, 0, yF - 0.1, nz, nr + 0.07), 0.02);
      };
      break;
    default: {
      const hood = style === "hoodie";
      const collar = style === "shirt";
      const v = style === "vneck" || style === "blazer";
      sdf = (x, y, z) => {
        let d = shell(x, y, z);
        let hole = neckHole(x, y, z, holeR);
        if (v) hole = smin(hole, vee(x, y, z), 0.06);
        d = smax(d, -hole, 0.04);
        if (!v) d = smin(d, ring(x, y, z, holeR + 0.015, 0.032), 0.03);
        if (hood) {
          const h = ellipsoid(x, y - yB - 0.02, z - nz + nr + 0.28, nr + 0.42, 0.3, 0.36);
          d = smin(d, smax(h, -neckHole(x, y, z, holeR + 0.04), 0.05), 0.12);
          d = smin(d, ring(x, y, z, holeR + 0.07, 0.07, 0.01), 0.06);
          for (const s of [-1, 1]) d = Math.min(d, capsule(x, y, z, s * 0.15, yF - 0.08, nz + holeR + 0.12, s * 0.17, yF - 0.6, nz + holeR + 0.14, 0.022));
        }
        if (style === "blazer") {
          const lap = Math.abs(Math.abs(x) - (y - vDepth) * 0.42 - 0.09) - 0.08;
          d = smin(d, smax(shell(x, y, z) - 0.03, Math.max(lap, y - yF - 0.1, vDepth - 0.05 - y, -z), 0.02), 0.02);
        }
        return d;
      };
      region = (x, y, z) => {
        if (hood && z > 0.1 && Math.abs(Math.abs(x) - 0.16) < 0.045 && y < yF - 0.05) return white;
        if (style === "blazer" && z > 0 && Math.abs(x) < (y - vDepth) * 0.42 + 0.05 && y > vDepth - 0.02) return white;
        if (p.outfit.stripes && style === "tee" && Math.sin(y * 18) > 0.35) return 1;
        // Polo placket buttons and a contrast collar band.
        if (collar && z > 0 && Math.abs(x) < 0.035 && (Math.abs(y - yF + 0.16) < 0.035 || Math.abs(y - yF + 0.32) < 0.035)) return white;
        if (collar && y > yF - 0.03) return 1;
        return 0;
      };
    }
  }

  return { sdf, box: { min: [-1.75, BODY_BOTTOM - 0.06, -1.1], max: [1.75, yF + 0.6, 0.95] }, cell, region };
}
