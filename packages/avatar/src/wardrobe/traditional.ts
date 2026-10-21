/** African and traditional garments: kaftan (dashiki), kente top, ankara-print shirt, agbada. */

import type { Garment } from "./kit.ts";
import type { SDF } from "../sdf.ts";
import { KENTE } from "./catalog.ts";
import { buttonRow, folds, placket, shirtCollar, smax, smin, union, vOpening } from "./parts.ts";

const GOLD = "#d4a843";

/** Kente weave: vertical strips, each with its own color, crossed by bands and thin warp stripes. Returns 0..3. */
function kenteIndex(x: number, y: number): number {
  const strip = Math.floor((x + 3) / 0.17);
  const band = Math.floor((y + 3) / 0.11);
  if (Math.abs(((x + 3) % 0.17) - 0.085) < 0.012) return 3; // black warp stripe
  return (strip + (band % 3 === 0 ? 1 : 0) + (band % 5 === 0 ? 2 : 0)) % 3;
}

/** Ankara (wax print): a grid of concentric rings and dots in four colors. Returns 0..3. */
function ankaraIndex(x: number, y: number): number {
  const cell = 0.22;
  const u = x / cell - Math.floor(x / cell) - 0.5, v = y / cell + (Math.floor(x / cell) % 2) * 0.5;
  const w = v - Math.floor(v) - 0.5;
  const r = Math.hypot(u, w);
  if (r < 0.1) return 2;
  if (r < 0.2) return 1;
  if (r < 0.3) return 3;
  return 0;
}

/** Embroidered band around a neckline and down a slit (the dashiki yoke). */
const yoke = (k: { yF: number; nz: number; holeR: number }, depth: number) => (x: number, y: number, z: number) => {
  const r = Math.hypot(x, z - k.nz);
  return Math.min(Math.abs(r - k.holeR - 0.06) - 0.07 + Math.max(0, k.yF - 0.2 - y), z > 0 ? Math.max(Math.abs(x) - 0.06, k.yF - depth - y) : 1);
};

export const kaftan: Garment = {
  build: (p, k) => {
    const loose: SDF = (x, y, z) => k.shell(x, y, z, 0.075 + folds(x, y, z, 0.012));
    const slit = vOpening(k.yF - 0.3, 0.12, 0.015);
    const body: SDF = (x, y, z) => smax(smax(loose(x, y, z), -k.neckHole(x, y, z, k.holeR), 0.03), -slit(x, y, z), 0.02);
    const band = yoke(k, 0.45);
    const trim: SDF = (x, y, z) => smax(body(x, y, z) - 0.012, band(x, y, z), 0.01);
    return {
      sdf: union(body, trim),
      region: (x, y, z) => {
        if (band(x, y, z) > 0) return 0;
        // Embroidery: a zigzag of gold and the accent color.
        return Math.sin(x * 40 + y * 40) > 0 ? 1 : 3;
      },
      extra: [GOLD],
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    return {
      body: `<path d="M${CX - 46} ${s - 5}Q${CX} ${s + 34} ${CX + 46} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 62} ${s - 8}Q${CX} ${s + 56} ${CX + 62} ${s - 8}L${CX + 46} ${s - 5}Q${CX} ${s + 34} ${CX - 46} ${s - 5}Z" fill="${f.accent}"/><path d="M${CX - 24} ${s + 26}L${CX - 24} ${s + 120}L${CX} ${s + 140}L${CX + 24} ${s + 120}L${CX + 24} ${s + 26}Z" fill="${f.accent}"/><path d="M${CX - 58} ${s}Q${CX} ${s + 50} ${CX + 58} ${s}M${CX - 16} ${s + 40}V${s + 116}M${CX + 16} ${s + 40}V${s + 116}" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="6 4"/><path d="M${CX} ${s + 24}V${s + 70}" stroke="${f.skin}" stroke-width="6"/>`,
    };
  },
};

export const kente: Garment = {
  build: (p, k) => {
    const cloth: SDF = (x, y, z) => k.shell(x, y, z, 0.06 + folds(x, y, z, 0.006));
    const body: SDF = (x, y, z) => smin(smax(cloth(x, y, z), -k.neckHole(x, y, z, k.holeR), 0.03), k.ring(x, y, z, k.holeR + 0.015, 0.032), 0.03);
    return { sdf: body, region: (x, y) => 3 + kenteIndex(x, y), extra: [...KENTE], cell: 0.022 };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    let cells = "";
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 7; j++) {
        const c = KENTE[(i + (j % 3 === 0 ? 1 : 0) + (j % 5 === 0 ? 2 : 0)) % 3];
        cells += `<rect x="${i * 44}" y="${s + j * 20 - 10}" width="44" height="20" fill="${c}"/>`;
      }
    for (let i = 0; i < 12; i++) cells += `<rect x="${i * 44 + 19}" y="${s - 10}" width="6" height="160" fill="${KENTE[3]}"/>`;
    return {
      body: `<clipPath id="${f.id}k"><path d="M28 512C28 440 70 ${s} 150 ${s - 4}L362 ${s - 4}C442 ${s} 484 440 484 512Z"/></clipPath><g clip-path="url(#${f.id}k)">${cells}</g><path d="M${CX - 50} ${s - 5}Q${CX} ${s + 46} ${CX + 50} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 50} ${s - 5}Q${CX} ${s + 46} ${CX + 50} ${s - 5}" fill="none" stroke="${KENTE[3]}" stroke-width="7"/>`,
    };
  },
};

export const ankara: Garment = {
  build: (p, k) => {
    const shirt: SDF = (x, y, z) => k.shell(x, y, z, 0.05 + folds(x, y, z, 0.006));
    const top = k.yF - 0.12;
    const body: SDF = (x, y, z) => smax(smax(shirt(x, y, z), -k.neckHole(x, y, z, k.holeR - 0.02), 0.02), -vOpening(top, 0.4, 0.02)(x, y, z), 0.02);
    const collar = shirtCollar(k, shirt, 0.06);
    const strip = placket(k, shirt, top - 0.02);
    const buttons = buttonRow(k, shirt, 0, top - 0.08, 0.16, 0.024);
    return {
      sdf: union(body, collar, strip, buttons),
      region: (x, y, z) => (buttons(x, y, z) < 0.008 ? 2 : 3 + ankaraIndex(x, y)),
      extra: p.hair.pattern.slice(0, 4),
      cell: 0.022,
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    let print = "";
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 4; j++) {
        const x = i * 52 + 26, y = s + j * 52 + (i % 2) * 26;
        print += `<circle cx="${x}" cy="${y}" r="22" fill="${f.print[3]}"/><circle cx="${x}" cy="${y}" r="15" fill="${f.print[1]}"/><circle cx="${x}" cy="${y}" r="7" fill="${f.print[2]}"/>`;
      }
    return {
      torso: undefined,
      body: `<clipPath id="${f.id}a"><path d="M28 512C28 440 70 ${s} 150 ${s - 4}L362 ${s - 4}C442 ${s} 484 440 484 512Z"/></clipPath><g clip-path="url(#${f.id}a)"><rect x="0" y="${s - 10}" width="512" height="200" fill="${f.print[0]}"/>${print}</g><path d="M${CX - 22} ${s - 5}L${CX} ${s + 34}L${CX + 22} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 50} ${s - 10}L${CX - 4} ${s + 4}L${CX - 22} ${s + 40}ZM${CX + 50} ${s - 10}L${CX + 4} ${s + 4}L${CX + 22} ${s + 40}Z" fill="${f.print[0]}" stroke="${f.mix(f.print[0]!, "#000000", 0.3)}" stroke-width="3" stroke-linejoin="round"/>`,
    };
  },
};

export const agbada: Garment = {
  build: (p, k) => {
    // A wide, flowing robe: broader than the shoulders, with deep drapes.
    const robe: SDF = (x, y, z) => k.rig.torso(x * 0.9, y + 0.04, z) - 0.12 - 0.03 * Math.sin(x * 5 + Math.sin(y * 3)) * Math.min(1, Math.abs(x));
    const tunic: SDF = (x, y, z) => smax(k.shell(x, y, z, 0.05), -k.neckHole(x, y, z, k.holeR - 0.01), 0.02);
    const neck = vOpening(k.yF - 0.42, 0.55, 0.12);
    const body: SDF = (x, y, z) => smax(smax(robe(x, y, z), -neck(x, y, z), 0.04), -k.neckHole(x, y, z, k.holeR + 0.1), 0.04);
    // Embroidery around the wide neckline.
    const edge = (x: number, y: number, z: number) => Math.abs(Math.abs(x) - (0.12 + (y - (k.yF - 0.42)) * 0.55)) - 0.09;
    return {
      sdf: union(body, tunic),
      region: (x, y, z) => {
        if (Math.abs(tunic(x, y, z)) < Math.abs(body(x, y, z))) return 1;
        return z > 0 && edge(x, y, z) < 0 && y > k.yF - 0.5 ? (Math.sin(y * 50) > 0.2 ? 3 : 1) : 0;
      },
      extra: [GOLD],
    };
  },
  flat: (p, f) => {
    const { CX, s } = f;
    const wide = `M0 512C0 430 40 ${s - 6} 140 ${s - 10}L372 ${s - 10}C472 ${s - 6} 512 430 512 512Z`;
    return {
      torso: wide,
      body: `<path d="M${CX - 70} ${s - 12}L${CX} ${s + 110}L${CX + 70} ${s - 12}Z" fill="${f.accent}"/><path d="M${CX - 40} ${s - 5}Q${CX} ${s + 30} ${CX + 40} ${s - 5}Z" fill="${f.skin}"/><path d="M${CX - 74} ${s - 12}L${CX} ${s + 118}L${CX + 74} ${s - 12}" fill="none" stroke="${GOLD}" stroke-width="7"/><path d="M${CX - 90} ${s - 8}L${CX} ${s + 140}L${CX + 90} ${s - 8}" fill="none" stroke="${GOLD}" stroke-width="2" stroke-dasharray="4 4"/><path d="M60 512Q90 ${s + 60} 120 512M452 512Q422 ${s + 60} 392 512" fill="none" stroke="${f.shade}" stroke-width="3" opacity=".5"/>`,
    };
  },
};
