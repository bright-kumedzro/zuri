/** Seed -> avatar parameters. Pure and deterministic; no rendering dependencies. */

import { Random, clamp } from "@zuri/core/random";

export type Presentation = "feminine" | "masculine";
export type HairTexture = "straight" | "wavy" | "curly" | "coily";
export type HairStyle =
  | "none" | "buzz" | "crop" | "fade" | "hightop" | "afro" | "puffs" | "bun" | "locs"
  | "braids" | "cornrows" | "long" | "bob" | "ponytail" | "curly" | "headwrap";
export type FacialHair = "none" | "stubble" | "mustache" | "goatee" | "beard";
export type Outfit = "tee" | "vneck" | "hoodie" | "shirt" | "turtleneck" | "blazer" | "tank";
export type Expression = "neutral" | "smile" | "grin" | "laugh" | "surprised" | "wink" | "smirk";
export type Glasses = "none" | "round" | "square";
export type Earrings = "none" | "studs" | "hoops";

export interface AvatarParams {
  seed: string;
  /** Bumped when the generator changes in a way that alters existing seeds. */
  version: 1;
  presentation: Presentation;
  /** sRGB hex. */
  skin: string;
  /** 0 = deepest tone, 1 = lightest. */
  skinDepth: number;
  face: { width: number; jaw: number; chin: number; cheeks: number; ears: number };
  eyes: { size: number; spacing: number; tilt: number; color: string; lashes: boolean };
  brows: { thickness: number; arch: number; color: string };
  nose: { size: number; width: number };
  mouth: { width: number; lips: number; color: string };
  hair: { style: HairStyle; texture: HairTexture; color: string; volume: number; pattern: string[] };
  facialHair: FacialHair;
  freckles: number;
  blush: number;
  glasses: Glasses;
  glassesColor: string;
  earrings: Earrings;
  outfit: { style: Outfit; color: string; accent: string; stripes: boolean };
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
export const OUTFIT_LIST = ["tee", "vneck", "hoodie", "shirt", "turtleneck", "blazer", "tank"] as const satisfies readonly Outfit[];

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

export function generateAvatar(seed: string, options: AvatarOptions = {}): AvatarParams {
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

  const lipBase = blend(skin, fem ? "#b5485a" : "#8e4a48", fem ? 0.45 : 0.3);

  return {
    seed,
    version: 1,
    presentation,
    skin,
    skinDepth,
    face: {
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
    outfit: { style: outfitStyle, color: clothA, accent: clothB, stripes: style.next() < 0.15 },
    expression: options.expression ?? mood.weighted(EXPRESSIONS),
    background: options.background ?? mood.pick(BACKGROUNDS),
  };
}
