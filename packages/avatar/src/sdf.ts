/** Signed distance primitives and noise. Distances are negative inside. */

export type SDF = (x: number, y: number, z: number) => number;
export type Vec3 = [number, number, number];

/** Polynomial smooth minimum: blends two shapes with a fillet of size k. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum (intersection / subtraction with a fillet). */
export function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

export function sphere(x: number, y: number, z: number, r: number): number {
  return Math.sqrt(x * x + y * y + z * z) - r;
}

/** Approximate ellipsoid distance (point relative to the center). */
export function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/** Capsule (or cone, when r1 != r2) between a and b. */
export function capsule(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2 = r1,
): number {
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
}

/** Torus lying in the XZ plane, centered at the origin. */
export function torus(x: number, y: number, z: number, major: number, minor: number): number {
  const q = Math.sqrt(x * x + z * z) - major;
  return Math.sqrt(q * q + y * y) - minor;
}

export function roundBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Gradient noise (Perlin, fixed permutation so output is identical everywhere) ---

const PERM = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]!;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function grad(h: number, x: number, y: number, z: number): number {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** 3D gradient noise in roughly [-1, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  x -= xi; y -= yi; z -= zi;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X]! + Y, AA = PERM[A]! + Z, AB = PERM[A + 1]! + Z;
  const B = PERM[X + 1]! + Y, BA = PERM[B]! + Z, BB = PERM[B + 1]! + Z;
  const l = (a: number, b: number, t: number) => a + t * (b - a);
  return l(
    l(l(grad(PERM[AA]! & 15, x, y, z), grad(PERM[BA]! & 15, x - 1, y, z), u),
      l(grad(PERM[AB]! & 15, x, y - 1, z), grad(PERM[BB]! & 15, x - 1, y - 1, z), u), v),
    l(l(grad(PERM[AA + 1]! & 15, x, y, z - 1), grad(PERM[BA + 1]! & 15, x - 1, y, z - 1), u),
      l(grad(PERM[AB + 1]! & 15, x, y - 1, z - 1), grad(PERM[BB + 1]! & 15, x - 1, y - 1, z - 1), u), v),
    w,
  );
}
