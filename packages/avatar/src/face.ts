/**
 * Painted facial features. The texture is projected onto the head along z, so drawing happens directly in
 * head coordinates: x in [-1, 1], y in [-1.2, 0.8].
 */

import { Random } from "@zuri/core/random";
import type { AvatarParams, Expression } from "./params.ts";
import type { Rig } from "./head.ts";

export const FACE_UV = { x0: -1, x1: 1, y0: -1.2, y1: 0.8 } as const;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

export function shade(hex: string, f: number, alpha = 1): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.min(255, Math.round(((n >> s) & 255) * f));
  return `rgba(${ch(16)},${ch(8)},${ch(0)},${alpha})`;
}

export function paintFace(p: AvatarParams, rig: Rig, size = 1024): HTMLCanvasElement | OffscreenCanvas {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d") as Ctx;
  ctx.fillStyle = p.skin;
  ctx.fillRect(0, 0, size, size);
  // Draw in head units, y up.
  ctx.setTransform(size / 2, 0, 0, -size / 2, size / 2, size * 0.4);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const rng = new Random(`${p.seed}/paint`);
  blush(ctx, p);
  if (p.freckles > 0) freckles(ctx, p, rng);
  if (p.facialHair === "stubble" || p.facialHair === "beard" || p.facialHair === "goatee") stubble(ctx, p, rng);
  brows(ctx, p, rig);
  mouth(ctx, p, rig);
  return canvas;
}

function blush(ctx: Ctx, p: AvatarParams) {
  const a = 0.26 * p.blush * (0.45 + 0.55 * p.skinDepth);
  for (const s of [-1, 1]) {
    const cx = s * 0.47, cy = -0.27;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.22);
    g.addColorStop(0, `rgba(235,85,95,${a})`);
    g.addColorStop(1, "rgba(235,85,95,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - 0.25, cy - 0.25, 0.5, 0.5);
  }
}

function freckles(ctx: Ctx, p: AvatarParams, rng: Random) {
  ctx.fillStyle = shade(p.skin, 0.68, 0.55);
  const n = Math.round(40 * p.freckles);
  for (let i = 0; i < n; i++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = side * rng.range(0.05, 0.55), y = -0.2 + rng.gaussian(0, 0.07) - Math.abs(x) * 0.15;
    ctx.beginPath();
    ctx.arc(x, y, rng.range(0.005, 0.011), 0, Math.PI * 2);
    ctx.fill();
  }
}

function stubble(ctx: Ctx, p: AvatarParams, rng: Random) {
  ctx.save();
  ctx.beginPath();
  if (p.facialHair === "goatee") {
    ctx.ellipse(0, -0.72, 0.24, 0.3, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(-0.8, -0.05);
    ctx.lineTo(-0.66, -0.3);
    ctx.quadraticCurveTo(-0.4, -0.42, -0.2, -0.4);
    ctx.lineTo(0.2, -0.4);
    ctx.quadraticCurveTo(0.4, -0.42, 0.66, -0.3);
    ctx.lineTo(0.8, -0.05);
    ctx.lineTo(0.8, -1.15);
    ctx.lineTo(-0.8, -1.15);
    ctx.closePath();
  }
  ctx.clip();
  ctx.fillStyle = shade(p.hair.style === "none" ? "#2b1b14" : p.brows.color, 1, 0.12);
  ctx.fillRect(-1, -1.2, 2, 1.2);
  ctx.fillStyle = shade(p.brows.color, 0.9, 0.35);
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(-0.8, 0.8), y = rng.range(-1.15, -0.3);
    ctx.fillRect(x, y, 0.005, 0.005);
  }
  ctx.restore();
}

function browLift(e: Expression, side: number): { lift: number; inner: number } {
  switch (e) {
    case "surprised": return { lift: 0.07, inner: 0.02 };
    case "laugh": return { lift: 0.03, inner: 0.01 };
    case "grin": return { lift: 0.015, inner: 0 };
    case "smirk": return side > 0 ? { lift: 0.045, inner: 0 } : { lift: -0.005, inner: -0.01 };
    case "wink": return side < 0 ? { lift: -0.02, inner: -0.01 } : { lift: 0.02, inner: 0 };
    default: return { lift: 0, inner: 0 };
  }
}

function brows(ctx: Ctx, p: AvatarParams, rig: Rig) {
  const t = 0.05 * p.brows.thickness;
  const arch = 0.05 * p.brows.arch;
  const spread = rig.eye.x / 0.335;
  for (const s of [-1, 1]) {
    const { lift, inner } = browLift(p.expression, s);
    const by = rig.browY + lift;
    const ix = s * 0.11 * spread, mx = s * 0.31 * spread, ox = s * 0.53 * spread;
    const iy = by + inner, my = by + arch, oy = by - 0.01 + arch * 0.1;
    ctx.beginPath();
    ctx.moveTo(ix, iy + t * 0.55);
    ctx.quadraticCurveTo(mx, my + t * 0.6, ox, oy);
    ctx.quadraticCurveTo(mx, my - t * 0.45, ix, iy - t * 0.5);
    ctx.quadraticCurveTo(ix - s * 0.025, iy, ix, iy + t * 0.55);
    ctx.fillStyle = p.brows.color;
    ctx.fill();
    // Hair strokes along the brow so it reads as hair, not paint.
    ctx.strokeStyle = shade(p.brows.color, 1.5, 0.25);
    ctx.lineWidth = 0.004;
    for (let i = 0; i < 9; i++) {
      const f = i / 9;
      const x = ix + (ox - ix) * f, y = iy + (oy - iy) * f + arch * 4 * f * (1 - f);
      ctx.beginPath();
      ctx.moveTo(x, y - t * 0.3 * (1 - f));
      ctx.lineTo(x + s * 0.04, y + t * 0.3 * (1 - f) + 0.01);
      ctx.stroke();
    }
  }
}

function mouth(ctx: Ctx, p: AvatarParams, rig: Rig) {
  const { y: my } = rig.mouth;
  const w = rig.mouth.w;
  const L = p.mouth.lips;
  const lip = p.mouth.color;
  const lipHi = shade(lip, 1.12);
  const line = shade(lip, 0.45);
  const inner = "#3a1416";
  const e = p.expression;

  const lips = (cornerY: number, lineDip: number, upper: number, lower: number, rx = 0, skew = 0) => {
    const lx = -w - rx, rxx = w + rx;
    const ly = my + cornerY - skew, ry = my + cornerY + skew;
    // Upper lip with a cupid's bow.
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(-w * 0.55, my + upper * 0.9 + cornerY * 0.3, -w * 0.14, my + upper);
    ctx.quadraticCurveTo(0, my + upper * 0.72, w * 0.14, my + upper);
    ctx.quadraticCurveTo(w * 0.55, my + upper * 0.9 + cornerY * 0.3, rxx, ry);
    ctx.quadraticCurveTo(0, my - lineDip * 2, lx, ly);
    ctx.fillStyle = lip;
    ctx.fill();
    // Lower lip.
    ctx.beginPath();
    ctx.moveTo(lx + 0.01, ly);
    ctx.quadraticCurveTo(0, my - lineDip * 2, rxx - 0.01, ry);
    ctx.quadraticCurveTo(0, my - lineDip - lower * 2, lx + 0.01, ly);
    ctx.fillStyle = lipHi;
    ctx.fill();
    // Mouth line.
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(0, my - lineDip * 2, rxx, ry);
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.014;
    ctx.stroke();
  };

  const open = (cornerY: number, top: number, bottom: number, widen: number, teeth: number, tongue: number) => {
    const lx = -w * widen, rx = w * widen;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(lx, my + cornerY);
      ctx.quadraticCurveTo(0, my + top, rx, my + cornerY);
      ctx.quadraticCurveTo(rx * 0.95, my + bottom * 0.4, 0, my + bottom);
      ctx.quadraticCurveTo(lx * 0.95, my + bottom * 0.4, lx, my + cornerY);
      ctx.closePath();
    };
    // Lip rim around the opening.
    path();
    ctx.strokeStyle = lip;
    ctx.lineWidth = 0.05 * L;
    ctx.stroke();
    path();
    ctx.fillStyle = inner;
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    if (tongue > 0) {
      ctx.fillStyle = "#c95a63";
      ctx.beginPath();
      ctx.ellipse(0, my + bottom + 0.01, w * 0.55, tongue, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (teeth > 0) {
      ctx.fillStyle = "#fbf6ee";
      ctx.beginPath();
      ctx.moveTo(lx, my + cornerY + 0.02);
      ctx.quadraticCurveTo(0, my + top + 0.02, rx, my + cornerY + 0.02);
      ctx.lineTo(rx, my + cornerY - teeth);
      ctx.quadraticCurveTo(0, my + top - teeth * 1.1, lx, my + cornerY - teeth);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    path();
    ctx.strokeStyle = shade(lip, 0.55, 0.8);
    ctx.lineWidth = 0.008;
    ctx.stroke();
  };

  switch (e) {
    case "neutral":
      lips(0, 0.004, 0.03 + 0.02 * L, 0.03 + 0.025 * L);
      break;
    case "smile":
      lips(0.045, 0.03, 0.02 + 0.015 * L, 0.025 + 0.02 * L, 0.02);
      dimples(ctx, p, w * 1.12, my + 0.045);
      break;
    case "smirk":
      lips(0.02, 0.012, 0.02 + 0.015 * L, 0.025 + 0.02 * L, 0.01, 0.03);
      break;
    case "grin":
    case "wink":
      open(0.05, 0.01, -0.13, 1.08, 0.05, 0);
      dimples(ctx, p, w * 1.2, my + 0.05);
      break;
    case "laugh":
      open(0.055, 0.02, -0.25, 1.12, 0.05, 0.06);
      break;
    case "surprised": {
      ctx.beginPath();
      ctx.ellipse(0, my - 0.04, w * 0.42, 0.085, 0, 0, Math.PI * 2);
      ctx.strokeStyle = lip;
      ctx.lineWidth = 0.05 * L;
      ctx.stroke();
      ctx.fillStyle = inner;
      ctx.fill();
      break;
    }
  }
}

function dimples(ctx: Ctx, p: AvatarParams, x: number, y: number) {
  ctx.strokeStyle = shade(p.skin, 0.72, 0.5);
  ctx.lineWidth = 0.008;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * (x - 0.01), y + 0.03);
    ctx.quadraticCurveTo(s * (x + 0.025), y, s * (x - 0.005), y - 0.035);
    ctx.stroke();
  }
}
