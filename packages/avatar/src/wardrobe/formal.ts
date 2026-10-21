/** Formal tops: suit and tie, blouse with a bow, wrap top, shirt with a bow tie. */

import type { Garment, Kit } from "./kit.ts";
import type { SDF } from "../sdf.ts";
import { ellipsoid, folds, lapels, placket, shirtCollar, smax, smin, union, vOpening } from "./parts.ts";

const WHITE = "#f4f1ea";

/** `#rrggbb` scaled toward black (in sRGB, close enough for cloth). */
const deep = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};

/** A white shirt under a jacket: the layer, its collar and its front, with the neck cut out. */
function shirtLayer(k: Kit) {
  const shirt: SDF = (x, y, z) => k.shell(x, y, z, 0.045);
  const front: SDF = (x, y, z) => smax(shirt(x, y, z), -k.neckHole(x, y, z, k.holeR - 0.01), 0.02);
  return { shirt, front, collar: shirtCollar(k, shirt) };
}

/** A knotted necktie lying on `layer`. */
function necktie(k: Kit, layer: SDF): SDF {
  const fz = k.frontZ(layer, k.yF + 0.02);
  const knotY = k.yF - 0.07, knotZ = fz(knotY) + 0.06;
  return (x, y, z) => {
    const knot = ellipsoid(x, y - knotY, z - knotZ, 0.085 - 0.25 * Math.max(0, knotY - y), 0.085, 0.06);
    if (y > knotY + 0.02) return knot;
    const w = 0.075 + (knotY - y) * 0.09;
    const blade = Math.max(Math.abs(x) - w, Math.abs(z - fz(y) - 0.04) - 0.028, y - knotY + 0.04);
    return smin(knot, blade, 0.04);
  };
}

/** A bow at the collar: two loops and a knot (or tails for a blouse bow). */
function bow(k: Kit, layer: SDF, size: number, tails: boolean): SDF {
  const fz = k.frontZ(layer, k.yF + 0.02);
  const y0 = k.yF - 0.05, z0 = fz(y0) + 0.05;
  return (x, y, z) => {
    const ax = Math.abs(x);
    // Loops flare out from the knot and are pinched in the middle.
    const loop = ellipsoid(ax - 0.11 * size, (y - y0) * (1 + 0.8 * Math.max(0, 0.12 * size - ax) / (0.12 * size)), z - z0, 0.11 * size, 0.065 * size, 0.035);
    let d = smin(loop, ellipsoid(x, y - y0, z - z0 - 0.01, 0.035 * size, 0.045 * size, 0.04), 0.02);
    if (tails) {
      const tail = Math.max(Math.abs(ax - 0.05 - (y0 - y) * 0.25) - 0.035, Math.abs(z - fz(y) - 0.03) - 0.018, y - y0, y0 - 0.45 - y);
      d = smin(d, tail, 0.02);
    }
    return d;
  };
}

export const suit: Garment = {
  build: (p, k) => {
    const { front, collar } = shirtLayer(k);
    const tie = necktie(k, (x, y, z) => k.shell(x, y, z, 0.045));
    const jacketShell: SDF = (x, y, z) => k.shell(x, y, z, 0.095 + folds(x, y, z));
    const top = k.yF + 0.02, vBottom = k.yF - 0.95;
    const edge = (y: number) => 0.05 + (y - vBottom) * 0.36;
    const raised = lapels(k, jacketShell, edge, vBottom, k.yF - 0.28);
    const jacket: SDF = (x, y, z) => {
      let d = smax(jacketShell(x, y, z), -vOpening(vBottom, 0.36, 0.05)(x, y, z), 0.045);
      d = smin(d, raised(x, y, z), 0.022);
      return smax(d, -k.neckHole(x, y, z, k.holeR + 0.05), 0.03);
    };
    const button = k.button(jacketShell, 0, vBottom - 0.1, 0.035);
    void top;
    return {
      sdf: union(jacket, front, tie, collar, button),
      region: (x, y, z) => {
        if (tie(x, y, z) < 0.012 || button(x, y, z) < 0.01) return 1;
        return Math.abs(Math.min(front(x, y, z), collar(x, y, z))) < Math.abs(jacket(x, y, z)) ? 2 : 0;
      },
      main: deep(p.outfit.color, 0.55),
      cell: 0.02,
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const tie = f.mix(f.accent, "#000000", 0.25);
    const jacket = f.mix(f.color, "#000000", 0.45);
    return {
      body: `<path d="M28 512C28 440 70 ${s} 150 ${s - 4}L362 ${s - 4}C442 ${s} 484 440 484 512Z" fill="${jacket}"/><path d="M${CX - 58} ${s - 5}L${CX} ${s + 140}L${CX + 58} ${s - 5}Z" fill="${WHITE}"/><path d="M${CX - 16} ${s + 22}L${CX - 20} ${s + 120}L${CX} ${s + 140}L${CX + 20} ${s + 120}L${CX + 16} ${s + 22}Z" fill="${f.accent}"/><path d="M${CX - 13} ${s + 6}H${CX + 13}L${CX + 16} ${s + 24}H${CX - 16}Z" fill="${tie}"/><path d="M${CX - 40} ${s - 8}L${CX - 6} ${s + 8}L${CX - 22} ${s + 34}ZM${CX + 40} ${s - 8}L${CX + 6} ${s + 8}L${CX + 22} ${s + 34}Z" fill="#ffffff" stroke="#d9d3c7" stroke-width="2" stroke-linejoin="round"/><path d="M${CX - 60} ${s - 8}L${CX - 34} ${s + 56}L${CX - 54} ${s + 62}L${CX - 6} ${s + 150}L${CX - 6} 512L${CX - 100} 512L${CX - 100} ${s + 10}ZM${CX + 60} ${s - 8}L${CX + 34} ${s + 56}L${CX + 54} ${s + 62}L${CX + 6} ${s + 150}L${CX + 6} 512L${CX + 100} 512L${CX + 100} ${s + 10}Z" fill="${f.mix(jacket, "#000000", 0.3)}" opacity=".6"/><circle cx="${CX}" cy="${s + 162}" r="5" fill="${f.accent}"/>`,
    };
  },
};

export const blouse: Garment = {
  build: (p, k) => {
    // Soft gathers falling from the neckline.
    const silk: SDF = (x, y, z) => k.shell(x, y, z, 0.055 + 0.008 * Math.sin(x * 18) * Math.max(0, Math.min(1, (k.yF - y) * 2)));
    const body: SDF = (x, y, z) => smin(smax(silk(x, y, z), -k.neckHole(x, y, z, k.holeR), 0.03), k.ring(x, y, z, k.holeR + 0.01, 0.025), 0.02);
    const tie = bow(k, silk, 1.45, true);
    return { sdf: union(body, tie), region: (x, y, z) => (tie(x, y, z) < 0.012 ? 1 : 0) };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const y = s + 10;
    return {
      body: `<path d="M${CX - 46} ${s - 5}Q${CX} ${s + 36} ${CX + 46} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 48} ${s - 6}Q${CX} ${s + 38} ${CX + 48} ${s - 6}" fill="none" stroke="${f.shade}" stroke-width="5"/><path d="M${CX - 6} ${y + 6}L${CX - 26} ${y + 70}L${CX - 12} ${y + 72}L${CX} ${y + 12}L${CX + 12} ${y + 72}L${CX + 26} ${y + 70}L${CX + 6} ${y + 6}Z" fill="${f.accent}"/><path d="M${CX} ${y}C${CX - 18} ${y - 22} ${CX - 50} ${y - 10} ${CX - 44} ${y + 8}C${CX - 38} ${y + 26} ${CX - 14} ${y + 14} ${CX} ${y}C${CX + 14} ${y + 14} ${CX + 38} ${y + 26} ${CX + 44} ${y + 8}C${CX + 50} ${y - 10} ${CX + 18} ${y - 22} ${CX} ${y}Z" fill="${f.accent}"/><circle cx="${CX}" cy="${y + 2}" r="9" fill="${f.mix(f.accent, "#000000", 0.2)}"/>`,
    };
  },
};

export const wrap: Garment = {
  build: (p, k) => {
    const fabric: SDF = (x, y, z) => k.shell(x, y, z, 0.055 + folds(x, y, z, 0.008));
    // Two panels cross at the front: each edge runs from the far side of the neck diagonally down.
    const slope = 0.75;
    const rightEdge = (y: number) => k.holeR - (k.yF - y) * slope;
    const leftEdge = (y: number) => -k.holeR + (k.yF - y) * slope;
    const opening = (x: number, y: number, z: number) => Math.max(leftEdge(y) - x, x - rightEdge(y), 0.05 - z);
    const base: SDF = (x, y, z) => smax(smax(fabric(x, y, z), -opening(x, y, z), 0.03), -k.neckHole(x, y, z, k.holeR), 0.03);
    // The right panel lies on top of the left, so its edge stands proud.
    const panel: SDF = (x, y, z) => smax(base(x, y, z) - 0.02, Math.max(rightEdge(y) - x, -z), 0.012);
    return { sdf: union(base, panel), region: () => 0 };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    return {
      body: `<path d="M${CX - 52} ${s - 5}L${CX} ${s + 84}L${CX + 52} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX + 52} ${s - 5}L${CX - 24} ${s + 110}L${CX - 120} 512H484C484 440 442 ${s} 362 ${s - 4}Z" fill="${f.color}"/><path d="M${CX + 52} ${s - 5}L${CX - 24} ${s + 110}L${CX - 120} 512" fill="none" stroke="${f.shade}" stroke-width="5"/><path d="M${CX - 52} ${s - 5}L${CX} ${s + 84}" stroke="${f.shade}" stroke-width="5"/>`,
    };
  },
};

export const bowtie: Garment = {
  build: (p, k) => {
    const { shirt } = shirtLayer(k);
    const body: SDF = (x, y, z) => smax(shirt(x, y, z), -k.neckHole(x, y, z, k.holeR - 0.02), 0.02);
    const collar = shirtCollar(k, shirt, 0.025);
    const strip = placket(k, shirt, k.yF - 0.12);
    const tie = bow(k, shirt, 1.35, false);
    const studs = union(...[0.3, 0.46, 0.62].map((dy) => k.button(shirt, 0, k.yF - dy, 0.022)));
    return {
      sdf: union(body, collar, strip, tie, studs),
      region: (x, y, z) => (tie(x, y, z) < 0.012 || studs(x, y, z) < 0.008 ? 1 : 0),
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const y = s + 6;
    return {
      body: `<path d="M${CX - 50} ${s - 10}L${CX - 4} ${s + 4}L${CX - 22} ${s + 40}ZM${CX + 50} ${s - 10}L${CX + 4} ${s + 4}L${CX + 22} ${s + 40}Z" fill="#ffffff" stroke="#d9d3c7" stroke-width="2" stroke-linejoin="round"/><path d="M${CX} ${s + 30}V512" stroke="#d9d3c7" stroke-width="3"/><path d="M${CX} ${y}L${CX - 34} ${y - 16}L${CX - 34} ${y + 16}ZM${CX} ${y}L${CX + 34} ${y - 16}L${CX + 34} ${y + 16}Z" fill="${f.accent}" stroke-linejoin="round"/><circle cx="${CX}" cy="${y}" r="8" fill="${f.mix(f.accent, "#000000", 0.25)}"/>${[56, 92, 128].map((dy) => `<circle cx="${CX}" cy="${s + dy}" r="4" fill="${f.accent}"/>`).join("")}`,
    };
  },
};
