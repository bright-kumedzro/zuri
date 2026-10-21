/**
 * SDF -> triangle mesh (surface nets). An octree descent only samples the field near the surface, then
 * every vertex is projected onto the surface and gets an analytic normal, so meshes come out smooth.
 */

import type { SDF, Vec3 } from "./sdf.ts";

export interface RawMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface Box {
  min: Vec3;
  max: Vec3;
}

const CORNERS = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1];
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
/** Safety factor on the distance bound (fields with noise displacement aren't exact distances). */
const LIPSCHITZ = 1.6;

export function polygonize(f: SDF, box: Box, cell: number): RawMesh {
  const [x0, y0, z0] = box.min;
  const nx = Math.ceil((box.max[0] - x0) / cell) + 1;
  const ny = Math.ceil((box.max[1] - y0) / cell) + 1;
  const nz = Math.ceil((box.max[2] - z0) / cell) + 1;
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const field = new Float32Array(nx * ny * nz).fill(NaN);
  const val = (i: number, j: number, k: number) => {
    const n = i + nx * (j + ny * k);
    let v = field[n]!;
    if (v !== v) {
      v = f(x0 + i * cell, y0 + j * cell, z0 + k * cell);
      field[n] = v;
    }
    return v;
  };

  // 1. Octree descent: prune nodes whose center is farther from the surface than their half-diagonal.
  const cells: number[] = [];
  let root = 2;
  while (root < Math.max(cnx, cny, cnz)) root *= 2;
  const stack: number[] = [0, 0, 0, root];
  while (stack.length) {
    const s = stack.pop()!, k0 = stack.pop()!, j0 = stack.pop()!, i0 = stack.pop()!;
    if (i0 >= cnx || j0 >= cny || k0 >= cnz) continue;
    const h = s / 2;
    const d = f(x0 + (i0 + h) * cell, y0 + (j0 + h) * cell, z0 + (k0 + h) * cell);
    if (Math.abs(d) > LIPSCHITZ * 0.8661 * s * cell) continue;
    if (s > 2) {
      stack.push(i0, j0, k0, h, i0 + h, j0, k0, h, i0, j0 + h, k0, h, i0 + h, j0 + h, k0, h,
        i0, j0, k0 + h, h, i0 + h, j0, k0 + h, h, i0, j0 + h, k0 + h, h, i0 + h, j0 + h, k0 + h, h);
      continue;
    }
    const i1 = Math.min(i0 + s, cnx), j1 = Math.min(j0 + s, cny), k1 = Math.min(k0 + s, cnz);
    for (let k = k0; k < k1; k++) {
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          // Evaluate every corner (no short-circuit): the vertex pass reads all eight.
          let negs = 0;
          for (let m = 0; m < 8; m++) if (val(i + CORNERS[m * 3]!, j + CORNERS[m * 3 + 1]!, k + CORNERS[m * 3 + 2]!) < 0) negs++;
          if (negs !== 0 && negs !== 8) cells.push(i, j, k);
        }
      }
    }
  }

  // 2. One vertex per surface-crossing cell, at the mean of its edge crossings.
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const count = cells.length / 3;
  const pos = new Float64Array(count * 3);
  const c = new Float64Array(8);
  for (let q = 0; q < count; q++) {
    const i = cells[q * 3]!, j = cells[q * 3 + 1]!, k = cells[q * 3 + 2]!;
    for (let m = 0; m < 8; m++) c[m] = field[i + CORNERS[m * 3]! + nx * (j + CORNERS[m * 3 + 1]! + ny * (k + CORNERS[m * 3 + 2]!))]!;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 24; e += 2) {
      const ea = EDGES[e]!, eb = EDGES[e + 1]!;
      const va = c[ea]!, vb = c[eb]!;
      if (va < 0 === vb < 0) continue;
      const t = va / (va - vb);
      sx += CORNERS[ea * 3]! + t * (CORNERS[eb * 3]! - CORNERS[ea * 3]!);
      sy += CORNERS[ea * 3 + 1]! + t * (CORNERS[eb * 3 + 1]! - CORNERS[ea * 3 + 1]!);
      sz += CORNERS[ea * 3 + 2]! + t * (CORNERS[eb * 3 + 2]! - CORNERS[ea * 3 + 2]!);
      cnt++;
    }
    cellVert[i + cnx * (j + cny * k)] = q;
    pos[q * 3] = x0 + (i + sx / cnt) * cell;
    pos[q * 3 + 1] = y0 + (j + sy / cnt) * cell;
    pos[q * 3 + 2] = z0 + (k + sz / cnt) * cell;
  }

  // 3. A quad around every sign-changing grid edge.
  const tris: number[] = [];
  const cv = (i: number, j: number, k: number) => cellVert[i + cnx * (j + cny * k)]!;
  const quad = (a: number, b: number, d: number, e: number) => {
    if (a < 0 || b < 0 || d < 0 || e < 0) return;
    tris.push(a, b, d, a, d, e);
  };
  for (let q = 0; q < count; q++) {
    const i = cells[q * 3]!, j = cells[q * 3 + 1]!, k = cells[q * 3 + 2]!;
    const s0 = field[i + nx * (j + ny * k)]! < 0;
    if (j > 0 && k > 0 && s0 !== field[i + 1 + nx * (j + ny * k)]! < 0)
      quad(cv(i, j, k), cv(i, j - 1, k), cv(i, j - 1, k - 1), cv(i, j, k - 1));
    if (i > 0 && k > 0 && s0 !== field[i + nx * (j + 1 + ny * k)]! < 0)
      quad(cv(i, j, k), cv(i - 1, j, k), cv(i - 1, j, k - 1), cv(i, j, k - 1));
    if (i > 0 && j > 0 && s0 !== field[i + nx * (j + ny * (k + 1))]! < 0)
      quad(cv(i, j, k), cv(i - 1, j, k), cv(i - 1, j - 1, k), cv(i, j - 1, k));
  }

  // 4. Project onto the surface. Four tetrahedral samples give both the gradient and the distance.
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const h = cell * 0.08;
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3]!, y = pos[v * 3 + 1]!, z = pos[v * 3 + 2]!;
    const a = f(x + h, y - h, z - h), b = f(x - h, y - h, z + h), d = f(x - h, y + h, z - h), e = f(x + h, y + h, z + h);
    let gx = a - b - d + e, gy = -a - b + d + e, gz = -a + b - d + e;
    const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= len; gy /= len; gz /= len;
    const dist = Math.max(-cell, Math.min(cell, (a + b + d + e) * 0.25));
    positions[v * 3] = x - gx * dist;
    positions[v * 3 + 1] = y - gy * dist;
    positions[v * 3 + 2] = z - gz * dist;
    normals[v * 3] = gx; normals[v * 3 + 1] = gy; normals[v * 3 + 2] = gz;
  }

  // 5. Orient every triangle to agree with the field normal.
  const indices = new Uint32Array(tris);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3, b = indices[t + 1]! * 3, d = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[d]! - positions[a]!, vy = positions[d + 1]! - positions[a + 1]!, vz = positions[d + 2]! - positions[a + 2]!;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nxs = normals[a]! + normals[b]! + normals[d]!;
    const nys = normals[a + 1]! + normals[b + 1]! + normals[d + 1]!;
    const nzs = normals[a + 2]! + normals[b + 2]! + normals[d + 2]!;
    if (fx * nxs + fy * nys + fz * nzs < 0) {
      indices[t + 1] = d / 3;
      indices[t + 2] = b / 3;
    }
  }

  return { positions, normals, indices };
}

/** March from the front along -z to the surface at (x, y); used to place features on the face. */
export function surfaceZ(f: SDF, x: number, y: number, zStart = 2, zEnd = -1): number {
  let z = zStart;
  for (let i = 0; i < 128 && z > zEnd; i++) {
    const d = f(x, y, z);
    if (d < 1e-4) return z;
    z -= Math.max(d * 0.8, 1e-3);
  }
  return z;
}
