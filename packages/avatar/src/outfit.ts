/** Tops as signed distance fields offset from the torso, with per-vertex color regions. */

import type { AvatarParams } from "./params.ts";
import { BODY_BOTTOM, SHOULDER_Y, type Rig } from "./head.ts";
import { surfaceZ, type Box } from "./mesher.ts";
import { type SDF, capsule, ellipsoid, noise3, smax, smin, torus } from "./sdf.ts";

export interface OutfitShape {
  sdf: SDF;
  box: Box;
  cell: number;
  /** Palette entry for a surface point: 0 = main, 1 = accent, 2 = white detail. */
  region: (x: number, y: number, z: number) => number;
}

export function buildOutfit(p: AvatarParams, rig: Rig): OutfitShape {
  const style = p.outfit.style;
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
    case "suit": {
      // Three layers: a white shirt with a collar, a tie down its front, and a jacket with a deep V and lapels.
      const shirt = (x: number, y: number, z: number) => rig.torso(x, y, z) - 0.045;
      const jacketShell = (x: number, y: number, z: number) =>
        rig.torso(x, y, z) - 0.095 - 0.012 * noise3(x * 2.2, y * 3.5, z * 2.2); // gentle fabric folds
      const top = yF + 0.02, vBottom = yF - 0.95;
      const edge = (y: number) => 0.05 + (y - vBottom) * 0.36; // half-width of the V opening
      // The shirt front, measured once, so the tie can lie on it.
      const front: number[] = [];
      for (let i = 0; i <= 120; i++) front.push(surfaceZ(shirt, 0, top - i * 0.01, 1.5, -0.5));
      const frontZ = (y: number) => {
        const f = Math.min(119.999, Math.max(0, (top - y) / 0.01)), i = Math.floor(f);
        return front[i]! + (front[i + 1]! - front[i]!) * (f - i);
      };
      const knotY = yF - 0.07, knotZ = frontZ(knotY) + 0.06;
      const tie = (x: number, y: number, z: number) => {
        const knot = ellipsoid(x, y - knotY, z - knotZ, 0.085 - 0.25 * Math.max(0, knotY - y), 0.085, 0.06);
        if (y > knotY + 0.02) return knot;
        // A blade that widens down the chest, lying 3 cm proud of the shirt so it reads as its own layer.
        const w = 0.075 + (knotY - y) * 0.09;
        const blade = Math.max(Math.abs(x) - w, Math.abs(z - frontZ(y) - 0.04) - 0.028, y - knotY + 0.04);
        return smin(knot, blade, 0.04);
      };
      const collar = (x: number, y: number, z: number) => {
        // A band around the neck that drops at the front into two points either side of the knot.
        const r = Math.hypot(x, z - nz);
        const band = Math.abs(r - (nr + 0.06)) - 0.03;
        const frontness = Math.max(0, (z - nz) / (nr + 0.06));
        const low = cy - 0.08 - 0.2 * frontness * frontness, high = cy + 0.2 - 0.08 * frontness;
        let d = smax(band, Math.max(low - y, y - high), 0.02);
        // Collar points: flat wings lying on the shirt, pointing down and out from the knot.
        const ax = Math.abs(x);
        const wing = Math.max(Math.abs(z - frontZ(y) - 0.03) - 0.025, ax - 0.05 - (top - y) * 0.7, 0.03 - ax + (top - y) * 0.15, y - top - 0.02, knotY - 0.2 - y);
        d = Math.min(d, wing);
        return smax(d, 0.03 - ax, 0.01); // gap for the knot
      };
      const jacket = (x: number, y: number, z: number) => {
        let d = jacketShell(x, y, z);
        const ax = Math.abs(x);
        // Open V at the front, down to the button.
        const opening = Math.max(ax - edge(y), vBottom - y, 0.05 - z);
        d = smax(d, -opening, 0.045);
        // Lapels: raised strips along the V edge, with a notch where they meet the collar.
        const lapel = Math.max(Math.abs(ax - edge(y) - 0.13) - 0.13, vBottom - 0.02 - y, y - top - 0.06, -z);
        const notch = Math.abs(y - (yF - 0.28)) - 0.025 + (ax - edge(y) - 0.16) * 0.2;
        const raised = smax(jacketShell(x, y, z) - 0.045, Math.max(lapel, -notch), 0.022);
        d = smin(d, raised, 0.022);
        // Hollow the neck so the jacket sits behind the shirt collar.
        return smax(d, -neckHole(x, y, z, holeR + 0.05), 0.03);
      };
      const buttonY = vBottom - 0.1;
      const button = (x: number, y: number, z: number) => ellipsoid(x, y - buttonY, z - surfaceZ(jacketShell, 0, buttonY, 1.5, -0.5) - 0.005, 0.035, 0.035, 0.018);
      const shirtFront = (x: number, y: number, z: number) => smax(shirt(x, y, z), -neckHole(x, y, z, holeR - 0.01), 0.02);
      sdf = (x, y, z) => Math.min(jacket(x, y, z), shirtFront(x, y, z), tie(x, y, z), collar(x, y, z), button(x, y, z));
      region = (x, y, z) => {
        // The tie and buttons win wherever the surface is on them, so their edges stay clean.
        if (tie(x, y, z) < 0.012 || button(x, y, z) < 0.01) return 1;
        return Math.abs(Math.min(shirtFront(x, y, z), collar(x, y, z))) < Math.abs(jacket(x, y, z)) ? white : 0;
      };
      cell = 0.02;
      break;
    }
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
