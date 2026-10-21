/** Parameters -> fitted geometry. Renderer-agnostic: output is plain typed arrays in meters, Y up, feet at y=0. */

import { f32, i16, u32, type Ethnicity, type ProxyEntry, type ProxyKind, type ProxyMaterial, type ZuriAssets } from "./assets.ts";
import { yearsToAge, type CharacterParams, type RGB } from "./params.ts";
import { clamp } from "./random.ts";

const DM_TO_M = 0.1;

export interface MeshData {
  id: string;
  kind: "body" | ProxyKind;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Higher draws later (MakeHuman z_depth). */
  renderOrder: number;
  material: ProxyMaterial & { tint?: RGB };
}

export interface Character {
  params: CharacterParams;
  meshes: MeshData[];
  /** Standing height in meters, including shoes. */
  height: number;
  /** Approximate eye-level y in meters, for framing portraits. */
  eyeHeight: number;
}

const MACRO_VARS = (p: CharacterParams): Record<string, number> => {
  const ramp = (v: number) => ({ min: Math.max(0, 1 - v * 2), max: Math.max(0, v * 2 - 1) });
  const age = yearsToAge(p.ageYears);
  const ages =
    age < 0.5
      ? (() => {
          const young = Math.max(0, (age - 0.1875) * 3.2);
          const baby = Math.max(0, 1 - age * 5.333);
          return { baby, child: Math.max(0, Math.min(1, 5.333 * age) - young), young, old: 0 };
        })()
      : { baby: 0, child: 0, young: 1 - (age * 2 - 1), old: age * 2 - 1 };
  const muscle = ramp(p.muscle);
  const weight = ramp(p.weight);
  const height = ramp(p.height);
  const prop = ramp(p.proportions);
  const cup = ramp(p.breastSize);
  const firm = ramp(p.breastFirmness);
  return {
    female: 1 - p.gender,
    male: p.gender,
    ...ages,
    minmuscle: muscle.min, maxmuscle: muscle.max, averagemuscle: 1 - muscle.min - muscle.max,
    minweight: weight.min, maxweight: weight.max, averageweight: 1 - weight.min - weight.max,
    minheight: height.min, maxheight: height.max,
    uncommonproportions: prop.min, idealproportions: prop.max,
    mincup: cup.min, maxcup: cup.max, averagecup: 1 - cup.min - cup.max,
    minfirmness: firm.min, maxfirmness: firm.max, averagefirmness: 1 - firm.min - firm.max,
    ...p.ethnicity,
  };
};

/** Apply all body-shape targets to the base mesh. Returns positions in decimeters (MakeHuman units). */
export function morphBody(assets: ZuriAssets, params: CharacterParams): Float32Array {
  const m = assets.manifest;
  const pos = new Float32Array(f32(assets.base, m.base.positions));

  // Macro targets are stored as a PCA basis: delta = sum_k (sum_t w_t * C[t,k]) * B_k.
  const vars = MACRO_VARS(params);
  const K = m.macro.components;
  const coeffs = f32(assets.macro, m.macro.coeffs);
  const scales = f32(assets.macro, m.macro.scales);
  const basis = i16(assets.macro, m.macro.basis);
  const c = new Float64Array(K);
  m.macro.targets.forEach((t, ti) => {
    let w = 1;
    for (const f of t.factors) w *= vars[f] ?? 0;
    if (w === 0) return;
    for (let k = 0; k < K; k++) c[k]! += w * coeffs[ti * K + k]!;
  });
  const n3 = pos.length;
  for (let k = 0; k < K; k++) {
    const s = c[k]! * scales[k]!;
    if (Math.abs(s) < 1e-9) continue;
    const off = k * n3;
    for (let i = 0; i < n3; i++) pos[i]! += s * basis[off + i]!;
  }

  // Sparse detail targets: face shape and expression.
  const addSparse = (index: number | null | undefined, w: number) => {
    if (index == null || w === 0) return;
    const t = m.detail.targets[index]!;
    const idx = u32(assets.targets, t.indices);
    const d = i16(assets.targets, t.deltas);
    const s = w * t.scale;
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i]! * 3;
      pos[v]! += s * d[i * 3]!;
      pos[v + 1]! += s * d[i * 3 + 1]!;
      pos[v + 2]! += s * d[i * 3 + 2]!;
    }
  };
  for (const mod of m.detail.modifiers) {
    const v = params.face[mod.id] ?? 0;
    if (v < 0) addSparse(mod.min, -v);
    else addSparse(mod.max, v);
  }
  for (const [unit, w] of Object.entries(params.expression)) {
    const byEth = m.detail.expressions[unit];
    if (!byEth) continue;
    for (const eth of Object.keys(byEth) as Ethnicity[]) addSparse(byEth[eth], w * params.ethnicity[eth]);
  }
  return pos;
}

/** Barefoot standing height of a morphed body, in meters. */
function bodyHeight(assets: ZuriAssets, pos: Float32Array): number {
  const map = u32(assets.base, assets.manifest.base.body.map);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < map.length; i++) {
    const y = pos[map[i]! * 3 + 1]!;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return (hi - lo) * DM_TO_M;
}

/**
 * Morph the body, solving the height slider so the result matches `params.stature`.
 * Height targets are linear in their weight on each side of 0.5, so two probes give an exact answer.
 */
function morphToStature(assets: ZuriAssets, params: CharacterParams): Float32Array {
  if (params.stature == null) return morphBody(assets, params);
  const mid = morphBody(assets, { ...params, height: 0.5 });
  const hMid = bodyHeight(assets, mid);
  const end = params.stature > hMid ? 1 : 0;
  const hEnd = bodyHeight(assets, morphBody(assets, { ...params, height: end }));
  const t = Math.abs(hEnd - hMid) < 1e-6 ? 0 : clamp((params.stature - hMid) / (hEnd - hMid), 0, 1);
  if (t === 0) return mid;
  params.height = 0.5 + (end - 0.5) * t;
  return morphBody(assets, params);
}

function computeNormals(src: Float32Array, map: Uint32Array, index: Uint32Array, out: Float32Array) {
  // Accumulate on source vertices so UV seams stay smooth, then scatter to render vertices.
  const acc = new Float32Array(src.length);
  for (let i = 0; i < index.length; i += 3) {
    const a = map[index[i]!]! * 3, b = map[index[i + 1]!]! * 3, c = map[index[i + 2]!]! * 3;
    const e1x = src[b]! - src[a]!, e1y = src[b + 1]! - src[a + 1]!, e1z = src[b + 2]! - src[a + 2]!;
    const e2x = src[c]! - src[a]!, e2y = src[c + 1]! - src[a + 1]!, e2z = src[c + 2]! - src[a + 2]!;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      acc[v]! += nx; acc[v + 1]! += ny; acc[v + 2]! += nz;
    }
  }
  for (let r = 0; r < map.length; r++) {
    const v = map[r]! * 3;
    const x = acc[v]!, y = acc[v + 1]!, z = acc[v + 2]!;
    const l = Math.hypot(x, y, z) || 1;
    out[r * 3] = x / l; out[r * 3 + 1] = y / l; out[r * 3 + 2] = z / l;
  }
}

function scatter(src: Float32Array, map: Uint32Array): Float32Array {
  const out = new Float32Array(map.length * 3);
  for (let r = 0; r < map.length; r++) {
    const v = map[r]! * 3;
    out[r * 3] = src[v]!; out[r * 3 + 1] = src[v + 1]!; out[r * 3 + 2] = src[v + 2]!;
  }
  return out;
}

/** Fit a proxy (hair, clothes, eyes...) to the morphed body, as MakeHuman's proxy.getCoords does. */
function fitProxy(entry: ProxyEntry, buf: ArrayBuffer, body: Float32Array): Float32Array {
  const refs = u32(buf, entry.refs);
  const w = f32(buf, entry.weights);
  const off = f32(buf, entry.offsets);
  const scale = [1, 1, 1];
  if (entry.scale) {
    entry.scale.forEach(([a, b, den], axis) => {
      scale[axis] = Math.abs(body[a * 3 + axis]! - body[b * 3 + axis]!) / den;
    });
  }
  const out = new Float32Array(entry.vertexCount * 3);
  for (let i = 0; i < entry.vertexCount; i++) {
    const r0 = refs[i * 3]! * 3, r1 = refs[i * 3 + 1]! * 3, r2 = refs[i * 3 + 2]! * 3;
    const w0 = w[i * 3]!, w1 = w[i * 3 + 1]!, w2 = w[i * 3 + 2]!;
    for (let a = 0; a < 3; a++) {
      out[i * 3 + a] = w0 * body[r0 + a]! + w1 * body[r1 + a]! + w2 * body[r2 + a]! + off[i * 3 + a]! * scale[a]!;
    }
  }
  return out;
}

/** Build a complete, fitted character. Fetches any proxy assets it needs. */
export async function buildCharacter(assets: ZuriAssets, params: CharacterParams): Promise<Character> {
  const m = assets.manifest;
  const body = morphToStature(assets, params);

  const proxyIds = [params.eyes && "eyes", "teeth", params.eyebrows, params.eyelashes, params.hair, params.outfit, params.shoes]
    .filter((id): id is string => !!id && assets.proxyById.has(id));
  const proxyBufs = await Promise.all(proxyIds.map((id) => assets.proxyData(id)));

  // Hide body skin under clothes to prevent poke-through.
  const hidden = new Uint8Array(m.vertexCount);
  proxyIds.forEach((id, i) => {
    for (const v of u32(proxyBufs[i]!, assets.proxyById.get(id)!.deleteVerts)) hidden[v] = 1;
  });

  const meshes: MeshData[] = [];

  const bodyMap = u32(assets.base, m.base.body.map);
  const allIndex = u32(assets.base, m.base.body.index);
  const keep: number[] = [];
  for (let i = 0; i < allIndex.length; i += 3) {
    if (hidden[bodyMap[allIndex[i]!]!] || hidden[bodyMap[allIndex[i + 1]!]!] || hidden[bodyMap[allIndex[i + 2]!]!]) continue;
    keep.push(allIndex[i]!, allIndex[i + 1]!, allIndex[i + 2]!);
  }
  const bodyIndex = Uint32Array.from(keep);
  const bodyNormals = new Float32Array(bodyMap.length * 3);
  computeNormals(body, bodyMap, allIndex, bodyNormals);
  const skin = pickSkin(assets, params);
  meshes.push({
    id: "body",
    kind: "body",
    positions: scatter(body, bodyMap),
    normals: bodyNormals,
    uvs: new Float32Array(f32(assets.base, m.base.body.uv)),
    indices: bodyIndex,
    renderOrder: 0,
    material: { transparent: false, doubleSided: false, map: skin, tint: params.skin.tint },
  });

  proxyIds.forEach((id, i) => {
    const entry = assets.proxyById.get(id)!;
    const buf = proxyBufs[i]!;
    const fitted = fitProxy(entry, buf, body);
    const map = u32(buf, entry.map);
    const index = u32(buf, entry.index);
    const normals = new Float32Array(map.length * 3);
    computeNormals(fitted, map, index, normals);
    const material: MeshData["material"] = { ...entry.material };
    if (entry.kind === "eyes") {
      material.map = m.eyeColors.find((e) => e.id === params.eyes)?.map ?? material.map;
    }
    if (entry.kind === "hair" || entry.kind === "eyebrows") material.tint = params.hairColor;
    meshes.push({
      id,
      kind: entry.kind,
      positions: scatter(fitted, map),
      normals,
      uvs: new Float32Array(f32(buf, entry.uv)),
      indices: new Uint32Array(index),
      renderOrder: entry.zDepth,
      material,
    });
  });

  // Meters, feet on the ground.
  let minY = Infinity, maxY = -Infinity;
  for (const mesh of meshes) {
    if (mesh.kind !== "body" && mesh.kind !== "shoes") continue;
    for (let i = 1; i < mesh.positions.length; i += 3) minY = Math.min(minY, mesh.positions[i]!);
  }
  for (const mesh of meshes) {
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      p[i]! *= DM_TO_M;
      p[i + 1] = (p[i + 1]! - minY) * DM_TO_M;
      p[i + 2]! *= DM_TO_M;
      if (mesh.kind === "body") maxY = Math.max(maxY, p[i + 1]!);
    }
  }
  const eyes = meshes.find((x) => x.kind === "eyes");
  let eyeHeight = maxY * 0.93;
  if (eyes) {
    let s = 0;
    for (let i = 1; i < eyes.positions.length; i += 3) s += eyes.positions[i]!;
    eyeHeight = s / (eyes.positions.length / 3);
  }

  return { params, meshes, height: maxY, eyeHeight };
}

function pickSkin(assets: ZuriAssets, p: CharacterParams): string {
  const age = p.ageYears < 38 ? "young" : p.ageYears < 60 ? "middleage" : "old";
  const gender = p.gender >= 0.5 ? "male" : "female";
  const skins = assets.manifest.skins;
  const match =
    skins.find((s) => s.age === age && s.gender === gender && s.ethnicity === p.skin.ethnicity) ??
    skins.find((s) => s.gender === gender && s.ethnicity === p.skin.ethnicity) ??
    skins[0]!;
  return match.map;
}
