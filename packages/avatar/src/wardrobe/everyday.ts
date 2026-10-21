/** Everyday tops: crewneck sweater, cardigan, button-up shirt, denim jacket. */

import type { Garment } from "./kit.ts";
import { buttonRow, folds, knit, placket, pocket, shirtCollar, smax, smin, union, vOpening } from "./parts.ts";

const WHITE = "#f4f1ea";

export const sweater: Garment = {
  build: (p, k) => {
    const body = (x: number, y: number, z: number) => k.shell(x, y, z, 0.075 + knit(x, y, z) + folds(x, y, z, 0.008));
    return {
      sdf: (x, y, z) => {
        let d = smax(body(x, y, z), -k.neckHole(x, y, z, k.holeR), 0.04);
        return smin(d, k.ring(x, y, z, k.holeR + 0.02, 0.05), 0.03);
      },
      region: () => 0,
    };
  },
  flat: (p, f) => ({
    body: `<path d="M${f.CX - 50} ${f.s - 5}Q${f.CX} ${f.s + 44} ${f.CX + 50} ${f.s - 5}Z" fill="${f.skin}"/><path d="M${f.CX - 52} ${f.s - 6}Q${f.CX} ${f.s + 48} ${f.CX + 52} ${f.s - 6}" fill="none" stroke="${f.shade}" stroke-width="13"/><path d="${Array.from({ length: 14 }, (_, i) => `M${80 + i * 26} ${f.s + 40}V512`).join("")}" stroke="${f.shade}" stroke-width="2" opacity=".25"/>`,
  }),
};

export const cardigan: Garment = {
  build: (p, k) => {
    const bottom = k.bottom - 0.2;
    const open = vOpening(bottom, 0.22, 0.05);
    const tee = (x: number, y: number, z: number) => smin(smax(k.shell(x, y, z, 0.045), -k.neckHole(x, y, z, k.holeR - 0.02), 0.03), k.ring(x, y, z, k.holeR - 0.01, 0.025), 0.02);
    const knitted = (x: number, y: number, z: number) => k.shell(x, y, z, 0.085 + knit(x, y, z) + folds(x, y, z, 0.008));
    const cardi = (x: number, y: number, z: number) => smax(smax(knitted(x, y, z), -open(x, y, z), 0.03), -k.neckHole(x, y, z, k.holeR + 0.03), 0.03);
    // A raised band along the opening.
    const band = (x: number, y: number, z: number) => smax(knitted(x, y, z) - 0.018, Math.abs(Math.abs(x) - (0.05 + (y - bottom) * 0.22) - 0.045) - 0.045, 0.012);
    // Buttons down the left band, following its slant.
    const buttons = union(...[0.35, 0.51, 0.67].map((dy) => {
      const y = k.yF - dy;
      return k.button(knitted, -(0.05 + (y - bottom) * 0.22 + 0.045), y, 0.026);
    }));
    return {
      sdf: union(tee, cardi, band, buttons),
      region: (x, y, z) => {
        if (buttons(x, y, z) < 0.008) return 1;
        return Math.abs(tee(x, y, z)) < Math.abs(Math.min(cardi(x, y, z), band(x, y, z))) ? 2 : 0;
      },
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const dots = [60, 105, 150].map((dy) => `<circle cx="${CX - 26 + dy * 0.12}" cy="${s + dy}" r="5" fill="${f.accent}"/>`).join("");
    return {
      body: `<path d="M${CX - 48} ${s - 5}L${CX - 12} 512H${CX + 12}L${CX + 48} ${s - 5}Z" fill="${WHITE}"/><path d="M${CX - 40} ${s - 5}Q${CX} ${s + 34} ${CX + 40} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 50} ${s - 5}L${CX - 14} 512M${CX + 50} ${s - 5}L${CX + 14} 512" stroke="${f.shade}" stroke-width="9"/>${dots}`,
    };
  },
};

export const buttonup: Garment = {
  build: (p, k) => {
    const shirt = (x: number, y: number, z: number) => k.shell(x, y, z, 0.05 + folds(x, y, z, 0.006));
    const top = k.yF - 0.12;
    // Top button undone: a small V at the collar.
    const body = (x: number, y: number, z: number) => smax(smax(shirt(x, y, z), -k.neckHole(x, y, z, k.holeR - 0.02), 0.02), -vOpening(top, 0.4, 0.02)(x, y, z), 0.02);
    const collar = shirtCollar(k, shirt, 0.06);
    const strip = placket(k, shirt, top - 0.02);
    const buttons = buttonRow(k, shirt, 0, top - 0.08, 0.16, 0.024);
    return {
      sdf: union(body, collar, strip, buttons),
      region: (x, y, z) => (buttons(x, y, z) < 0.008 ? 2 : 0),
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    return {
      body: `<path d="M${CX - 22} ${s - 5}L${CX} ${s + 34}L${CX + 22} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 50} ${s - 10}L${CX - 4} ${s + 4}L${CX - 22} ${s + 40}ZM${CX + 50} ${s - 10}L${CX + 4} ${s + 4}L${CX + 22} ${s + 40}Z" fill="${f.mix(f.color, "#ffffff", 0.15)}" stroke="${f.shade}" stroke-width="3" stroke-linejoin="round"/><path d="M${CX} ${s + 34}V512" stroke="${f.shade}" stroke-width="3"/>${[60, 96, 132].map((dy) => `<circle cx="${CX}" cy="${s + dy}" r="4" fill="${WHITE}"/>`).join("")}`,
    };
  },
};

export const denim: Garment = {
  build: (p, k) => {
    const jean = (x: number, y: number, z: number) => k.shell(x, y, z, 0.1 + folds(x, y, z, 0.01));
    const bottom = k.bottom - 0.1;
    const tee = (x: number, y: number, z: number) => smin(smax(k.shell(x, y, z, 0.045), -k.neckHole(x, y, z, k.holeR - 0.02), 0.03), k.ring(x, y, z, k.holeR - 0.01, 0.025), 0.02);
    const jacket = (x: number, y: number, z: number) => smax(smax(jean(x, y, z), -vOpening(bottom, 0.3, 0.06)(x, y, z), 0.03), -k.neckHole(x, y, z, k.holeR + 0.04), 0.03);
    // A big folded-over collar lying on the shoulders.
    const collar = (x: number, y: number, z: number) => smax(jean(x, y, z) - 0.05, Math.max(Math.abs(Math.hypot(x, z - k.nz) - (k.holeR + 0.17)) - 0.13, y - k.yB - 0.1, k.yF - 0.32 - y), 0.04);
    const pockets = union(pocket(jean, -0.5, k.yF - 0.42, 0.17, 0.1, 0.02), pocket(jean, 0.5, k.yF - 0.42, 0.17, 0.1, 0.02));
    const buttons = union(k.button(jean, -0.5, k.yF - 0.45, 0.03), k.button(jean, 0.5, k.yF - 0.45, 0.03));
    return {
      sdf: union(tee, jacket, collar, pockets, buttons),
      region: (x, y, z) => {
        if (buttons(x, y, z) < 0.008) return 1;
        return Math.abs(tee(x, y, z)) < Math.abs(Math.min(jacket(x, y, z), collar(x, y, z), pockets(x, y, z))) ? 2 : 0;
      },
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const stitch = `stroke="${f.accent}" stroke-width="2" stroke-dasharray="5 5" fill="none"`;
    return {
      body: `<path d="M${CX - 46} ${s - 5}L${CX - 16} 512H${CX + 16}L${CX + 46} ${s - 5}Z" fill="${WHITE}"/><path d="M${CX - 38} ${s - 5}Q${CX} ${s + 30} ${CX + 38} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 50} ${s - 8}L${CX - 120} ${s + 6}L${CX - 34} ${s + 64}ZM${CX + 50} ${s - 8}L${CX + 120} ${s + 6}L${CX + 34} ${s + 64}Z" fill="${f.shade}"/><rect x="${CX - 150}" y="${s + 60}" width="74" height="46" rx="6" ${stitch}/><rect x="${CX + 76}" y="${s + 60}" width="74" height="46" rx="6" ${stitch}/><circle cx="${CX - 113}" cy="${s + 74}" r="5" fill="${f.accent}"/><circle cx="${CX + 113}" cy="${s + 74}" r="5" fill="${f.accent}"/><path d="M${CX - 50} ${s - 5}L${CX - 18} 512M${CX + 50} ${s - 5}L${CX + 18} 512" ${stitch}/>`,
    };
  },
};
