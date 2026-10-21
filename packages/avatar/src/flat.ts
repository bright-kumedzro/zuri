/**
 * Flat 2D avatars: the same params as the 3D style, drawn as a vector illustration.
 * Pure string output with no DOM or three.js, so it also runs on servers, in workers and in emails.
 *
 *   img.src = flatAvatarDataURL(createFlatAvatar("ada@example.com"));
 */

import { Random } from "@zuri/core/random";
import { generateAvatar, type AvatarOptions, type AvatarParams } from "./params.ts";

export interface FlatOptions {
  /** Width and height in pixels. Default 256. The drawing is resolution-independent. */
  size?: number;
  /** Leave out the background colour. */
  transparent?: boolean;
  /** Crop the picture. Default "square". */
  shape?: "square" | "rounded" | "circle";
}

const CX = 256;
const INK = "#2b1d18";

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** FNV-1a, used to give each distinct drawing its own clip-path ids. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

interface Geo {
  W: number;
  top: number;
  mid: number;
  chin: number;
  jaw: number;
  eyeY: number;
  mouthY: number;
  shoulder: number;
}

function geometry(p: AvatarParams): Geo {
  const W = 86 * p.face.width;
  return {
    W,
    top: 118,
    mid: 212,
    chin: 312 + (p.face.chin - 1) * 30,
    jaw: W * 0.62 * p.face.jaw,
    eyeY: 216,
    mouthY: 280,
    shoulder: 380,
  };
}

function headPath(g: Geo, cheeks: number): string {
  const { W, top, mid, chin, jaw } = g;
  const b = 55 * cheeks;
  return `M${CX} ${top}C${CX + W * 0.56} ${top} ${CX + W} ${mid - 60} ${CX + W} ${mid}C${CX + W} ${mid + b} ${CX + jaw} ${chin - 30} ${CX + 20} ${chin}Q${CX} ${chin + 4} ${CX - 20} ${chin}C${CX - jaw} ${chin - 30} ${CX - W} ${mid + b} ${CX - W} ${mid}C${CX - W} ${mid - 60} ${CX - W * 0.56} ${top} ${CX} ${top}Z`;
}

/** Outer edge of a hair dome, from the left side up over the head to the right side. */
function dome(g: Geo, o: number, top: number, side: number): string {
  const L = CX - g.W - o, R = CX + g.W + o;
  return `M${L} ${side}C${L} ${top + 36} ${CX - g.W * 0.62} ${top} ${CX} ${top}C${CX + g.W * 0.62} ${top} ${R} ${top + 36} ${R} ${side}`;
}

/** A hair cap with a soft hairline across the forehead. */
function cap(g: Geo, o: number, top: number, hairline: number, side = 196): string {
  const { W } = g;
  return `${dome(g, o, top, side)}L${CX + W - 5} ${side}C${CX + W - 8} ${hairline - 12} ${CX + W * 0.5} ${hairline} ${CX} ${hairline}C${CX - W * 0.5} ${hairline} ${CX - W + 8} ${hairline - 12} ${CX - W + 5} ${side}Z`;
}

/** Bumpy outline for coily and curly hair: circles around an ellipse. */
function bumps(cx: number, cy: number, rx: number, ry: number, r: number, count: number, from = 0, to = Math.PI * 2): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * i) / (to - from >= Math.PI * 2 ? count : count - 1);
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    d += `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  }
  return d;
}

interface HairLayers {
  back: string;
  front: string[];
  /** Fill of the front layer when it isn't the plain hair colour (short fades, headwraps). */
  frontColor?: string;
  extra: string;
}

function hair(p: AvatarParams, g: Geo, id: string): HairLayers {
  const { W, top } = g;
  const v = p.hair.volume;
  const c = p.hair.color;
  const dark = mix(c, "#000000", 0.32);
  const light = mix(c, "#ffffff", 0.22);
  const shine = (y: number) => `<path d="M${CX - W * 0.45} ${y + 10}Q${CX - 6} ${y - 2} ${CX + W * 0.3} ${y + 12}" fill="none" stroke="${light}" stroke-width="6" stroke-linecap="round" opacity=".55"/>`;
  const out: HairLayers = { back: "", front: [], extra: "" };
  const fill = (d: string, color = c) => `<path d="${d}" fill="${color}"/>`;

  switch (p.hair.style) {
    case "none":
      out.extra = `<path d="M${CX - W * 0.4} ${top + 16}Q${CX} ${top + 4} ${CX + W * 0.35} ${top + 18}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity=".12"/>`;
      break;
    case "buzz":
      out.front.push(cap(g, 2, top - 4, 150, 200));
      out.frontColor = mix(c, p.skin, 0.35);
      break;
    case "fade": {
      out.front.push(cap(g, 3, top - 4, 150, 200));
      out.frontColor = mix(c, p.skin, 0.45);
      out.extra = `<path d="${dome(g, -6, top - 16, 150)}Q${CX} 140 ${CX - W + 6} 150Z" fill="${c}"/>`;
      break;
    }
    case "crop": {
      const t = top - 20 * v;
      out.front.push(`${dome(g, 7, t, 194)}L${CX + W - 4} 194C${CX + W - 10} 150 ${CX + 24} 170 ${CX - 6} 148C${CX - 26} 166 ${CX - W + 12} 160 ${CX - W + 4} 194Z`);
      out.extra = shine(t);
      break;
    }
    case "hightop": {
      const t = top - 48 * v;
      out.front.push(`M${CX - W - 2} 200L${CX - W - 6} ${t + 14}Q${CX - W - 6} ${t} ${CX - W + 10} ${t}L${CX + W - 10} ${t}Q${CX + W + 6} ${t} ${CX + W + 6} ${t + 14}L${CX + W + 2} 200L${CX + W - 5} 200C${CX + W - 8} 140 ${CX + W * 0.5} 150 ${CX} 150C${CX - W * 0.5} 150 ${CX - W + 8} 140 ${CX - W + 5} 200Z`);
      out.extra = `<path d="M${CX - W + 4} ${t + 16}H${CX + W - 4}" stroke="${light}" stroke-width="4" stroke-linecap="round" opacity=".35"/>`;
      break;
    }
    case "afro": {
      const rx = (W + 46) * v, ry = (W + 38) * v, cy = 178;
      out.back = fill(`M${CX - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z${bumps(CX, cy, rx, ry, 15, 26)}`);
      out.front.push(cap(g, 10, top - 24, 150, 206));
      break;
    }
    case "puffs": {
      const r = 46 * v;
      out.back = fill(`${bumps(CX - W - 6, top + 6, r - 10, r - 10, 12, 12)}${bumps(CX + W + 6, top + 6, r - 10, r - 10, 12, 12)}M${CX - W - 6 - r + 6} ${top + 6}a${r - 6} ${r - 6} 0 1 0 ${(r - 6) * 2} 0a${r - 6} ${r - 6} 0 1 0 ${-(r - 6) * 2} 0ZM${CX + W + 6 - r + 6} ${top + 6}a${r - 6} ${r - 6} 0 1 0 ${(r - 6) * 2} 0a${r - 6} ${r - 6} 0 1 0 ${-(r - 6) * 2} 0Z`);
      out.front.push(cap(g, 4, top - 8, 150));
      out.extra = `<path d="M${CX} ${top - 6}V150" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    }
    case "bun": {
      out.back = fill(`M${CX - 36} ${top - 18}a36 34 0 1 0 72 0a36 34 0 1 0 -72 0Z`);
      out.front.push(cap(g, 4, top - 8, 152));
      out.extra = `<path d="M${CX - 30} 156Q${CX - 20} ${top + 10} ${CX - 6} ${top - 4}M${CX + 30} 156Q${CX + 20} ${top + 10} ${CX + 6} ${top - 4}" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round" opacity=".6"/>${shine(top - 8)}`;
      break;
    }
    case "locs":
    case "braids": {
      const locs = p.hair.style === "locs";
      const w = locs ? 14 : 10;
      const rnd = new Random(`${p.seed}#strands`);
      let back = "", pattern = "";
      const n = locs ? 13 : 17;
      for (let i = 0; i < n; i++) {
        const x = CX - W - 14 + ((W * 2 + 28) * i) / (n - 1);
        const end = 330 + rnd.next() * 50 * v;
        back += `M${x - w / 2} 170H${x + w / 2}V${end - w / 2}a${w / 2} ${w / 2} 0 0 1 ${-w} 0Z`;
        for (let y = 200; y < end - 10; y += locs ? 22 : 12) {
          pattern += locs ? `M${x - w / 2 + 2} ${y}h${w - 4}` : `M${x - w / 2 + 1} ${y}l${w / 2 - 1} 5l${w / 2 - 1} -5`;
        }
      }
      out.back = `${fill(back)}<path d="${pattern}" fill="none" stroke="${dark}" stroke-width="2" opacity=".55"/>`;
      out.front.push(cap(g, 9, top - 14, 152, 214));
      let rows = "";
      for (let i = -3; i <= 3; i++) rows += `M${CX + i * 17} 152Q${CX + i * 21} ${top + 20} ${CX + i * 26} ${top - 10}`;
      out.extra = `<g clip-path="url(#${id}c)"><path d="${rows}" fill="none" stroke="${dark}" stroke-width="2.5" opacity=".5"/></g>`;
      break;
    }
    case "cornrows": {
      out.front.push(cap(g, 2, top - 6, 148, 200));
      let rows = "";
      for (let i = -3; i <= 3; i++) rows += `M${CX + i * 20} 150Q${CX + i * 22} ${top + 30} ${CX + i * 30} ${top - 20}`;
      out.extra = `<g clip-path="url(#${id}c)"><path d="${rows}" fill="none" stroke="${dark}" stroke-width="3.5"/><path d="${rows}" fill="none" stroke="${light}" stroke-width="1.5" stroke-dasharray="4 6" opacity=".6"/></g>`;
      break;
    }
    case "long": {
      const bottom = 410 + 20 * v;
      out.back = fill(`M${CX - W - 14} 190C${CX - W - 30} 300 ${CX - W - 34} 370 ${CX - W - 22} ${bottom}L${CX + W + 22} ${bottom}C${CX + W + 34} 370 ${CX + W + 30} 300 ${CX + W + 14} 190Z`, dark);
      out.front.push(`${dome(g, 12, top - 16 * v, 330)}L${CX + W - 1} 330C${CX + W - 4} 240 ${CX + W * 0.62} 160 ${CX + 4} ${top + 22}L${CX - 2} ${top + 26}C${CX - W * 0.62} 160 ${CX - W + 4} 240 ${CX - W + 1} 330Z`);
      out.extra = shine(top - 16 * v);
      break;
    }
    case "bob": {
      out.back = fill(`M${CX - W - 18} 190C${CX - W - 26} 250 ${CX - W - 24} 290 ${CX - W - 14} 304L${CX + W + 14} 304C${CX + W + 24} 290 ${CX + W + 26} 250 ${CX + W + 18} 190Z`, dark);
      out.front.push(`${dome(g, 16, top - 18 * v, 300)}L${CX + W + 2} 300C${CX + W} 230 ${CX + W - 2} 180 ${CX + W - 22} 168Q${CX} 178 ${CX - W + 22} 168C${CX - W + 2} 180 ${CX - W} 230 ${CX - W - 2} 300Z`);
      out.extra = shine(top - 18 * v);
      break;
    }
    case "ponytail": {
      out.back = fill(`M${CX + W * 0.5} ${top + 30}C${CX + W + 40} ${top + 10} ${CX + W + 56} 250 ${CX + W + 30} 330Q${CX + W + 14} 300 ${CX + W + 6} 230Z`, dark);
      out.front.push(cap(g, 4, top - 10, 150));
      out.extra = `<path d="M${CX - W * 0.6} 158Q${CX - 10} ${top + 8} ${CX + W * 0.6} ${top + 22}M${CX - W * 0.2} 152Q${CX + 20} ${top + 14} ${CX + W * 0.75} ${top + 40}" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
      break;
    }
    case "curly": {
      const rx = (W + 26) * v, ry = 100 * v, cy = 196;
      out.back = fill(`M${CX - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z${bumps(CX, cy, rx, ry, 16, 22)}`);
      out.front.push(`${cap(g, 10, top - 22 * v, 152, 206)}${bumps(CX, 150, W * 0.7, 6, 12, 7, Math.PI, Math.PI * 2)}`);
      break;
    }
    case "headwrap": {
      const [a, b, d] = p.hair.pattern as [string, string, string, string];
      const t = top - 46 * v;
      out.front.push(`${dome(g, 14, t, 204)}L${CX + W - 2} 204C${CX + W - 6} 166 ${CX + W * 0.5} 156 ${CX} 156C${CX - W * 0.5} 156 ${CX - W + 6} 166 ${CX - W + 2} 204Z`);
      out.frontColor = a;
      out.extra = `<g clip-path="url(#${id}c)"><path d="M${CX - 160} 220L${CX + 40} ${t - 40}M${CX - 110} 240L${CX + 90} ${t - 20}M${CX - 60} 250L${CX + 140} ${t}" stroke="${b}" stroke-width="16"/><path d="M${CX - 135} 230L${CX + 65} ${t - 30}M${CX - 85} 245L${CX + 115} ${t - 10}" stroke="${d}" stroke-width="5"/></g><path d="M${CX - 50} ${t + 8}C${CX - 64} ${t - 40} ${CX - 4} ${t - 34} ${CX} ${t + 2}C${CX + 4} ${t - 34} ${CX + 64} ${t - 40} ${CX + 50} ${t + 8}C${CX + 30} ${t + 26} ${CX - 30} ${t + 26} ${CX - 50} ${t + 8}Z" fill="${b}"/><circle cx="${CX}" cy="${t + 6}" r="12" fill="${d}"/>`;
      break;
    }
  }
  return out;
}

function outfit(p: AvatarParams, g: Geo, id: string): { behind: string; body: string } {
  const { style, color, accent, stripes } = p.outfit;
  const s = g.shoulder;
  const shade = mix(color, "#000000", 0.25);
  const skinShade = mix(p.skin, "#000000", 0.14);
  const torso = `M28 512C28 440 70 ${s} 150 ${s - 4}L362 ${s - 4}C442 ${s} 484 440 484 512Z`;
  const tank = `M118 512L126 446C130 414 148 396 170 392L188 389C204 444 308 444 324 389L342 392C364 396 382 414 386 446L394 512Z`;
  const shape = style === "tank" ? tank : torso;
  let body = style === "tank" ? `<path d="${torso}" fill="${p.skin}"/><path d="M150 ${s}Q160 ${s + 14} 160 ${s + 40}M362 ${s}Q352 ${s + 14} 352 ${s + 40}" stroke="${skinShade}" stroke-width="3" fill="none" opacity=".6"/>` : "";
  body += `<path d="${shape}" fill="${color}"/>`;
  if (stripes) body += `<clipPath id="${id}o"><path d="${shape}"/></clipPath><g clip-path="url(#${id}o)" fill="${accent}" opacity=".9"><rect x="0" y="${s + 40}" width="512" height="14"/><rect x="0" y="${s + 78}" width="512" height="14"/><rect x="0" y="${s + 116}" width="512" height="14"/></g>`;
  let behind = "";

  switch (style) {
    case "tee":
      body += `<path d="M${CX - 50} ${s - 5}Q${CX} ${s + 48} ${CX + 50} ${s - 5}Z" fill="${p.skin}"/><path d="M${CX - 50} ${s - 5}Q${CX} ${s + 48} ${CX + 50} ${s - 5}" fill="none" stroke="${shade}" stroke-width="7"/>`;
      break;
    case "vneck":
      body += `<path d="M${CX - 46} ${s - 5}L${CX} ${s + 70}L${CX + 46} ${s - 5}Z" fill="${p.skin}"/><path d="M${CX - 46} ${s - 5}L${CX} ${s + 70}L${CX + 46} ${s - 5}" fill="none" stroke="${shade}" stroke-width="6" stroke-linejoin="round"/>`;
      break;
    case "hoodie":
      behind = `<path d="M${CX - 116} ${s + 10}C${CX - 130} ${s - 78} ${CX + 130} ${s - 78} ${CX + 116} ${s + 10}Z" fill="${shade}"/>`;
      body += `<path d="M${CX - 62} ${s - 6}Q${CX} ${s + 62} ${CX + 62} ${s - 6}Q${CX} ${s + 20} ${CX - 62} ${s - 6}Z" fill="${shade}"/><path d="M${CX - 52} ${s - 4}Q${CX} ${s + 40} ${CX + 52} ${s - 4}Z" fill="${p.skin}"/><path d="M${CX - 24} ${s + 30}V${s + 96}M${CX + 24} ${s + 30}V${s + 96}" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`;
      break;
    case "shirt":
      body += `<path d="M${CX - 30} ${s - 5}L${CX} ${s + 46}L${CX + 30} ${s - 5}Z" fill="${p.skin}"/><path d="M${CX - 54} ${s - 10}L${CX - 4} ${s + 2}L${CX - 22} ${s + 40}ZM${CX + 54} ${s - 10}L${CX + 4} ${s + 2}L${CX + 22} ${s + 40}Z" fill="${mix(color, "#ffffff", 0.18)}" stroke="${shade}" stroke-width="3" stroke-linejoin="round"/><path d="M${CX} ${s + 46}V${s + 110}" stroke="${shade}" stroke-width="3"/><circle cx="${CX}" cy="${s + 66}" r="4" fill="${shade}"/><circle cx="${CX}" cy="${s + 92}" r="4" fill="${shade}"/>`;
      break;
    case "turtleneck":
      body += `<rect x="${CX - 52}" y="${s - 46}" width="104" height="58" rx="22" fill="${color}"/><path d="M${CX - 44} ${s - 26}Q${CX} ${s - 16} ${CX + 44} ${s - 26}M${CX - 46} ${s - 8}Q${CX} ${s + 2} ${CX + 46} ${s - 8}" fill="none" stroke="${shade}" stroke-width="3" opacity=".7"/>`;
      break;
    case "blazer":
      body += `<path d="M${CX - 54} ${s - 5}L${CX} ${s + 132}L${CX + 54} ${s - 5}Z" fill="${accent}"/><path d="M${CX - 28} ${s - 5}L${CX} ${s + 40}L${CX + 28} ${s - 5}Z" fill="${p.skin}"/><path d="M${CX - 58} ${s - 8}L${CX - 30} ${s + 58}L${CX - 52} ${s + 64}L${CX - 6} ${s + 132}L${CX - 6} 512L${CX - 96} 512L${CX - 96} ${s + 10}ZM${CX + 58} ${s - 8}L${CX + 30} ${s + 58}L${CX + 52} ${s + 64}L${CX + 6} ${s + 132}L${CX + 6} 512L${CX + 96} 512L${CX + 96} ${s + 10}Z" fill="${shade}" opacity=".55"/>`;
      break;
    case "tank":
      body += `<path d="M188 389C204 444 308 444 324 389" fill="none" stroke="${shade}" stroke-width="5"/>`;
      break;
  }
  return { behind, body };
}

function eyes(p: AvatarParams, g: Geo): string {
  const { size, spacing, tilt, color, lashes } = p.eyes;
  const ex = 36 * spacing, y = g.eyeY;
  const surprised = p.expression === "surprised";
  const rx = 15 * size, ry = (surprised ? 12.5 : 10.5) * size;
  const iris = 8.4 * size;
  let out = "";
  for (const side of [-1, 1] as const) {
    const x = CX + side * ex;
    const closed = (p.expression === "wink" && side === 1) || p.expression === "laugh";
    const rot = `transform="rotate(${-side * tilt * 57.3} ${x} ${y})"`;
    if (closed) {
      const d = p.expression === "laugh" ? `M${x - rx} ${y + 3}Q${x} ${y - 11} ${x + rx} ${y + 3}` : `M${x - rx} ${y}Q${x} ${y + 8} ${x + rx} ${y}`;
      out += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${lashes ? 4.5 : 3.5}" stroke-linecap="round" ${rot}/>`;
      continue;
    }
    out += `<g ${rot}><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff"/>`;
    out += `<circle cx="${x + side * 0.6}" cy="${y + 0.5}" r="${iris}" fill="${color}"/><circle cx="${x + side * 0.6}" cy="${y + 0.5}" r="${iris * 0.5}" fill="#120c0a"/>`;
    out += `<circle cx="${x + side * 0.6 + 3}" cy="${y - 2.5}" r="${2.4 * size}" fill="#ffffff"/>`;
    out += `<path d="M${x - rx - 1} ${y + 1}Q${x} ${y - ry * 2 - 1} ${x + rx + 1} ${y + 1}" fill="none" stroke="${INK}" stroke-width="${lashes ? 4.5 : 3}" stroke-linecap="round"/>`;
    if (lashes) out += `<path d="M${x + side * (rx - 1)} ${y - ry * 0.55}l${side * 7} -5" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
    out += `</g>`;
  }
  return out;
}

function brows(p: AvatarParams, g: Geo): string {
  const { thickness, arch, color } = p.brows;
  const ex = 36 * p.eyes.spacing;
  const y = g.eyeY - 25 - (p.expression === "surprised" ? 7 : 0);
  let d = "";
  for (const side of [-1, 1]) {
    const inner = CX + side * (ex - 15), outer = CX + side * (ex + 17);
    const raise = p.expression === "smirk" && side === 1 ? 5 : 0;
    d += `M${inner} ${y + 2 - raise}Q${(inner + outer) / 2} ${y - 6 * arch - raise * 1.6} ${outer} ${y + 3 - raise}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${6 * thickness}" stroke-linecap="round"/>`;
}

function mouth(p: AvatarParams, g: Geo): string {
  const mw = 25 * p.mouth.width, y = g.mouthY;
  const lip = p.mouth.color, line = mix(lip, "#000000", 0.45), inside = "#5a1f24";
  const lw = 3 + p.mouth.lips;
  switch (p.expression) {
    case "neutral":
      return `<path d="M${CX - mw * 0.75} ${y}Q${CX} ${y + 5} ${CX + mw * 0.75} ${y}" fill="none" stroke="${line}" stroke-width="${lw}" stroke-linecap="round"/>`;
    case "smile":
    case "wink":
      return `<path d="M${CX - mw * 0.85} ${y - 4}Q${CX} ${y + 9 + 4 * p.mouth.lips} ${CX + mw * 0.85} ${y - 4}Q${CX} ${y + 3} ${CX - mw * 0.85} ${y - 4}Z" fill="${lip}"/><path d="M${CX - mw} ${y - 5}Q${CX} ${y + 14} ${CX + mw} ${y - 5}" fill="none" stroke="${line}" stroke-width="${lw}" stroke-linecap="round"/>`;
    case "grin":
      return `<path d="M${CX - mw} ${y - 6}Q${CX} ${y + 30} ${CX + mw} ${y - 6}Q${CX} ${y} ${CX - mw} ${y - 6}Z" fill="${inside}"/><path d="M${CX - mw * 0.82} ${y - 3}Q${CX} ${y + 3} ${CX + mw * 0.82} ${y - 3}L${CX + mw * 0.7} ${y + 5}Q${CX} ${y + 11} ${CX - mw * 0.7} ${y + 5}Z" fill="#ffffff"/><path d="M${CX - mw} ${y - 6}Q${CX} ${y + 30} ${CX + mw} ${y - 6}" fill="none" stroke="${line}" stroke-width="3" stroke-linecap="round"/>`;
    case "laugh":
      return `<path d="M${CX - mw - 2} ${y - 8}Q${CX} ${y + 42} ${CX + mw + 2} ${y - 8}Q${CX} ${y - 2} ${CX - mw - 2} ${y - 8}Z" fill="${inside}"/><path d="M${CX - mw * 0.8} ${y - 4}Q${CX} ${y + 1} ${CX + mw * 0.8} ${y - 4}L${CX + mw * 0.72} ${y + 4}Q${CX} ${y + 8} ${CX - mw * 0.72} ${y + 4}Z" fill="#ffffff"/><ellipse cx="${CX}" cy="${y + 20}" rx="${mw * 0.5}" ry="7" fill="#e2727c"/><path d="M${CX - mw - 2} ${y - 8}Q${CX} ${y + 42} ${CX + mw + 2} ${y - 8}" fill="none" stroke="${line}" stroke-width="3" stroke-linecap="round"/>`;
    case "surprised":
      return `<ellipse cx="${CX}" cy="${y + 4}" rx="${9 * p.mouth.width}" ry="12" fill="${inside}" stroke="${lip}" stroke-width="${lw}"/>`;
    case "smirk":
      return `<path d="M${CX - mw * 0.7} ${y + 2}Q${CX + 2} ${y + 7} ${CX + mw * 0.9} ${y - 7}" fill="none" stroke="${line}" stroke-width="${lw}" stroke-linecap="round"/>`;
  }
}

function facialHair(p: AvatarParams, g: Geo, id: string, color: string): { under: string; over: string } {
  const { W, mid, mouthY: y, chin } = g;
  const mw = 25 * p.mouth.width;
  const region = `M${CX - W - 2} ${mid + 8}Q${CX - W * 0.55} ${y - 26} ${CX} ${y - 22}Q${CX + W * 0.55} ${y - 26} ${CX + W + 2} ${mid + 8}L${CX + W + 2} 400L${CX - W - 2} 400Z`;
  const mustache = `M${CX - mw - 5} ${y - 3}C${CX - mw} ${y - 19} ${CX - 8} ${y - 19} ${CX} ${y - 13}C${CX + 8} ${y - 19} ${CX + mw} ${y - 19} ${CX + mw + 5} ${y - 3}C${CX + mw - 6} ${y - 10} ${CX + 8} ${y - 9} ${CX} ${y - 7}C${CX - 8} ${y - 9} ${CX - mw + 6} ${y - 10} ${CX - mw - 5} ${y - 3}Z`;
  const goatee = `M${CX - 17} ${y + 16}Q${CX} ${y + 22} ${CX + 17} ${y + 16}L${CX + 13} ${chin - 1}Q${CX} ${chin + 5} ${CX - 13} ${chin - 1}Z`;
  switch (p.facialHair) {
    case "stubble":
      return { under: `<g clip-path="url(#${id}h)"><path d="${region}" fill="${color}" opacity=".2"/></g>`, over: "" };
    case "beard":
      return {
        under: `<g clip-path="url(#${id}h)"><path d="${region}M${CX - mw - 12} ${y + 2}a${mw + 12} 17 0 1 0 ${(mw + 12) * 2} 0a${mw + 12} 17 0 1 0 ${-(mw + 12) * 2} 0Z" fill="${color}" fill-rule="evenodd"/></g>`,
        over: `<path d="${mustache}" fill="${color}"/>`,
      };
    case "goatee":
      return { under: "", over: `<path d="${mustache}${goatee}" fill="${color}"/>` };
    case "mustache":
      return { under: "", over: `<path d="${mustache}" fill="${color}"/>` };
    default:
      return { under: "", over: "" };
  }
}

function glasses(p: AvatarParams, g: Geo): string {
  if (p.glasses === "none") return "";
  const ex = 36 * p.eyes.spacing, y = g.eyeY, s = p.eyes.size;
  const c = p.glassesColor;
  const lens = p.glasses === "round"
    ? (x: number) => `<circle cx="${x}" cy="${y}" r="${21 * s}"/>`
    : (x: number) => `<rect x="${x - 24 * s}" y="${y - 17 * s}" width="${48 * s}" height="${34 * s}" rx="7"/>`;
  const half = p.glasses === "round" ? 21 * s : 24 * s;
  return `<g fill="#ffffff" fill-opacity=".14" stroke="${c}" stroke-width="4.5">${lens(CX - ex)}${lens(CX + ex)}</g><path d="M${CX - ex + half} ${y - 2}Q${CX} ${y - 9} ${CX + ex - half} ${y - 2}M${CX - ex - half} ${y - 3}L${CX - g.W} ${y - 6}M${CX + ex + half} ${y - 3}L${CX + g.W} ${y - 6}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
}

/** Draw avatar params as an SVG string. */
export function flatAvatarSVG(p: AvatarParams, options: FlatOptions = {}): string {
  const id = "{{id}}";
  const g = geometry(p);
  const { W, mid } = g;
  const skinShade = mix(p.skin, "#000000", 0.14);
  const skinDark = mix(p.skin, "#000000", 0.3);
  const head = headPath(g, p.face.cheeks);
  const h = hair(p, g, id);
  const fit = outfit(p, g, id);
  const beardColor = p.hair.style === "none" || p.hair.style === "headwrap" ? p.brows.color : p.hair.color;
  const fh = facialHair(p, g, id, beardColor);
  const front = h.front.join("");
  const ears = 14 * p.face.ears, earsY = mid + 6;

  let svg = "";
  svg += `<defs><clipPath id="${id}h"><path d="${head}"/></clipPath>${front ? `<clipPath id="${id}c"><path d="${front}"/></clipPath>` : ""}</defs>`;
  if (!options.transparent) svg += `<rect width="512" height="512" fill="${p.background}"/>`;
  // Zoom 1.1x around the bottom centre so the face fills the frame like a profile picture.
  svg += `<g transform="matrix(1.1 0 0 1.1 -25.6 -51.2)">`;
  svg += h.back;
  svg += fit.behind;
  svg += `<path d="M${CX - 33} 270H${CX + 33}V${g.shoulder + 30}H${CX - 33}Z" fill="${p.skin}"/><path d="M${CX - 33} ${g.chin - 30}H${CX + 33}V${g.chin + 22}Q${CX} ${g.chin + 34} ${CX - 33} ${g.chin + 22}Z" fill="${skinShade}"/>`;
  svg += fit.body;
  for (const side of [-1, 1]) {
    const x = CX + side * (W - 2);
    svg += `<ellipse cx="${x}" cy="${earsY}" rx="${ears}" ry="${ears * 1.55}" fill="${p.skin}"/><ellipse cx="${x + side * 2}" cy="${earsY}" rx="${ears * 0.5}" ry="${ears * 0.95}" fill="${skinShade}"/>`;
  }
  if (p.earrings === "studs") svg += `<circle cx="${CX - W - 1}" cy="${earsY + ears * 1.3}" r="4" fill="#e2b44a"/><circle cx="${CX + W + 1}" cy="${earsY + ears * 1.3}" r="4" fill="#e2b44a"/>`;
  if (p.earrings === "hoops") svg += `<g fill="none" stroke="#e2b44a" stroke-width="3"><circle cx="${CX - W - 1}" cy="${earsY + ears * 1.5 + 8}" r="10"/><circle cx="${CX + W + 1}" cy="${earsY + ears * 1.5 + 8}" r="10"/></g>`;
  svg += `<path d="${head}" fill="${p.skin}"/>`;
  // The front hair casts a soft shadow onto the forehead.
  if (front) svg += `<g clip-path="url(#${id}h)"><path d="${front}" fill="${skinShade}" transform="translate(0 7)"/></g>`;
  if (p.blush > 0) svg += `<g fill="#ff5a5a" opacity="${(p.blush * 0.16).toFixed(3)}"><ellipse cx="${CX - 58}" cy="${g.eyeY + 34}" rx="17" ry="10"/><ellipse cx="${CX + 58}" cy="${g.eyeY + 34}" rx="17" ry="10"/></g>`;
  if (p.freckles > 0) {
    const rnd = new Random(`${p.seed}#freckles`);
    let dots = "";
    for (let i = 0, n = Math.round(8 + p.freckles * 10); i < n; i++) {
      const side = i % 2 ? 1 : -1;
      dots += `<circle cx="${CX + side * (20 + rnd.next() * 46)}" cy="${g.eyeY + 20 + rnd.next() * 22}" r="${1.4 + rnd.next()}"/>`;
    }
    svg += `<g fill="${skinDark}" opacity=".55">${dots}</g>`;
  }
  svg += fh.under;
  svg += brows(p, g);
  svg += eyes(p, g);
  const nw = 9 * p.nose.width, ny = 248 + 4 * (p.nose.size - 1);
  svg += `<path d="M${CX - nw} ${ny}Q${CX} ${ny + 6 * p.nose.size} ${CX + nw} ${ny}" fill="none" stroke="${skinDark}" stroke-width="3.5" stroke-linecap="round"/>`;
  svg += mouth(p, g);
  svg += fh.over;
  if (front) svg += `<path d="${front}" fill="${h.frontColor ?? p.hair.color}"/>`;
  svg += h.extra;
  svg += glasses(p, g);
  svg += `</g>`;

  const r = options.shape === "circle" ? 256 : options.shape === "rounded" ? 112 : 0;
  if (r) svg = `<clipPath id="${id}s"><rect width="512" height="512" rx="${r}"/></clipPath><g clip-path="url(#${id}s)">${svg}</g>`;
  // Trim long decimals, then give this drawing unique ids (identical drawings share ids, which is harmless).
  svg = svg.replace(/-?\d*\.\d{3,}/g, (m) => String(Number(Number(m).toFixed(2))));
  svg = svg.replaceAll(id, `z${hash(svg)}`);
  const size = options.size ?? 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${svg}</svg>`;
}

/** Seed (plus optional overrides) to an SVG string. */
export function createFlatAvatar(seed: string, options: AvatarOptions & FlatOptions = {}): string {
  return flatAvatarSVG(generateAvatar(seed, options), options);
}

/** An SVG string as a URL for <img src>, CSS backgrounds and so on. */
export function flatAvatarDataURL(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterize an SVG string to a PNG/WebP/JPEG data URL. Browser only. */
export async function rasterizeSVG(svg: string, options: { size?: number; type?: "image/png" | "image/webp" | "image/jpeg"; quality?: number } = {}): Promise<string> {
  const size = options.size ?? 256;
  const img = new Image(size, size);
  img.src = flatAvatarDataURL(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL(options.type ?? "image/png", options.quality);
}
