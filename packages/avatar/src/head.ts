/**
 * Head and body shape as one signed distance field, plus the landmark positions (eyes, mouth, brows,
 * ears) that the other parts attach to. Units: the cranium is ~1 unit in radius; y up, +z faces the viewer.
 */

import type { AvatarParams } from "./params.ts";
import { type SDF, capsule, ellipsoid, smax, smin, sphere } from "./sdf.ts";
import { type Box, surfaceZ } from "./mesher.ts";

/** "soft" is the Memoji-like default; "toon" is an animated-film look with bigger eyes and head. */
export type AvatarStyle = "soft" | "toon";

export const SHOULDER_Y = -1.72;
/** Where the bust is cut off. */
export const BODY_BOTTOM = -2.25;

export interface Rig {
  style: AvatarStyle;
  /** Skin surface: head, neck and shoulders. */
  body: SDF;
  bodyBox: Box;
  /** Head without features or neck, for offsetting beards. */
  face: SDF;
  /** Cranium ellipsoid only, for offsetting hair. */
  skull: SDF;
  skullCenter: [number, number, number];
  /** Upper torso, for offsetting clothes. */
  torso: SDF;
  neck: { radius: number; top: number; z: number };
  /** Right eye (+x); the left eye mirrors it. */
  eye: { x: number; y: number; z: number; r: number };
  mouth: { y: number; z: number; w: number };
  browY: number;
  ear: { x: number; y: number; z: number; h: number };
  noseTip: [number, number, number];
}

export function buildRig(p: AvatarParams, style: AvatarStyle = "soft"): Rig {
  const masc = p.presentation === "masculine";
  const toon = style === "toon";
  const { width: fw, jaw: jw, chin: ch, ears: er } = p.face;
  // Toon: rounder cheeks and a slightly fuller cranium, so the head reads bigger and friendlier.
  const ck = p.face.cheeks * (toon ? 1.12 : 1);
  const skullW = toon ? 0.95 : 0.92, skullH = toon ? 1.04 : 1;
  const smileCheek = p.expression === "grin" || p.expression === "laugh" ? 1.08 : p.expression === "smile" || p.expression === "wink" ? 1.04 : 1;

  const skullCenter: [number, number, number] = [0, 0.15, -0.05];
  const skull: SDF = (x, y, z) => ellipsoid(x, y - 0.15, z + 0.05, skullW * fw, skullH, 0.98);

  const face: SDF = (x, y, z) => {
    let d = skull(x, y, z);
    // Lower face narrows toward the chin.
    const taper = 1 + 0.3 * Math.min(1, Math.max(0, -(y + 0.3)));
    d = smin(d, ellipsoid(x * taper, y + 0.34, z - 0.1, 0.76 * jw * fw, 0.72, 0.8), 0.4);
    d = smin(d, ellipsoid(x, y + 0.84 + 0.07 * (ch - 1), z - 0.34, 0.3 * jw * (masc ? 1.12 : 1), 0.2 * ch, 0.26), 0.3);
    const ax = Math.abs(x);
    d = smin(d, ellipsoid(ax - 0.42 * fw, y + 0.2, z - 0.44, 0.27 * ck * smileCheek, 0.23 * ck, 0.28 * ck * smileCheek), 0.22);
    return d;
  };

  // Landmarks, measured on the featureless face.
  const r = (toon ? 0.215 : 0.165) * p.eyes.size;
  const ex = (toon ? 0.36 : 0.335) * p.eyes.spacing * fw;
  const ey = toon ? 0.0 : 0.02;
  const ez = surfaceZ(face, ex, ey) - 0.62 * r;
  const browY = ey + r + 0.13;
  const my = -0.53;
  const mz = surfaceZ(face, 0, my);
  const mw = 0.2 * p.mouth.width * (toon ? 1.15 : 1);

  // Toon noses are bigger and rounder.
  const ns = p.nose.size * (toon ? 1.22 : 1), nw = p.nose.width * (toon ? 1.08 : 1);
  const nzTip = surfaceZ(face, 0, -0.3) + 0.1 * ns;
  const nzTop = surfaceZ(face, 0, ey) - 0.06;
  const noseTip: [number, number, number] = [0, -0.31, nzTip];
  const nzWing = surfaceZ(face, 0.1, -0.33);

  const earX = 0.9 * fw, earY = -0.02, earZ = -0.1, earH = 0.21 * er;
  // A slimmer neck and shoulders make the toon head look larger without changing the framing.
  const neckR = (masc ? 0.4 : 0.35) * (toon ? 0.86 : 1);
  const shoulderW = (masc ? 0.98 : 0.84) * (toon ? 0.9 : 1);

  const head: SDF = (x, y, z) => {
    let d = face(x, y, z);
    const ax = Math.abs(x);
    // Nose: bridge-to-tip cone plus nostril wings.
    if (z > 0.3 && y < 0.25 && y > -0.6 && ax < 0.35) {
      let n = capsule(x, y, z, 0, ey, nzTop, 0, -0.31 + 0.03 * (ns - 1), nzTip - 0.05, 0.045, 0.085 * nw * ns);
      n = smin(n, ellipsoid(ax - 0.085 * nw * ns, y + 0.335, z - nzWing, 0.068 * ns * nw, 0.055 * ns, 0.06 * ns), 0.05);
      d = smin(d, n, 0.07);
    }
    // Lips: soft volumes the painted mouth sits on.
    if (z > 0.3 && y < -0.35 && y > -0.75 && ax < 0.4) {
      const lip = Math.min(
        ellipsoid(x, y - my - 0.035, z - mz + 0.035, mw * 1.05, 0.03 + 0.02 * p.mouth.lips, 0.06),
        ellipsoid(x, y - my + 0.045, z - mz + 0.04, mw * 0.9, 0.035 + 0.022 * p.mouth.lips, 0.06),
      );
      d = smin(d, lip, 0.05);
    }
    // Ears with a concave bowl.
    if (ax > 0.6 && Math.abs(y - earY) < 0.4) {
      let e = ellipsoid(ax - earX, y - earY, z - earZ, 0.085, earH, 0.15 * er);
      e = smax(e, -ellipsoid(ax - earX - 0.075, y - earY, z - earZ + 0.02, 0.05, earH * 0.68, 0.095 * er), 0.03);
      d = smin(d, e, 0.05);
    }
    return d;
  };

  const torso: SDF = (x, y, z) => {
    // Shoulders slope down from the neck.
    let d = capsule(x, y + 0.08 * x * x, z, -shoulderW, SHOULDER_Y, -0.2, shoulderW, SHOULDER_Y, -0.2, 0.36);
    d = smin(d, ellipsoid(x, y - SHOULDER_Y + 0.6, z + 0.16, shoulderW + 0.34, 0.8, 0.56), 0.3);
    return d;
  };

  const body: SDF = (x, y, z) => {
    let d = head(x, y, z);
    // Eye sockets.
    const dx = Math.abs(x) - ex;
    if (Math.abs(dx) < 0.4 && Math.abs(y - ey) < 0.4) d = smax(d, -sphere(dx, y - ey, z - ez, r + 0.006), 0.035);
    const neck = capsule(x, y, z, 0, -0.45, -0.22, 0, SHOULDER_Y + 0.1, -0.18, neckR);
    d = smin(d, neck, 0.22);
    d = smin(d, torso(x, y, z), 0.4);
    return Math.max(d, BODY_BOTTOM - y);
  };

  return {
    style,
    body,
    bodyBox: { min: [-1.55, BODY_BOTTOM - 0.02, -1.15], max: [1.55, 1.25, 1.35] },
    face: head,
    skull,
    skullCenter,
    torso,
    neck: { radius: neckR, top: -0.45, z: -0.2 },
    eye: { x: ex, y: ey, z: ez, r },
    mouth: { y: my, z: mz, w: mw },
    browY,
    ear: { x: earX, y: earY, z: earZ, h: earH },
    noseTip,
  };
}
