/** Accessories worn over the outfit: scarf, necklace, head tie (gele). */

import type { AvatarParams } from "../params.ts";
import type { Rig } from "../head.ts";
import type { Box } from "../mesher.ts";
import { surfaceZ } from "../mesher.ts";
import { type SDF, ellipsoid, smax, smin, sphere } from "../sdf.ts";
import type { Kit } from "./kit.ts";

/** A knitted scarf wrapped around the neck, with one tail hanging down the front. */
export function scarf(k: Kit, outer: SDF): SDF {
  const tex = (x: number, y: number, z: number) => 0.008 * Math.abs(Math.sin(y * 60 + x * 10));
  const y0 = k.cy - 0.02;
  const tailTop = k.yF - 0.02;
  const tz = (y: number) => surfaceZ(outer, -0.2, y, 1.5, -0.5);
  const zTop = tz(tailTop), zBottom = tz(k.bottom + 0.05);
  return (x, y, z) => {
    // A thick roll around the neck, tilted like the neckline.
    const r = Math.hypot(x, (z - k.nz) * 1.05);
    const roll = Math.hypot((r - (k.holeR + 0.16)) * 0.85, (y - y0 + 0.14 * Math.max(0, (z - k.nz) / k.holeR)) * 0.95) - 0.14 - tex(x, y, z);
    const tail = Math.max(Math.abs(x + 0.24 + (tailTop - y) * 0.06) - 0.15, Math.abs(z - (zTop + (zBottom - zTop) * ((tailTop - y) / (tailTop - k.bottom))) - 0.07) - 0.045, y - tailTop) - tex(x, y, z);
    return smin(roll, tail, 0.06);
  };
}

/** A string of gold beads across the chest with a pendant; its own part so it can be metallic. */
export function necklace(k: Kit, outer: SDF): { sdf: SDF; box: Box; cell: number } {
  const beads: [number, number, number, number][] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 - 1;
    const x = 0.46 * t, y = k.yF + 0.02 - 0.32 * (1 - t * t);
    beads.push([x, y, surfaceZ(outer, x, y, 1.5, -0.5) + 0.018, 0.024]);
  }
  const py = k.yF + 0.02 - 0.32 - 0.07;
  beads.push([0, py, surfaceZ(outer, 0, py, 1.5, -0.5) + 0.03, 0.05]);
  return {
    sdf: (x, y, z) => {
      let d = Infinity;
      for (const [bx, by, bz, r] of beads) d = Math.min(d, sphere(x - bx, y - by, z - bz, r));
      return d;
    },
    box: { min: [-0.6, py - 0.12, -0.2], max: [0.6, k.yF + 0.15, 1.2] },
    cell: 0.011,
  };
}

/** A gele: a band around the head with a tall fan of pleats on top, in the hair's print colors. */
export function headtie(p: AvatarParams, rig: Rig): { sdf: SDF; box: Box; cell: number } {
  const [, , cz] = rig.skullCenter;
  // Fins: thin, tall sheets of stiff fabric, fanned across the front and sides of the crown.
  const fins: { cx: number; cy: number; cz: number; rx: number; rz: number; tx: number; tz: number; h: number; len: number }[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = -1.35 + (i / (n - 1)) * 2.7;
    const rx = Math.sin(a), rz = Math.cos(a);
    const h = 0.42 + 0.2 * Math.cos(a * 1.1);
    fins.push({ cx: rx * 0.42, cy: 1.08 + h * 0.55, cz: cz + rz * 0.32 - 0.12, rx, rz, tx: rz, tz: -rx, h, len: 0.5 });
  }
  return {
    sdf: (x, y, z) => {
      const a = Math.atan2(x, z - cz);
      const fold = 0.025 * Math.sin(a * 6 + y * 6);
      // The band sits on the forehead and drops to the nape, like the headwrap.
      let d = ellipsoid(x, y - 0.5, z - cz, 1.0, 0.88, 1.03) - fold;
      d = smax(d, (-0.25 + 0.7 * (0.5 + 0.5 * Math.cos(a)) - y) * 0.8, 0.08);
      if (y > 0.7) {
        for (const f of fins) {
          const dx = x - f.cx, dy = y - f.cy, dz = z - f.cz;
          const u = dx * f.rx + dz * f.rz, w = dx * f.tx + dz * f.tz;
          // Each fin curls outward at the top.
          const fin = ellipsoid(u - 0.12 * Math.max(0, dy) ** 2, dy, w, f.len, f.h, 0.06);
          d = smin(d, fin, 0.07);
        }
      }
      return d;
    },
    box: { min: [-1.45, -0.35, -1.4], max: [1.45, 2.05, 1.35] },
    cell: 0.022,
  };
}

/** Flat (SVG) versions. */
export const flatScarf = (CX: number, s: number, color: string, shade: string) =>
  `<path d="M${CX - 76} ${s - 30}C${CX - 80} ${s + 10} ${CX + 80} ${s + 10} ${CX + 76} ${s - 30}C${CX + 60} ${s - 4} ${CX - 60} ${s - 4} ${CX - 76} ${s - 30}Z" fill="${color}"/><path d="M${CX - 70} ${s - 6}L${CX - 96} 512H${CX - 30}L${CX - 22} ${s + 8}Z" fill="${color}"/><path d="M${CX - 82} ${s + 60}H${CX - 30}M${CX - 86} ${s + 90}H${CX - 30}M${CX - 90} ${s + 120}H${CX - 30}" stroke="${shade}" stroke-width="3" opacity=".5"/>`;

export const flatNecklace = (CX: number, s: number) => {
  let beads = "";
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * 2 - 1;
    beads += `<circle cx="${CX + 62 * t}" cy="${s + 8 + 40 * (1 - t * t)}" r="4" fill="#e0b85c"/>`;
  }
  return `${beads}<circle cx="${CX}" cy="${s + 58}" r="9" fill="#e0b85c" stroke="#b8902f" stroke-width="2"/>`;
};

export const flatHeadtie = (CX: number, top: number, W: number, print: readonly string[]) => {
  const [a, b, c] = print as [string, string, string];
  let fan = "";
  const n = 9;
  for (let i = 0; i < n; i++) {
    const ang = -1.2 + (i / (n - 1)) * 2.4;
    const x = CX + Math.sin(ang) * W * 0.85, y = top + 6 - Math.cos(ang) * 34;
    fan += `<ellipse cx="${x}" cy="${y}" rx="18" ry="${36 + 10 * Math.cos(ang)}" transform="rotate(${ang * 57.3} ${x} ${y})" fill="${i % 2 ? b : a}" stroke="${c}" stroke-width="3"/>`;
  }
  return `${fan}<path d="M${CX - W - 16} 206C${CX - W - 16} ${top - 4} ${CX + W + 16} ${top - 4} ${CX + W + 16} 206L${CX + W - 2} 206C${CX + W - 6} 166 ${CX + W * 0.5} 156 ${CX} 156C${CX - W * 0.5} 156 ${CX - W + 6} 166 ${CX - W + 2} 206Z" fill="${a}" stroke="${c}" stroke-width="3"/><path d="M${CX - W} 186Q${CX} 160 ${CX + W} 186" fill="none" stroke="${b}" stroke-width="10"/>`;
};
