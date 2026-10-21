/**
 * The heavy, pure half of building an avatar: fields -> meshes with vertex colors. No three.js or DOM, so it
 * runs in a Web Worker and the results transfer back as typed arrays.
 */

import type { AvatarParams } from "./params.ts";
import { buildRig } from "./head.ts";
import { polygonize, type RawMesh } from "./mesher.ts";
import { FACE_UV } from "./face.ts";
import { buildFacialHair, buildHair } from "./hair.ts";
import { buildOutfit } from "./outfit.ts";
import { noise3 } from "./sdf.ts";

export interface PartMesh extends RawMesh {
  colors?: Float32Array;
  uvs?: Float32Array;
}

export interface AvatarMeshes {
  body: PartMesh;
  hair: (PartMesh & { print: boolean }) | null;
  facialHair: PartMesh | null;
  outfit: PartMesh;
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

export function meshAvatar(p: AvatarParams, quality = 1): AvatarMeshes {
  const rig = buildRig(p);

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
        v = (0.78 + 0.22 * depth) * (0.92 + 0.16 * noise3(x * 3, y * 3, z * 3));
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
  const palette = [linearRGB(p.outfit.color), linearRGB(p.outfit.accent), linearRGB("#f4f1ea")];
  const n = outfitRaw.positions.length / 3;
  const outfitColors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = palette[outfitShape.region(outfitRaw.positions[i * 3]!, outfitRaw.positions[i * 3 + 1]!, outfitRaw.positions[i * 3 + 2]!)]!;
    outfitColors[i * 3] = c[0]; outfitColors[i * 3 + 1] = c[1]; outfitColors[i * 3 + 2] = c[2];
  }
  smoothColors(outfitRaw.indices, outfitColors, 2);

  return { body, hair, facialHair, outfit: { ...outfitRaw, colors: outfitColors }, top };
}

/** Every typed array in the result, for zero-copy postMessage. */
export function transferables(m: AvatarMeshes): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const part of [m.body, m.hair, m.facialHair, m.outfit]) {
    if (!part) continue;
    for (const a of [part.positions, part.normals, part.indices, part.colors, part.uvs]) if (a) out.push(a.buffer as ArrayBuffer);
  }
  return out;
}
