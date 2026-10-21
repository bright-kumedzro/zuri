/** Work wear: lab coat, scrubs, chef's jacket. */

import type { Garment } from "./kit.ts";
import type { SDF } from "../sdf.ts";
import { folds, lapels, pocket, shirtCollar, smax, smin, union, vOpening } from "./parts.ts";

export const labcoat: Garment = {
  build: (p, k) => {
    // A colored shirt underneath, then an open white coat with notched lapels and a breast pocket with a pen.
    const shirt: SDF = (x, y, z) => k.shell(x, y, z, 0.045);
    const shirtFront: SDF = (x, y, z) => smax(shirt(x, y, z), -k.neckHole(x, y, z, k.holeR - 0.01), 0.02);
    const collar = shirtCollar(k, shirt);
    const coatShell: SDF = (x, y, z) => k.shell(x, y, z, 0.1 + folds(x, y, z, 0.01));
    const vBottom = k.yF - 1.0;
    const edge = (y: number) => 0.06 + (y - vBottom) * 0.34;
    const raised = lapels(k, coatShell, edge, vBottom, k.yF - 0.26);
    const coat: SDF = (x, y, z) => {
      let d = smax(coatShell(x, y, z), -vOpening(vBottom, 0.34, 0.06)(x, y, z), 0.045);
      d = smin(d, raised(x, y, z), 0.022);
      return smax(d, -k.neckHole(x, y, z, k.holeR + 0.05), 0.03);
    };
    const chest = pocket(coatShell, -0.55, k.yF - 0.5, 0.15, 0.11, 0.02);
    const pen: SDF = (x, y, z) => smax(coatShell(x, y, z) - 0.035, Math.max(Math.abs(x + 0.5) - 0.018, Math.abs(y - (k.yF - 0.38)) - 0.1), 0.01);
    return {
      sdf: union(coat, shirtFront, collar, chest, pen),
      region: (x, y, z) => {
        if (pen(x, y, z) < 0.01) return 2;
        return Math.abs(Math.min(shirtFront(x, y, z), collar(x, y, z))) < Math.abs(Math.min(coat(x, y, z), chest(x, y, z))) ? 1 : 0;
      },
      cell: 0.022,
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    return {
      body: `<path d="M${CX - 58} ${s - 5}L${CX} ${s + 150}L${CX + 58} ${s - 5}Z" fill="${f.accent}"/><path d="M${CX - 40} ${s - 8}L${CX - 6} ${s + 8}L${CX - 22} ${s + 34}ZM${CX + 40} ${s - 8}L${CX + 6} ${s + 8}L${CX + 22} ${s + 34}Z" fill="${f.mix(f.accent, "#ffffff", 0.2)}"/><path d="M${CX - 60} ${s - 8}L${CX - 34} ${s + 56}L${CX - 54} ${s + 62}L${CX - 6} ${s + 160}L${CX - 6} 512L${CX - 100} 512L${CX - 100} ${s + 10}ZM${CX + 60} ${s - 8}L${CX + 34} ${s + 56}L${CX + 54} ${s + 62}L${CX + 6} ${s + 160}L${CX + 6} 512L${CX + 100} 512L${CX + 100} ${s + 10}Z" fill="#d8d8d2"/><rect x="${CX - 168}" y="${s + 70}" width="62" height="48" rx="4" fill="none" stroke="#cfcfc8" stroke-width="3"/><rect x="${CX - 152}" y="${s + 52}" width="8" height="34" rx="3" fill="#2f5d8a"/>`,
    };
  },
};

export const scrubs: Garment = {
  build: (p, k) => {
    const top: SDF = (x, y, z) => k.shell(x, y, z, 0.06 + folds(x, y, z, 0.008));
    const vBottom = k.yF - 0.38;
    const body: SDF = (x, y, z) => smax(smax(top(x, y, z), -k.neckHole(x, y, z, k.holeR), 0.03), -vOpening(vBottom, 0.42, 0.01)(x, y, z), 0.025);
    // Binding along the V and a chest pocket.
    const trim: SDF = (x, y, z) => smax(top(x, y, z) - 0.012, Math.abs(Math.abs(x) - (0.01 + (y - vBottom) * 0.42) - 0.035) - 0.035, 0.01);
    const chest = pocket(top, -0.5, k.yF - 0.48, 0.15, 0.12, 0.016);
    return { sdf: union(body, trim, chest), region: () => 0 };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    return {
      body: `<path d="M${CX - 44} ${s - 5}L${CX} ${s + 64}L${CX + 44} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 46} ${s - 5}L${CX} ${s + 68}L${CX + 46} ${s - 5}" fill="none" stroke="${f.shade}" stroke-width="7" stroke-linejoin="round"/><rect x="${CX - 160}" y="${s + 70}" width="62" height="52" rx="5" fill="none" stroke="${f.shade}" stroke-width="3"/>`,
    };
  },
};

export const chef: Garment = {
  build: (p, k) => {
    // Double-breasted: a high band collar, a front panel overlapping to one side, two rows of buttons.
    const jacket: SDF = (x, y, z) => k.shell(x, y, z, 0.085 + folds(x, y, z, 0.008));
    const body: SDF = (x, y, z) => smax(jacket(x, y, z), -k.neckHole(x, y, z, k.holeR - 0.02), 0.03);
    const band: SDF = (x, y, z) => smax(k.ring(x, y, z, k.holeR - 0.005, 0.04, 0.1), -k.neckHole(x, y, z, k.holeR - 0.03), 0.01);
    const panel: SDF = (x, y, z) => smax(jacket(x, y, z) - 0.018, Math.max(-(x - 0.22), -z), 0.012);
    const buttons = union(...[-0.3, 0.42].flatMap((bx) => [0.3, 0.5, 0.7].map((dy) => k.button(jacket, bx, k.yF - dy, 0.03))));
    return {
      sdf: union((x, y, z) => smin(band(x, y, z), body(x, y, z), 0.02), panel, buttons),
      region: (x, y, z) => (buttons(x, y, z) < 0.01 ? 1 : 0),
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const dots = [-38, 52].flatMap((dx) => [50, 86, 122].map((dy) => `<circle cx="${CX + dx}" cy="${s + dy}" r="5" fill="${f.accent}"/>`)).join("");
    return {
      body: `<rect x="${CX - 46}" y="${s - 34}" width="92" height="40" rx="14" fill="${f.color}" stroke="#d8d8d2" stroke-width="3"/><path d="M${CX + 28} ${s + 6}V512" stroke="#d8d8d2" stroke-width="4"/>${dots}`,
    };
  },
};
