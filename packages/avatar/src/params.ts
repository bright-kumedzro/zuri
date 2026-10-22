/** Seed -> avatar parameters. Pure and deterministic; no rendering dependencies. */

import { Random, clamp } from "@zuri/core/random";
import { ACCESSORY_LIST, WARDROBE, garmentInfo, type Accessory, type Outfit } from "./wardrobe/catalog.ts";

export { ACCESSORY_LIST, KENTE, WARDROBE, type Accessory, type Category, type GarmentInfo, type Outfit } from "./wardrobe/catalog.ts";

export type Presentation = "feminine" | "masculine";
export type HairTexture = "straight" | "wavy" | "curly" | "coily";
export type HairStyle =
  | "none" | "buzz" | "crop" | "fade" | "hightop" | "afro" | "puffs" | "bun" | "locs"
  | "braids" | "cornrows" | "long" | "bob" | "ponytail" | "curly" | "headwrap";
export type FacialHair = "none" | "stubble" | "mustache" | "goatee" | "beard";
export type Expression = "neutral" | "smile" | "grin" | "laugh" | "surprised" | "wink" | "smirk";
export type Glasses = "none" | "round" | "square";
/** The underlying head shape; every face then varies around its archetype. */
export type FaceShape = "oval" | "round" | "square" | "heart" | "long" | "diamond";
export type Earrings = "none" | "studs" | "hoops";

export interface AvatarParams {
  seed: string;
  /** Bumped when the generator changes in a way that alters existing seeds. 2: face shapes. */
  version: 2;
  presentation: Presentation;
  /** sRGB hex. */
  skin: string;
  /** 0 = deepest tone, 1 = lightest. */
  skinDepth: number;
  face: {
    shape: FaceShape;
    width: number;
    /** Width of the cranium and forehead relative to the face. */
    crown: number;
    /** Overall face length. */
    height: number;
    /** Forehead height. */
    forehead: number;
    jaw: number;
    /** 0 = rounded jaw, 1 = square corners. */
    jawSquare: number;
    /** Chin length. */
    chin: number;
    /** 0 = broad chin, 1 = pointed. */
    chinPoint: number;
    /** Cheek fullness. */
    cheeks: number;
    cheekbones: number;
    /** 0 = smooth forehead, 1 = a pronounced brow ridge. */
    browRidge: number;
    ears: number;
  };
  /** `y` moves the eyes up (+) or down; `openness` > 0 is rounder, < 0 more hooded. */
  eyes: { size: number; spacing: number; tilt: number; y: number; openness: number; color: string; lashes: boolean };
  brows: { thickness: number; arch: number; color: string };
  nose: { size: number; width: number; length: number; bridge: number };
  mouth: { width: number; lips: number; color: string };
  hair: { style: HairStyle; texture: HairTexture; color: string; volume: number; pattern: string[] };
  facialHair: FacialHair;
  freckles: number;
  blush: number;
  glasses: Glasses;
  glassesColor: string;
  earrings: Earrings;
  outfit: { style: Outfit; color: string; accent: string; stripes: boolean };
  /** Worn on top of the outfit. "headtie" (a gele) covers the hair. */
  accessory: Accessory;
  expression: Expression;
  background: string;
}

export interface AvatarOptions {
  presentation?: Presentation;
  expression?: Expression;
  hair?: HairStyle;
  /** Index into SKIN_TONES or an sRGB hex. */
  skin?: number | string;
  outfit?: Outfit;
  /** `#rrggbb` for the garment's main color (default: from the seed, or the garment's own color, like a white lab coat). */
  outfitColor?: string;
  /** `#rrggbb` for trims, ties, prints and scarves. */
  accentColor?: string;
  accessory?: Accessory;
  /** Head shape; by default it comes from the seed. */
  faceShape?: FaceShape;
  glasses?: Glasses;
  facialHair?: FacialHair;
  background?: string;
}

/** Deep to light. Weighted so every tone is equally likely, with extra depth in the darker range. */
export const SKIN_TONES = [
  "#4e2d1f", "#5c3524", "#6b3f2b", "#7b4a32", "#8b563a", "#9a6343", "#a8704d",
  "#b67e59", "#c48c66", "#cf9b74", "#daab85", "#e4bb98", "#edcbad", "#f4dbc4",
] as const;

export const HAIR_COLORS = {
  black: "#17110f",
  espresso: "#2b1b14",
  darkBrown: "#432a1c",
  brown: "#6b4428",
  auburn: "#87391d",
  ginger: "#c0612b",
  blonde: "#d8b06a",
  platinum: "#e9dcc0",
  grey: "#a8a39d",
  pink: "#e6739f",
  blue: "#4d6be0",
  purple: "#7b55c9",
} as const;

export const EYE_COLORS = {
  darkBrown: "#2e1a10",
  brown: "#5a361e",
  hazel: "#7b5a2c",
  green: "#4c7a48",
  blue: "#3f74b5",
  grey: "#6f8191",
} as const;

export const BACKGROUNDS = [
  "#ffd8cc", "#ffe3a8", "#cfe9d6", "#cde2f7", "#e2d6f6", "#f8d0e0", "#d3efe9", "#f3e3d0", "#dfe8c4",
] as const;

export const CLOTH_COLORS = [
  "#1f2430", "#f4f1ea", "#2f5d8a", "#c8452f", "#e8a33d", "#3f7a55", "#7a4bb0", "#e7709a",
  "#3a3a3a", "#9fb7c9", "#c9b48f", "#1d6f6a", "#f2d24b", "#8a2f45",
] as const;

/** Headwrap / accent print palettes (ankara-inspired). */
export const PRINTS = [
  ["#e8a33d", "#1d6f6a", "#c8452f", "#f4f1ea"],
  ["#7a4bb0", "#f2d24b", "#e7709a", "#1f2430"],
  ["#2f5d8a", "#e8a33d", "#f4f1ea", "#c8452f"],
  ["#3f7a55", "#f2d24b", "#8a2f45", "#f4f1ea"],
  ["#c8452f", "#1f2430", "#e8a33d", "#9fb7c9"],
] as const;

type Weighted<T> = readonly (readonly [T, number])[];

const HAIR_STYLES: Record<Presentation, Record<HairTexture, Weighted<HairStyle>>> = {
  masculine: {
    coily: [["fade", 4], ["buzz", 3], ["hightop", 1], ["afro", 1.5], ["locs", 1.5], ["cornrows", 1], ["none", 1.5]],
    curly: [["curly", 4], ["crop", 2], ["buzz", 1], ["fade", 1], ["none", 0.5]],
    wavy: [["crop", 4], ["curly", 1], ["long", 0.6], ["bun", 0.5], ["buzz", 1], ["none", 0.7]],
    straight: [["crop", 5], ["buzz", 2], ["long", 0.5], ["bun", 0.5], ["none", 1]],
  },
  feminine: {
    coily: [["afro", 3], ["puffs", 2], ["braids", 3], ["locs", 1.5], ["bun", 1.5], ["headwrap", 1.5], ["cornrows", 1], ["curly", 1], ["buzz", 0.5]],
    curly: [["curly", 5], ["bun", 1], ["ponytail", 1], ["long", 1], ["headwrap", 0.4]],
    wavy: [["long", 4], ["bob", 2], ["ponytail", 2], ["bun", 1.5], ["curly", 1]],
    straight: [["long", 4], ["bob", 3], ["ponytail", 2], ["bun", 1.5]],
  },
};

const OUTFITS: Record<Presentation, Weighted<Outfit>> = {
  masculine: [["tee", 4], ["vneck", 1], ["hoodie", 3], ["shirt", 2], ["turtleneck", 1], ["blazer", 1.5]],
  feminine: [["tee", 3], ["vneck", 2], ["hoodie", 2], ["shirt", 1], ["turtleneck", 1.5], ["blazer", 1.5], ["tank", 2]],
};

const EXPRESSIONS: Weighted<Expression> = [
  ["smile", 5], ["grin", 3], ["neutral", 2], ["laugh", 1], ["wink", 0.7], ["smirk", 1], ["surprised", 0.4],
];

export const HAIR_STYLE_LIST = [
  "none", "buzz", "crop", "fade", "hightop", "afro", "puffs", "bun", "locs",
  "braids", "cornrows", "long", "bob", "ponytail", "curly", "headwrap",
] as const satisfies readonly HairStyle[];
export const EXPRESSION_LIST = ["neutral", "smile", "grin", "laugh", "surprised", "wink", "smirk"] as const satisfies readonly Expression[];
/** Every garment in the wardrobe, original tops first. */
export const OUTFIT_LIST = WARDROBE.map((g) => g.id) as readonly Outfit[];

function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Approximate perceived lightness of an sRGB hex color, 0..1. */
function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function blend(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** `#rrggbb`. Anything else is rejected, so options can never smuggle markup into an SVG. */
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => (list as readonly unknown[]).includes(v) ? (v as T) : undefined;

/** Drop option values that aren't valid, so they fall back to the seed instead of breaking the drawing. */
function validOptions(o: AvatarOptions): AvatarOptions {
  return {
    presentation: oneOf(["feminine", "masculine"], o.presentation),
    expression: oneOf(EXPRESSION_LIST, o.expression),
    hair: oneOf(HAIR_STYLE_LIST, o.hair),
    skin: typeof o.skin === "number" ? (Number.isFinite(o.skin) ? o.skin : undefined) : isHexColor(o.skin) ? o.skin : undefined,
    outfit: oneOf(OUTFIT_LIST, o.outfit),
    outfitColor: isHexColor(o.outfitColor) ? o.outfitColor : undefined,
    accentColor: isHexColor(o.accentColor) ? o.accentColor : undefined,
    accessory: oneOf(ACCESSORY_LIST, o.accessory),
    faceShape: oneOf(FACE_SHAPE_LIST, o.faceShape),
    glasses: oneOf(["none", "round", "square"], o.glasses),
    facialHair: oneOf(["none", "stubble", "mustache", "goatee", "beard"], o.facialHair),
    background: isHexColor(o.background) ? o.background : undefined,
  };
}

/** Face-shape archetypes. Each person varies around one of these. */
export const FACE_SHAPE_LIST = ["oval", "round", "square", "heart", "long", "diamond"] as const satisfies readonly FaceShape[];

const FACE_SHAPES: Record<FaceShape, Omit<AvatarParams["face"], "shape" | "ears" | "browRidge">> = {
  oval: { width: 0.95, crown: 1.0, height: 1.05, forehead: 1.0, jaw: 0.92, jawSquare: 0.15, chin: 1.05, chinPoint: 0.45, cheeks: 0.95, cheekbones: 1.0 },
  round: { width: 1.13, crown: 1.03, height: 0.9, forehead: 0.92, jaw: 1.12, jawSquare: 0.05, chin: 0.8, chinPoint: 0.05, cheeks: 1.3, cheekbones: 0.92 },
  square: { width: 1.07, crown: 1.0, height: 0.99, forehead: 0.98, jaw: 1.28, jawSquare: 1.0, chin: 0.92, chinPoint: 0.0, cheeks: 0.9, cheekbones: 1.02 },
  heart: { width: 1.04, crown: 1.1, height: 1.0, forehead: 1.14, jaw: 0.74, jawSquare: 0.05, chin: 1.15, chinPoint: 0.95, cheeks: 0.92, cheekbones: 1.2 },
  long: { width: 0.86, crown: 0.96, height: 1.2, forehead: 1.1, jaw: 0.96, jawSquare: 0.5, chin: 1.28, chinPoint: 0.35, cheeks: 0.85, cheekbones: 0.95 },
  diamond: { width: 0.97, crown: 0.86, height: 1.07, forehead: 0.88, jaw: 0.8, jawSquare: 0.1, chin: 1.15, chinPoint: 0.8, cheeks: 0.88, cheekbones: 1.4 },
};

/**
 * Give the face real structure: an archetype plus individual variation, from its own random stream so the rest
 * of the avatar (skin, hair, outfit…) is unaffected. Also widens the eye, nose and mouth ranges.
 */
function anatomy(p: AvatarParams, rng: Random, faceShape?: FaceShape) {
  const fem = p.presentation === "feminine";
  const drawn = rng.weighted<FaceShape>(
    fem
      ? [["oval", 3], ["heart", 3], ["round", 2.5], ["diamond", 1.5], ["long", 0.8], ["square", 0.4]]
      : [["square", 3.5], ["oval", 3], ["long", 2], ["diamond", 1.5], ["round", 1], ["heart", 0.4]],
  );
  const shape = faceShape ?? drawn;
  const base = FACE_SHAPES[shape];
  const g = (mean: number, sd: number, lo: number, hi: number) => clamp(rng.gaussian(mean, sd), lo, hi);
  p.face = {
    shape,
    width: g(base.width, 0.035, 0.8, 1.2),
    crown: g(base.crown, 0.03, 0.82, 1.16),
    height: g(base.height, 0.035, 0.85, 1.26),
    forehead: g(base.forehead, 0.06, 0.82, 1.2),
    jaw: g(base.jaw * (fem ? 0.97 : 1.04), 0.05, 0.68, 1.36),
    jawSquare: g(base.jawSquare + (fem ? -0.05 : 0.08), 0.12, 0, 1),
    chin: g(base.chin, 0.07, 0.72, 1.4),
    chinPoint: g(base.chinPoint, 0.12, 0, 1),
    cheeks: g(base.cheeks, 0.07, 0.75, 1.35),
    cheekbones: g(base.cheekbones, 0.07, 0.8, 1.5),
    browRidge: g(fem ? 0.05 : 0.75, 0.15, 0, 1),
    ears: p.face.ears,
  };
  // Sexual dimorphism on top of the shape, as avatar systems draw it (Bitmoji, Memoji):
  // masculine = wider, squarer jaw, broad chin, brow ridge, heavier straight brows, smaller eyes, bigger nose, thinner lips;
  // feminine = narrower, rounder jaw, softer chin, fuller cheeks, larger open eyes, arched brows, smaller nose, fuller lips.
  const f = p.face, m = fem ? -1 : 1;
  f.jaw = clamp(f.jaw * (fem ? 0.92 : 1.1), 0.62, 1.42);
  f.jawSquare = clamp(f.jawSquare + 0.25 * m, 0, 1);
  // Feminine chins are small but rounded rather than V-shaped.
  f.chinPoint = clamp(fem ? f.chinPoint * 0.7 + 0.05 : f.chinPoint - 0.18, 0, 1);
  f.chin = clamp(f.chin + 0.07 * m, 0.7, 1.45);
  f.height = clamp(f.height + 0.03 * m, 0.84, 1.28);
  f.cheeks = clamp(f.cheeks - 0.09 * m, 0.72, 1.4);
  f.cheekbones = clamp(f.cheekbones - 0.06 * m, 0.78, 1.52);
  p.brows.thickness = clamp(p.brows.thickness * (fem ? 0.78 : 1.3), 0.5, 1.9);
  p.brows.arch = clamp(p.brows.arch * (fem ? 1.3 : 0.55), 0.2, 2);
  // Stretch the existing variation in eyes, nose and mouth, and add placement.
  const widen = (v: number, mean: number, k: number, lo: number, hi: number) => clamp(mean + (v - mean) * k, lo, hi);
  p.eyes.size = widen(p.eyes.size, fem ? 1.04 : 0.98, 1.8, 0.82, 1.24) * (fem ? 1.08 : 0.93);
  p.eyes.spacing = widen(p.eyes.spacing, 1, 1.7, 0.86, 1.15);
  p.eyes.y = g(0, 0.025, -0.06, 0.06);
  p.eyes.openness = clamp(g(0, 0.35, -1, 1) + (fem ? 0.3 : -0.25), -1, 1);
  p.nose.size = widen(p.nose.size, 1, 1.3, 0.72, 1.4) * (fem ? 0.87 : 1.12);
  p.nose.width = widen(p.nose.width, 1, 1.3, 0.75, 1.45) * (fem ? 0.9 : 1.08);
  p.nose.length = g(1, 0.09, 0.8, 1.25);
  p.nose.bridge = g(fem ? 0.88 : 1.15, 0.15, 0.6, 1.5);
  p.mouth.lips = clamp(p.mouth.lips * (fem ? 1.25 : 0.78), 0.6, 1.7);
  p.mouth.width = widen(p.mouth.width, 1, 1.4, 0.8, 1.25);
}

export function generateAvatar(seed: string, rawOptions: AvatarOptions = {}): AvatarParams {
  const options = validOptions(rawOptions);
  seed = String(seed);
  const root = new Random(seed);
  const id = root.fork("identity");
  const shape = root.fork("shape");
  const style = root.fork("style");
  const mood = root.fork("mood");

  const presentation: Presentation = options.presentation ?? (id.next() < 0.5 ? "feminine" : "masculine");
  const fem = presentation === "feminine";

  let toneIndex = Math.floor(id.next() * SKIN_TONES.length);
  if (typeof options.skin === "number") toneIndex = clamp(Math.round(options.skin), 0, SKIN_TONES.length - 1);
  const skin = typeof options.skin === "string" ? options.skin : SKIN_TONES[toneIndex]!;
  const skinDepth = toneIndex / (SKIN_TONES.length - 1);

  // Hair texture correlates with skin depth, but every combination stays possible.
  const coily = 0.08 + 0.7 * (1 - skinDepth) ** 1.5;
  const texture = id.weighted<HairTexture>([
    ["coily", coily],
    ["curly", 0.2],
    ["wavy", 0.35 * skinDepth + 0.05],
    ["straight", 0.5 * skinDepth + 0.05],
  ]);

  const dark = skinDepth < 0.55;
  const naturalHair = id.weighted<keyof typeof HAIR_COLORS>(
    dark
      ? [["black", 6], ["espresso", 3], ["darkBrown", 1]]
      : [["black", 1.5], ["espresso", 2], ["darkBrown", 3], ["brown", 3], ["auburn", 1], ["ginger", 0.6], ["blonde", 2], ["platinum", 0.4]],
  );
  const hairColorKey = style.next() < 0.05 ? style.pick(["pink", "blue", "purple", "platinum", "blonde"] as const) : naturalHair;
  // Hair too close to the skin tone reads as a bald head: push it darker until it separates.
  let hairColor: string = HAIR_COLORS[hairColorKey];
  while (Math.abs(luma(hairColor) - luma(skin)) < 0.14 && luma(hairColor) > 0.05) hairColor = darken(hairColor, 0.8);

  const eyeColor = EYE_COLORS[
    id.weighted<keyof typeof EYE_COLORS>(
      skinDepth < 0.6
        ? [["darkBrown", 7], ["brown", 3], ["hazel", 0.5]]
        : [["darkBrown", 2], ["brown", 3], ["hazel", 2], ["green", 1.2], ["blue", 2], ["grey", 0.8]],
    )
  ];

  const hairStyle = options.hair ?? style.weighted(HAIR_STYLES[presentation][texture]);
  const outfitStyle = options.outfit ?? style.weighted(OUTFITS[presentation]);
  const clothA = style.pick(CLOTH_COLORS);
  let clothB = style.pick(CLOTH_COLORS);
  if (clothB === clothA) clothB = CLOTH_COLORS[(CLOTH_COLORS.indexOf(clothA) + 3) % CLOTH_COLORS.length]!;

  // Feminine lips carry more color; masculine lips stay close to the skin.
  const lipBase = blend(skin, fem ? "#c0405a" : "#8e4a48", fem ? 0.58 : 0.22);

  const params: AvatarParams = {
    seed,
    version: 2,
    presentation,
    skin,
    skinDepth,
    face: {
      shape: "oval",
      crown: 1, height: 1, forehead: 1, jawSquare: 0, chinPoint: 0, cheekbones: 1, browRidge: 0,
      width: clamp(shape.gaussian(1, 0.035), 0.92, 1.08),
      jaw: clamp(shape.gaussian(fem ? 0.95 : 1.06, 0.05), 0.82, 1.18),
      chin: clamp(shape.gaussian(1, 0.08), 0.8, 1.2),
      cheeks: clamp(shape.gaussian(1, 0.08), 0.8, 1.2),
      ears: clamp(shape.gaussian(1, 0.08), 0.8, 1.2),
    },
    eyes: {
      size: clamp(shape.gaussian(fem ? 1.04 : 0.98, 0.05), 0.88, 1.15),
      spacing: clamp(shape.gaussian(1, 0.04), 0.9, 1.1),
      tilt: clamp(shape.gaussian(0.04, 0.05), -0.08, 0.16),
      y: 0,
      openness: 0,
      color: eyeColor,
      lashes: fem,
    },
    brows: {
      thickness: clamp(shape.gaussian(fem ? 0.85 : 1.1, 0.15), 0.6, 1.5),
      arch: clamp(shape.gaussian(fem ? 1.1 : 0.8, 0.2), 0.3, 1.6),
      color: hairStyle === "none" || hairColorKey === "grey" || hairColorKey === "platinum" || hairColorKey === "pink" || hairColorKey === "blue" || hairColorKey === "purple"
        ? darken(naturalHair === "platinum" || naturalHair === "blonde" ? HAIR_COLORS.brown : HAIR_COLORS[naturalHair], 0.9)
        : darken(hairColor, 0.85),
    },
    nose: {
      size: clamp(shape.gaussian(1, 0.1), 0.75, 1.3),
      width: clamp(shape.gaussian(1 + (1 - skinDepth) * 0.15, 0.1), 0.8, 1.35),
      length: 1,
      bridge: 1,
    },
    mouth: {
      width: clamp(shape.gaussian(1, 0.07), 0.85, 1.18),
      lips: clamp(shape.gaussian(fem ? 1.1 : 0.95, 0.12) + (1 - skinDepth) * 0.12, 0.7, 1.4),
      color: lipBase,
    },
    hair: {
      style: hairStyle,
      texture,
      color: hairColor,
      volume: clamp(style.gaussian(1, 0.08), 0.85, 1.15),
      pattern: [...style.pick(PRINTS)],
    },
    facialHair: options.facialHair ?? (fem ? "none" : style.weighted<FacialHair>([["none", 5], ["stubble", 2.5], ["beard", 1.5], ["goatee", 1], ["mustache", 0.6]])),
    freckles: skinDepth > 0.6 && shape.next() < 0.25 ? shape.range(0.4, 1) : 0,
    blush: fem ? style.range(0.5, 1) : style.range(0.1, 0.4),
    glasses: options.glasses ?? style.weighted<Glasses>([["none", 7], ["round", 1.4], ["square", 1.6]]),
    glassesColor: style.pick(["#1a1716", "#1a1716", "#5b3a22", "#c9a24d", "#8c2f3a"]),
    earrings: fem ? style.weighted<Earrings>([["none", 3], ["studs", 2], ["hoops", 2]]) : style.weighted<Earrings>([["none", 9], ["studs", 1]]),
    outfit: {
      style: outfitStyle,
      // An explicit color wins; otherwise a garment with its own color (lab coat, denim) uses that, then the seed's.
      color: options.outfitColor ?? garmentInfo(outfitStyle)?.color ?? clothA,
      accent: options.accentColor ?? garmentInfo(outfitStyle)?.accent ?? clothB,
      stripes: style.next() < 0.15,
    },
    accessory: options.accessory ?? "none",
    expression: options.expression ?? mood.weighted(EXPRESSIONS),
    background: options.background ?? mood.pick(BACKGROUNDS),
  };
  anatomy(params, root.fork("anatomy"), options.faceShape);
  return params;
}
