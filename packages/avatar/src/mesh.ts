/**
 * The heavy, pure half of building an avatar: fields -> meshes with vertex colors. No three.js or DOM, so it
 * runs in a Web Worker and the results transfer back as typed arrays.
 */

import type { AvatarParams } from "./params.ts";
import { buildRig, type AvatarStyle } from "./head.ts";
import { polygonize, type RawMesh } from "./mesher.ts";
import { FACE_UV } from "./face.ts";
import { buildBrows, buildFacialHair, buildHair } from "./hair.ts";
import { buildOutfit } from "./outfit.ts";
import { noise3, type SDF } from "./sdf.ts";

export interface PartMesh extends RawMesh {
  colors?: Float32Array;
  uvs?: Float32Array;
}

export interface AvatarMeshes {
  style: AvatarStyle;
  body: PartMesh;
  hair: (PartMesh & { print: boolean }) | null;
  facialHair: PartMesh | null;
  outfit: PartMesh;
  /** Sculpted brows (toon only; the soft style paints them). */
  brows: PartMesh | null;
  /** Top of the hair (or head), for framing. */
  top: number;
}

/** sRGB hex -> linear RGB, matching THREE.Color's conversion. */
export function linearRGB(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const v = c / 255;
    return v < 0.04045 ? v * 0.0773993808 : Math.pow(v * 0.9478672986 + 0.0521327014, 2.4);
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

/** Average each vertex color with its neighbors so hard region boundaries don't zigzag along the grid. */
function smoothColors(indices: Uint32Array, colors: Float32Array, iterations: number) {
  const n = colors.length / 3;
  const sum = new Float32Array(colors.length);
  const cnt = new Uint16Array(n);
  for (let it = 0; it < iterations; it++) {
    sum.set(colors);
    cnt.fill(1);
    for (let t = 0; t < indices.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = indices[t + e]!, b = indices[t + ((e + 1) % 3)]!;
        sum[a * 3] += colors[b * 3]!; sum[a * 3 + 1] += colors[b * 3 + 1]!; sum[a * 3 + 2] += colors[b * 3 + 2]!;
        sum[b * 3] += colors[a * 3]!; sum[b * 3 + 1] += colors[a * 3 + 1]!; sum[b * 3 + 2] += colors[a * 3 + 2]!;
        cnt[a]!++; cnt[b]!++;
      }
    }
    for (let i = 0; i < n; i++) {
      colors[i * 3] = sum[i * 3]! / cnt[i]!; colors[i * 3 + 1] = sum[i * 3 + 1]! / cnt[i]!; colors[i * 3 + 2] = sum[i * 3 + 2]! / cnt[i]!;
    }
  }
}

/**
 * Ambient occlusion baked per vertex from the distance fields: step out along the normal and see how close the
 * rest of the avatar is. Creases (under hair, inside collars, around the nose) come out darker, which gives the
 * soft, rich shading of an offline render at no runtime cost. Returns a 0..1 multiplier per vertex.
 */
function bakeAO(m: RawMesh, scene: SDF): Float32Array {
  const n = m.positions.length / 3;
  const ao = new Float32Array(n);
  const steps = [0.03, 0.07, 0.12, 0.19, 0.28];
  for (let i = 0; i < n; i++) {
    const px = m.positions[i * 3]!, py = m.positions[i * 3 + 1]!, pz = m.positions[i * 3 + 2]!;
    const nx = m.normals[i * 3]!, ny = m.normals[i * 3 + 1]!, nz = m.normals[i * 3 + 2]!;
    let occ = 0, weight = 1;
    for (const h of steps) {
      occ += Math.max(0, h - scene(px + nx * h, py + ny * h, pz + nz * h)) * weight;
      weight *= 0.72;
    }
    const v = Math.min(1, Math.max(0, 1 - 2.6 * occ));
    ao[i] = 0.42 + 0.58 * v * v * (3 - 2 * v);
  }
  return ao;
}

/** Multiply vertex colors (or plain white) by baked occlusion. */
function shadeAO(colors: Float32Array | undefined, ao: Float32Array): Float32Array {
  const out = colors ?? new Float32Array(ao.length * 3).fill(1);
  for (let i = 0; i < ao.length; i++) {
    out[i * 3]! *= ao[i]!; out[i * 3 + 1]! *= ao[i]!; out[i * 3 + 2]! *= ao[i]!;
  }
  return out;
}

/** Front-planar UVs for the painted face; back-facing vertices sample the plain skin border. */
function faceUVs(m: RawMesh): Float32Array {
  const n = m.positions.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = m.positions[i * 3]!, y = m.positions[i * 3 + 1]!, z = m.positions[i * 3 + 2]!;
    const u = (x - FACE_UV.x0) / (FACE_UV.x1 - FACE_UV.x0);
    uv[i * 2] = z > -0.1 ? u : x > 0 ? 0.999 : 0.001;
    uv[i * 2 + 1] = (y - FACE_UV.y0) / (FACE_UV.y1 - FACE_UV.y0);
  }
  return uv;
}

export function meshAvatar(p: AvatarParams, quality = 1, style: AvatarStyle = "soft"): AvatarMeshes {
  const rig = buildRig(p, style);
  const toon = style === "toon";

  const bodyRaw = polygonize(rig.body, rig.bodyBox, 0.028 / quality);
  const body: PartMesh = { ...bodyRaw, uvs: faceUVs(bodyRaw) };

  let top = 1.2;
  let hair: AvatarMeshes["hair"] = null;
  const hairShape = buildHair(p, rig);
  if (hairShape) {
    const raw = polygonize(hairShape.sdf, hairShape.box, hairShape.cell / quality);
    const n = raw.positions.length / 3;
    const colors = new Float32Array(n * 3);
    const base = linearRGB(p.hair.color);
    const print = p.hair.pattern.map(linearRGB);
    const cz = rig.skullCenter[2];
    for (let i = 0; i < n; i++) {
      const x = raw.positions[i * 3]!, y = raw.positions[i * 3 + 1]!, z = raw.positions[i * 3 + 2]!;
      top = Math.max(top, y);
      let c = base, v: number;
      if (hairShape.print) {
        const a = Math.atan2(x, z - cz);
        c = print[Math.floor(y * 6 + 0.6 * Math.abs(Math.sin(a * 7)) + 100) % 4]!;
        v = Math.sin(a * 24) * Math.sin(y * 40) > 0.6 ? 1.25 : 1;
      } else {
        // Darker toward the scalp, lighter on the outer clumps.
        const depth = Math.min(1, Math.max(0, rig.skull(x, y, z) / 0.35));
        // Toon hair is cleaner: the sculpted grooves carry the detail, not color noise.
        v = toon ? (0.82 + 0.18 * depth) * (0.97 + 0.06 * noise3(x * 2, y * 2, z * 2)) : (0.78 + 0.22 * depth) * (0.92 + 0.16 * noise3(x * 3, y * 3, z * 3));
      }
      colors[i * 3] = c[0] * v; colors[i * 3 + 1] = c[1] * v; colors[i * 3 + 2] = c[2] * v;
    }
    if (hairShape.print) smoothColors(raw.indices, colors, 1);
    hair = { ...raw, colors, print: !!hairShape.print };
  }

  let facialHair: PartMesh | null = null;
  const beardShape = buildFacialHair(p, rig);
  if (beardShape) {
    const raw = polygonize(beardShape.sdf, beardShape.box, beardShape.cell / quality);
    const base = linearRGB(p.brows.color);
    const n = raw.positions.length / 3;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = 0.85 + 0.2 * noise3(raw.positions[i * 3]! * 9, raw.positions[i * 3 + 1]! * 9, raw.positions[i * 3 + 2]! * 9);
      colors[i * 3] = base[0] * v; colors[i * 3 + 1] = base[1] * v; colors[i * 3 + 2] = base[2] * v;
    }
    facialHair = { ...raw, colors };
  }

  const outfitShape = buildOutfit(p, rig);
  const outfitRaw = polygonize(outfitShape.sdf, outfitShape.box, outfitShape.cell / quality);
  const main = linearRGB(p.outfit.color);
  // Suits read as formal in deep tones, so the jacket is a darker shade of the person's outfit color.
  const jacket = p.outfit.style === "suit" ? (main.map((c) => c * 0.32) as [number, number, number]) : main;
  const palette = [jacket, linearRGB(p.outfit.accent), linearRGB("#f4f1ea")];
  const n = outfitRaw.positions.length / 3;
  const outfitColors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = palette[outfitShape.region(outfitRaw.positions[i * 3]!, outfitRaw.positions[i * 3 + 1]!, outfitRaw.positions[i * 3 + 2]!)]!;
    outfitColors[i * 3] = c[0]; outfitColors[i * 3 + 1] = c[1]; outfitColors[i * 3 + 2] = c[2];
  }
  smoothColors(outfitRaw.indices, outfitColors, 2);

  let brows: PartMesh | null = null;
  const outfit: PartMesh = { ...outfitRaw, colors: outfitColors };
  if (toon) {
    const shape = buildBrows(p, rig);
    const raw = polygonize(shape.sdf, shape.box, shape.cell / quality);
    const base = linearRGB(p.brows.color);
    const colors = new Float32Array(raw.positions.length);
    for (let i = 0; i < colors.length; i += 3) colors.set(base, i);
    brows = { ...raw, colors };

    // Bake contact shadows across every part, so hair shades the forehead and collars shade the neck.
    const parts: SDF[] = [rig.body, outfitShape.sdf];
    if (hairShape) parts.push(hairShape.sdf);
    if (beardShape) parts.push(beardShape.sdf);
    const scene: SDF = (x, y, z) => {
      let d = Infinity;
      for (const f of parts) d = Math.min(d, f(x, y, z));
      return d;
    };
    for (const part of [body, hair, facialHair, outfit]) if (part) part.colors = shadeAO(part.colors, bakeAO(part, scene));
  }

  return { style, body, hair, facialHair, outfit, brows, top };
}

/** Every typed array in the result, for zero-copy postMessage. */
export function transferables(m: AvatarMeshes): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const part of [m.body, m.hair, m.facialHair, m.outfit, m.brows]) {
    if (!part) continue;
    for (const a of [part.positions, part.normals, part.indices, part.colors, part.uvs]) if (a) out.push(a.buffer as ArrayBuffer);
  }
  return out;
}
