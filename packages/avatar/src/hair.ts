/** Hairstyles and facial hair as signed distance fields built around the rig. */

import { Random } from "@zuri/core/random";
import type { AvatarParams, HairStyle } from "./params.ts";
import type { Rig } from "./head.ts";
import { surfaceZ, type Box } from "./mesher.ts";
import { browCurve } from "./face.ts";
import { type SDF, capsule, ellipsoid, noise3, roundBox, smax, smin, sphere, torus } from "./sdf.ts";

export interface HairShape {
  sdf: SDF;
  box: Box;
  cell: number;
  /** Paint the hair with a woven print instead of a flat color (headwraps). */
  print?: boolean;
}

interface Hairline {
  front: number;
  side: number;
  back: number;
  sideburn: number;
}

const BOX_HEAD: Box = { min: [-1.35, -0.75, -1.35], max: [1.35, 1.65, 1.35] };

type HairTexture = "fine" | "straight" | "curly" | "coily";

/** Texture displacement per hair type. Positive values push the surface out. */
function softTexture(kind: HairTexture, x: number, y: number, z: number): number {
  switch (kind) {
    case "fine":
      return 0.004 * noise3(x * 30, y * 30, z * 30);
    case "straight": {
      const a = Math.atan2(x, z);
      return 0.011 * Math.sin(a * 26 + 2 * noise3(x * 2, y * 2, z * 2)) + 0.006 * Math.sin(a * 57 + y * 3);
    }
    case "curly":
      return 0.045 * noise3(x * 6, y * 6, z * 6) + 0.015 * noise3(x * 15, y * 15, z * 15);
    case "coily":
      return 0.03 * Math.abs(noise3(x * 8, y * 8, z * 8)) + 0.014 * noise3(x * 20, y * 20, z * 20);
  }
}

/** Integer hash -> [0, 1). */
function hash3(i: number, j: number, k: number, salt: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647) ^ Math.imul(salt, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Packed round domes (cellular noise): 0 between clumps, 1 at a clump's center. */
function clumps(x: number, y: number, z: number, scale: number): number {
  x *= scale; y *= scale; z *= scale;
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        const cx = xi + i, cy = yi + j, cz = zi + k;
        const dx = cx + hash3(cx, cy, cz, 1) - x, dy = cy + hash3(cx, cy, cz, 2) - y, dz = cz + hash3(cx, cy, cz, 3) - z;
        best = Math.min(best, dx * dx + dy * dy + dz * dz);
      }
  const R = 0.62;
  return Math.sqrt(Math.max(0, R * R - best)) / R;
}

/** Toon hair is sculpted: chunky carved strands and big smooth clumps instead of fine detail. */
function toonTexture(kind: HairTexture, x: number, y: number, z: number): number {
  switch (kind) {
    case "fine":
      return 0;
    case "straight": {
      const a = Math.atan2(x, z);
      // Rounded ridges with crisp grooves between them, like carved clay.
      return 0.032 * Math.sqrt(Math.abs(Math.sin(a * 9 + 1.6 * noise3(x * 1.5, y * 1.5, z * 1.5)))) - 0.016;
    }
    case "curly":
      return 0.09 * clumps(x, y, z, 3.2) - 0.04;
    case "coily":
      return 0.08 * clumps(x, y, z, 4.6) - 0.037;
  }
}

export function buildHair(p: AvatarParams, rig: Rig): HairShape | null {
  const style: HairStyle = p.hair.style;
  if (style === "none") return null;
  const texture = rig.style === "toon" ? toonTexture : softTexture;
  const v = p.hair.volume;
  const [cx, cy, cz] = rig.skullCenter;
  const masc = p.presentation === "masculine";
  const rng = new Random(`${p.seed}/hair`);

  const line: Hairline = { front: 0.6, side: 0.3, back: -0.5, sideburn: masc ? 0.35 : 0.12 };
  const hairline = (x: number, y: number, z: number) => {
    const a = Math.atan2(x, z - cz);
    const c = Math.cos(a);
    let h = c > 0 ? line.side + (line.front - line.side) * c * c : line.side + (line.side - line.back) * c;
    // Sideburns just in front of the ears.
    const sb = Math.abs(a) - 1.22;
    h -= line.sideburn * Math.exp(-(sb * sb) / 0.012);
    return (h - y) * 0.8;
  };
  /** Scalp-hugging cap of thickness t. */
  const cap = (x: number, y: number, z: number, t: number, tex: number) =>
    smax(rig.skull(x, y, z) - t - tex, hairline(x, y, z), 0.05);
  /** Space in front of the face that long hair must not enter. */
  const faceZone = (x: number, y: number, z: number) => ellipsoid(x, y + 0.45, z - 1.0, 0.74, 1.25, 0.95);

  const box = (min: Box["min"], max: Box["max"]): Box => ({ min, max });
  const tex = p.hair.texture === "coily" ? "coily" : p.hair.texture === "curly" ? "curly" : "straight";

  switch (style) {
    case "buzz":
      line.sideburn *= 0.6;
      return { sdf: (x, y, z) => cap(x, y, z, 0.022, texture("fine", x, y, z)), box: BOX_HEAD, cell: 0.025 };

    case "crop": {
      line.front = 0.62;
      const t = tex === "straight" ? "straight" : "curly";
      return {
        sdf: (x, y, z) => {
          const tx = texture(t, x, y, z) * (t === "curly" ? 0.5 : 1);
          let d = cap(x, y, z, 0.05, tx);
          // Volume on top, swept forward.
          d = smin(d, ellipsoid(x, y - 0.78, z - 0.12, 0.72 * v, 0.34 * v, 0.82) - tx, 0.22);
          return smax(d, hairline(x, y, z) - 0.02, 0.04);
        },
        box: BOX_HEAD,
        cell: 0.026,
      };
    }

    case "fade":
      line.sideburn = 0.2;
      return {
        sdf: (x, y, z) => {
          const tx = texture("coily", x, y, z) * 0.4;
          let d = cap(x, y, z, 0.018, 0);
          const top = smax(ellipsoid(x, y - 0.68, z, 0.8 * v, 0.48 * v, 0.88) - tx, hairline(x, y, z) - 0.06, 0.05);
          d = smin(d, top, 0.12);
          return d;
        },
        box: BOX_HEAD,
        cell: 0.026,
      };

    case "hightop":
      line.sideburn = 0.15;
      return {
        sdf: (x, y, z) => {
          const tx = texture("coily", x, y, z) * 0.5;
          let d = cap(x, y, z, 0.018, 0);
          const top = roundBox(x, y - 0.95, z + 0.03, 0.74 * v, 0.62 * v, 0.8, 0.28) - tx;
          d = smin(d, smax(top, hairline(x, y, z) - 0.08, 0.05), 0.15);
          return d;
        },
        box: { min: [-1.3, -0.75, -1.3], max: [1.3, 1.95, 1.3] },
        cell: 0.026,
      };

    case "afro":
      line.front = 0.74; line.side = 0.0; line.back = -0.7; line.sideburn = 0.05;
      return {
        sdf: (x, y, z) => {
          const tx = texture("coily", x, y, z);
          let d = sphere(x, y - 0.42, z + 0.12, 1.3 * v) - tx;
          d = smin(d, cap(x, y, z, 0.05, 0), 0.3);
          return smax(d, hairline(x, y, z), 0.08);
        },
        box: { min: [-1.65, -0.9, -1.7], max: [1.65, 1.95, 1.4] },
        cell: 0.03,
      };

    case "puffs":
      line.sideburn = 0.05;
      return {
        sdf: (x, y, z) => {
          const tx = texture("coily", x, y, z);
          let d = cap(x, y, z, 0.035, texture("coily", x, y, z) * 0.35);
          d = smin(d, sphere(Math.abs(x) - 0.72, y - 0.95, z + 0.2, 0.48 * v) - tx, 0.12);
          return d;
        },
        box: { min: [-1.45, -0.75, -1.35], max: [1.45, 1.75, 1.35] },
        cell: 0.026,
      };

    case "bun":
      line.sideburn = 0.05;
      return {
        sdf: (x, y, z) => {
          const t = tex === "coily" ? texture("coily", x, y, z) * 0.6 : texture("straight", x, y, z) * 0.5;
          let d = cap(x, y, z, 0.045, t);
          d = smin(d, sphere(x, y - 1.05, z + 0.42, 0.42 * v) - t, 0.12);
          return d;
        },
        box: { min: [-1.3, -0.75, -1.35], max: [1.3, 1.65, 1.35] },
        cell: 0.026,
      };

    case "ponytail":
      line.sideburn = 0.05;
      return {
        sdf: (x, y, z) => {
          const t = texture(tex === "straight" ? "straight" : "curly", x, y, z) * 0.6;
          let d = cap(x, y, z, 0.045, t);
          d = smin(d, capsule(x, y, z, 0, 0.55, -1.0, 0, -0.95, -1.18, 0.22 * v, 0.1) - t, 0.1);
          // Hair tie.
          return Math.min(d, torus(x, (y - 0.5) * 0.2 + (z + 1.0) * 0.98, (z + 1.0) * 0.2 - (y - 0.5) * 0.98, 0.17 * v, 0.035));
        },
        box: { min: [-1.3, -1.3, -1.6], max: [1.3, 1.5, 1.35] },
        cell: 0.026,
      };

    case "cornrows":
      line.sideburn = 0.05;
      return {
        sdf: (x, y, z) => {
          const u = x + 0.08 * Math.sin(z * 3);
          const ridge = 0.022 * Math.abs(Math.cos(u * 13)) + 0.006 * Math.sin((y + z) * 60);
          return cap(x, y, z, 0.02, ridge);
        },
        box: BOX_HEAD,
        cell: 0.024,
      };

    case "curly": {
      line.front = masc ? 0.6 : 0.5; line.side = masc ? 0.25 : -0.15;
      const length = masc ? 0 : 0.6;
      return {
        sdf: (x, y, z) => {
          const tx = texture(p.hair.texture === "coily" ? "coily" : "curly", x, y, z);
          let d = ellipsoid(x, y - 0.3 + length * 0.4, z + 0.12, 1.08 * v, 1.08 + length * 0.5, 1.1) - tx;
          if (!masc) d = smax(d, faceZone(x, y, z) * -1, 0.1);
          d = smax(d, hairline(x, y, z), 0.12);
          d = smin(d, cap(x, y, z, 0.06, tx * 0.5), 0.15);
          return d;
        },
        box: { min: [-1.5, -1.6, -1.6], max: [1.5, 1.7, 1.45] },
        cell: 0.03,
      };
    }

    case "long":
    case "bob": {
      const bob = style === "bob";
      line.sideburn = 0.02;
      const bottom = bob ? -0.72 : -1.75;
      const bangs = rng.next() < (bob ? 0.6 : 0.3);
      const part = rng.range(-0.25, 0.25);
      return {
        sdf: (x, y, z) => {
          const tx = texture(p.hair.texture === "curly" ? "curly" : "straight", x, y, z) * (p.hair.texture === "curly" ? 0.6 : 1);
          let d = cap(x, y, z, 0.07, tx);
          // A shell around the skull that falls past the face, then trimmed.
          let fall = ellipsoid(x, y - 0.1, z + 0.12, 1.02 * v, 1.12, 1.06) - tx;
          fall = smin(fall, capsule(x, y, z, 0, 0.0, -0.35, 0, bottom + 0.3, -0.45, 0.82 * v, bob ? 0.82 : 0.7) - tx, 0.3);
          fall = smax(fall, bottom - y, 0.06);
          fall = smax(fall, -faceZone(x, y, z), 0.1);
          d = smin(d, smax(fall, -rig.torso(x, y, z), 0.05), 0.08);
          if (bangs) d = smin(d, ellipsoid(x - part * 0.3, y - 0.62, z - 0.62, 0.62, 0.22, 0.32) - tx, 0.12);
          // Center or side part.
          d += 0.03 * Math.exp(-((x - part) ** 2) / 0.002) * (y > 0.6 && z > -0.4 ? 1 : 0);
          return d;
        },
        box: { min: [-1.45, bottom - 0.15, -1.6], max: [1.45, 1.4, 1.4] },
        cell: 0.028,
      };
    }

    case "locs":
    case "braids": {
      const braids = style === "braids";
      type V = [number, number, number];
      const strands: { a: V; b: V; c: V; r: number; lo: V; hi: V }[] = [];
      const n = braids ? 46 : 30;
      const len = braids ? rng.range(1.9, 2.3) : rng.range(1.2, 1.7);
      for (let i = 0; i < n; i++) {
        // Roots around the sides and back of the scalp; none over the face.
        const a = (i / n) * Math.PI * 1.55 + Math.PI * 0.225 + rng.gaussian(0, 0.03);
        const sx = Math.sin(a), sz = Math.cos(a);
        const rootY = 0.35 + rng.range(-0.1, 0.35);
        const R = 0.9;
        const root: [number, number, number] = [sx * R * 0.92, rootY, cz + sz * R];
        const out = 0.25 + rng.range(0, 0.2);
        const mid: [number, number, number] = [sx * (R + out), rootY - 0.6, cz + sz * (R + out) - 0.05];
        const tip: [number, number, number] = [sx * (R + out * 1.2) + rng.gaussian(0, 0.05), rootY - len, cz + sz * (R + out) - 0.15];
        // Strands that would fall across the face are pushed back.
        if (sz > 0.3) { mid[2] -= 0.35; tip[2] -= 0.55; mid[0] += sx * 0.2; tip[0] += sx * 0.25; }
        const r = braids ? 0.055 : 0.075;
        const pad = r + 0.12;
        strands.push({
          a: root, b: mid, c: tip, r,
          lo: [0, 1, 2].map((i) => Math.min(root[i]!, mid[i]!, tip[i]!) - pad) as [number, number, number],
          hi: [0, 1, 2].map((i) => Math.max(root[i]!, mid[i]!, tip[i]!) + pad) as [number, number, number],
        });
      }
      return {
        sdf: (x, y, z) => {
          let d = cap(x, y, z, braids ? 0.03 : 0.05, braids ? texture("fine", x, y, z) : texture("coily", x, y, z) * 0.4);
          // Only strands near the point matter.
          let strand = Infinity;
          for (const s of strands) {
            if (x < s.lo[0] || x > s.hi[0] || y < s.lo[1] || y > s.hi[1] || z < s.lo[2] || z > s.hi[2]) {
              // Outside the strand's padded bounds: a cheap lower bound is enough.
              strand = Math.min(strand, 0.12);
              continue;
            }
            const s1 = capsule(x, y, z, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.r);
            const s2 = capsule(x, y, z, s.b[0], s.b[1], s.b[2], s.c[0], s.c[1], s.c[2], s.r, s.r * 0.8);
            strand = smin(strand, smin(s1, s2, 0.04), 0.03);
          }
          if (strand < 0.1) strand += braids ? 0.012 * Math.abs(Math.sin(y * 45)) : 0.01 * noise3(x * 14, y * 14, z * 14);
          return smin(d, strand, 0.06);
        },
        box: { min: [-1.7, 0.35 - len - 0.6, -1.7], max: [1.7, 1.45, 1.35] },
        cell: 0.025,
      };
    }

    case "headwrap":
      return {
        sdf: (x, y, z) => {
          const a = Math.atan2(x, z - cz);
          const fold = 0.035 * Math.sin(a * 5 + y * 5) + 0.02 * Math.sin(a * 11 - y * 7);
          let d = ellipsoid(x, y - 0.45, z - cz - 0.0, 1.0, 0.92, 1.04) - fold;
          d = smin(d, ellipsoid(x, y - 1.15, z + 0.2, 0.75, 0.55, 0.85) - fold, 0.25);
          d = smin(d, sphere(x, y - 1.2, z - 0.55, 0.26), 0.12);
          // Sits on the forehead in front and drops to the nape behind.
          const edge = -0.3 + 0.72 * (0.5 + 0.5 * Math.cos(a));
          return smax(d, (edge - y) * 0.8, 0.08);
        },
        box: { min: [-1.3, -0.4, -1.4], max: [1.3, 1.85, 1.3] },
        cell: 0.026,
        print: true,
      };
  }
  return null;
}

/** Sculpted brows for the toon style: a tapered tube along the brow curve, half sunk into the skin. */
export function buildBrows(p: AvatarParams, rig: Rig): HairShape {
  type Seg = { a: [number, number, number]; b: [number, number, number]; ra: number; rb: number };
  const segs: Seg[] = [];
  const t = p.brows.thickness;
  for (const s of [-1, 1]) {
    const { inner, middle, outer } = browCurve(p, rig, s);
    const pts: [number, number, number][] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const f = i / n, g = 1 - f;
      // Quadratic Bezier, matching the painted brow's outline.
      const x = g * g * inner[0] + 2 * g * f * middle[0] + f * f * outer[0];
      const y = g * g * inner[1] + 2 * g * f * middle[1] + f * f * outer[1];
      pts.push([x, y, surfaceZ(rig.face, x, y) - 0.012]);
    }
    for (let i = 0; i < n; i++) {
      const r = (f: number) => (0.045 - 0.025 * f) * t;
      segs.push({ a: pts[i]!, b: pts[i + 1]!, ra: r(i / n), rb: r((i + 1) / n) });
    }
  }
  const tex = (x: number, y: number, z: number) => 0.004 * noise3(x * 40, y * 40, z * 40);
  return {
    sdf: (x, y, z) => {
      let d = Infinity;
      for (const g of segs) d = Math.min(d, capsule(x, y, z, g.a[0], g.a[1], g.a[2], g.b[0], g.b[1], g.b[2], g.ra, g.rb));
      return d - tex(x, y, z);
    },
    box: { min: [-0.8, rig.browY - 0.25, 0.2], max: [0.8, rig.browY + 0.35, 1.3] },
    cell: 0.012,
  };
}

/** Beard, goatee or mustache volumes hugging the lower face. Stubble is painted, not modeled. */
export function buildFacialHair(p: AvatarParams, rig: Rig): HairShape | null {
  const kind = p.facialHair;
  if (kind === "none" || kind === "stubble") return null;
  const { y: my, z: mz, w: mw } = rig.mouth;
  const mouthHole = (x: number, y: number, z: number) => ellipsoid(x, y - my + 0.02, z - mz - 0.05, mw * 1.25, 0.075, 0.2);
  const tex = (x: number, y: number, z: number) => 0.015 * noise3(x * 14, y * 14, z * 14) + 0.008 * noise3(x * 30, y * 30, z * 30);
  const mustache = (x: number, y: number, z: number) =>
    // Mirrored: a tapered bar from the mouth corner up to the philtrum.
    capsule(Math.abs(x), y, z, mw * 1.0, my + 0.02, mz - 0.07, 0, my + 0.1, mz - 0.02, 0.025, 0.05) - tex(x, y, z) * 0.5;

  let sdf: SDF;
  if (kind === "mustache") sdf = (x, y, z) => smax(mustache(x, y, z), -(y - my - 0.13), 0.02);
  else if (kind === "goatee")
    sdf = (x, y, z) => {
      let d = smax(rig.face(x, y, z) - 0.06 - tex(x, y, z), ellipsoid(x, y - my + 0.29, z - 0.4, 0.26, 0.32, 0.6), 0.04);
      d = smax(d, -mouthHole(x, y, z), 0.03);
      return smin(d, mustache(x, y, z), 0.04);
    };
  else
    sdf = (x, y, z) => {
      // Covers the jaw below the cheekbones, in front of the ears.
      // Below the cheekbones, in front of the ears, thickest at the chin.
      const region = Math.max(y - my - 0.03 + 0.12 * Math.abs(x) - 0.25 * x * x, -z - 0.05 + (y < my - 0.32 ? -1 : 0), Math.abs(x) - 0.84);
      // Thin at the cheek line, fuller at the chin.
      const t = 0.015 + 0.07 * Math.min(1, Math.max(0, (my + 0.03 - y) / 0.45));
      let d = smax(rig.face(x, y, z) - t - tex(x, y, z) * 0.6, region, 0.06);
      d = smax(d, -mouthHole(x, y, z), 0.04);
      return smin(d, mustache(x, y, z), 0.05);
    };
  return { sdf, box: { min: [-1.15, -1.6, -0.6], max: [1.15, -0.1, 1.35] }, cell: 0.024 };
}
