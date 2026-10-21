/** Seed -> character parameters. Pure and deterministic; needs no assets. */

import { Random, clamp } from "./random.ts";
import type { Ethnicity } from "./assets.ts";

export type Gender = "male" | "female";
export type Expression = keyof typeof EXPRESSIONS;
export type RGB = [number, number, number];

export interface CharacterParams {
  seed: string;
  /** 0 = female, 1 = male (MakeHuman convention). */
  gender: number;
  ageYears: number;
  /** 0..1, 0.5 = average. */
  muscle: number;
  weight: number;
  /** MakeHuman height slider 0..1. Ignored when `stature` is set. */
  height: number;
  /** Target standing height in meters (barefoot). The engine solves `height` to match it. */
  stature?: number;
  proportions: number;
  breastSize: number;
  breastFirmness: number;
  ethnicity: Record<Ethnicity, number>;
  /** Face modifier id -> -1..1. Ids match manifest.detail.modifiers. */
  face: Record<string, number>;
  /** Expression unit -> 0..1. */
  expression: Record<string, number>;
  skin: { ethnicity: Ethnicity; tint: RGB };
  eyes: string;
  eyebrows: string;
  eyelashes: string;
  hair: string | null;
  hairColor: RGB;
  outfit: string | null;
  shoes: string | null;
}

export interface GenerateOptions {
  gender?: Gender;
  /** Exact age or [min, max] in years. Default 18-70, weighted toward 20-45. */
  age?: number | [number, number];
  /** A single ethnicity, explicit weights, or "mixed". Default: random. */
  ethnicity?: Ethnicity | "mixed" | Partial<Record<Ethnicity, number>>;
  expression?: Expression;
  /** Dress the character. Default true. */
  clothed?: boolean;
}

export const EXPRESSIONS = {
  neutral: {},
  smile: {
    "mouth-corner-puller": 0.75,
    "mouth-elevation": 0.15,
    "eye-left-slit": 0.2,
    "eye-right-slit": 0.2,
  },
  grin: {
    "mouth-corner-puller": 0.9,
    "mouth-parling": 0.5,
    "mouth-open": 0.1,
    "eye-left-slit": 0.3,
    "eye-right-slit": 0.3,
  },
  surprised: {
    "eyebrows-left-up": 0.8,
    "eyebrows-right-up": 0.8,
    "eye-left-opened-up": 0.6,
    "eye-right-opened-up": 0.6,
    "mouth-open": 0.45,
  },
  serious: {
    "eyebrows-left-down": 0.35,
    "eyebrows-right-down": 0.35,
    "mouth-compression": 0.3,
  },
  sad: {
    "eyebrows-left-inner-up": 0.7,
    "eyebrows-right-inner-up": 0.7,
    "mouth-depression": 0.5,
  },
} satisfies Record<string, Record<string, number>>;

/** Hairstyle weights per gender and dominant ethnicity. `null` = bald / shaved. */
const HAIR: Record<Gender, Record<Ethnicity, readonly (readonly [string | null, number])[]>> = {
  female: {
    african: [["afro01", 4], ["braid01", 4], ["short03", 2], ["bob02", 1], ["ponytail01", 1]],
    asian: [["long01", 3], ["bob01", 3], ["bob02", 2], ["ponytail01", 2], ["short03", 1]],
    caucasian: [["long01", 3], ["ponytail01", 3], ["bob01", 2], ["bob02", 2], ["braid01", 1], ["short03", 1]],
  },
  male: {
    african: [["short04", 5], ["afro01", 2], [null, 3]],
    asian: [["short02", 4], ["short01", 3], ["short04", 2], [null, 1]],
    caucasian: [["short02", 3], ["short01", 3], ["short04", 2], [null, 1]],
  },
};

const OUTFITS: Record<Gender, readonly string[]> = {
  female: ["female_casualsuit01", "female_casualsuit02", "female_sportsuit01", "female_elegantsuit01"],
  male: [
    "male_casualsuit01", "male_casualsuit02", "male_casualsuit03", "male_casualsuit04",
    "male_casualsuit05", "male_casualsuit06", "male_worksuit01", "male_elegantsuit01",
  ],
};

const SHOES = ["shoes01", "shoes02", "shoes03", "shoes04", "shoes05", "shoes06"];

const EYE_COLORS: Record<Ethnicity, readonly (readonly [string, number])[]> = {
  african: [["brown", 8], ["brownlight", 2]],
  asian: [["brown", 8], ["brownlight", 2]],
  caucasian: [["brown", 3], ["brownlight", 2], ["blue", 2], ["bluegreen", 1], ["green", 1], ["grey", 1], ["lightblue", 1]],
};

/** Target average hair colors (sRGB 0..1). Renderers rescale each hair texture so its mean matches. */
export const HAIR_COLORS = {
  black: [0.06, 0.05, 0.045],
  darkBrown: [0.14, 0.09, 0.06],
  brown: [0.3, 0.19, 0.11],
  auburn: [0.42, 0.18, 0.09],
  blonde: [0.72, 0.58, 0.38],
  grey: [0.55, 0.55, 0.55],
} satisfies Record<string, RGB>;

const HAIR_COLOR_BY_ETHNICITY: Record<Ethnicity, readonly (readonly [string, number])[]> = {
  african: [["black", 8], ["darkBrown", 2]],
  asian: [["black", 8], ["darkBrown", 2]],
  caucasian: [["darkBrown", 3], ["brown", 3], ["blonde", 2], ["auburn", 1], ["black", 1]],
};

/** Face modifiers that are randomised. Everything else stays at 0. */
const FACE_VARIATION_GROUPS = ["head", "forehead", "eyebrows", "eyes", "nose", "mouth", "ears", "chin", "cheek", "neck"];
const HEAD_SHAPES = ["head/head-oval", "head/head-round", "head/head-rectangular", "head/head-square",
  "head/head-triangular", "head/head-invertedtriangular", "head/head-diamond"];

export function yearsToAge(years: number): number {
  return years < 25 ? clamp((years - 1) / 48, 0, 0.5) : clamp(0.5 + (years - 25) / 130, 0.5, 1);
}

function dominant(e: Record<Ethnicity, number>): Ethnicity {
  return (Object.entries(e) as [Ethnicity, number][]).sort((a, b) => b[1] - a[1])[0]![0];
}

function resolveEthnicity(rng: Random, opt: GenerateOptions["ethnicity"]): Record<Ethnicity, number> {
  const all: Ethnicity[] = ["african", "asian", "caucasian"];
  let w: Record<Ethnicity, number>;
  if (typeof opt === "string" && opt !== "mixed") {
    const main = rng.range(0.85, 1);
    const other = all.filter((e) => e !== opt);
    const split = rng.next();
    w = { african: 0, asian: 0, caucasian: 0, [opt]: main } as Record<Ethnicity, number>;
    w[other[0]!] = (1 - main) * split;
    w[other[1]!] = (1 - main) * (1 - split);
  } else if (typeof opt === "object") {
    w = { african: opt.african ?? 0, asian: opt.asian ?? 0, caucasian: opt.caucasian ?? 0 };
  } else if (opt === "mixed") {
    w = { african: rng.next(), asian: rng.next(), caucasian: rng.next() };
  } else {
    return resolveEthnicity(rng, rng.weighted([["african", 1], ["asian", 1], ["caucasian", 1], ["mixed", 0.4]] as const));
  }
  const sum = w.african + w.asian + w.caucasian || 1;
  return { african: w.african / sum, asian: w.asian / sum, caucasian: w.caucasian / sum };
}

/**
 * Generate parameters for a seed. `faceModifierIds` comes from the asset manifest; when omitted,
 * face shape is left neutral (useful for server code that only needs metadata).
 */
export function generateParams(seed: string, options: GenerateOptions = {}, faceModifierIds: readonly string[] = []): CharacterParams {
  const root = new Random(seed);
  const body = root.fork("body");
  const look = root.fork("look");
  const faceRng = root.fork("face");

  const genderLabel: Gender = options.gender ?? (body.next() < 0.5 ? "female" : "male");
  const gender = genderLabel === "male" ? body.range(0.85, 1) : body.range(0, 0.12);

  let ageYears: number;
  if (typeof options.age === "number") ageYears = options.age;
  else {
    const [lo, hi] = options.age ?? [18, 70];
    // Skew toward younger adults; most avatar use cases want 20-45.
    ageYears = lo + (hi - lo) * Math.pow(body.next(), 1.6);
  }

  const ethnicity = resolveEthnicity(body, options.ethnicity);
  const main = dominant(ethnicity);

  const params: CharacterParams = {
    seed,
    gender,
    ageYears: Math.round(ageYears),
    muscle: clamp(body.gaussian(genderLabel === "male" ? 0.55 : 0.5, 0.12), 0.2, 0.9),
    weight: clamp(body.gaussian(0.5, 0.14), 0.15, 0.95),
    height: 0.5,
    stature: +clamp(
      body.gaussian(genderLabel === "male" ? 1.76 : 1.63, 0.07) - Math.max(0, ageYears - 50) * 0.002,
      genderLabel === "male" ? 1.55 : 1.45,
      genderLabel === "male" ? 2.0 : 1.85,
    ).toFixed(3),
    proportions: clamp(body.gaussian(0.6, 0.15), 0.2, 1),
    breastSize: clamp(body.gaussian(0.5, 0.15), 0.1, 0.9),
    breastFirmness: clamp(body.gaussian(0.5, 0.15), 0.1, 0.9),
    ethnicity,
    face: {},
    expression: { ...EXPRESSIONS[options.expression ?? "neutral"] },
    skin: {
      ethnicity: main,
      tint: (() => {
        const l = look.range(0.9, 1.08);
        const warm = look.range(-0.03, 0.03);
        return [l + warm, l, l - warm] as RGB;
      })(),
    },
    eyes: look.weighted(EYE_COLORS[main]),
    eyebrows: `eyebrow${String(1 + Math.floor(look.next() * 12)).padStart(3, "0")}`,
    eyelashes: genderLabel === "female" ? look.pick(["eyelashes01", "eyelashes02", "eyelashes04"]) : "eyelashes03",
    hair: look.weighted(HAIR[genderLabel][main]),
    hairColor: HAIR_COLORS[
      ageYears > 55 && look.next() < (ageYears - 50) / 30
        ? "grey"
        : (look.weighted(HAIR_COLOR_BY_ETHNICITY[main]) as keyof typeof HAIR_COLORS)
    ] as RGB,
    outfit: options.clothed === false ? null : look.pick(OUTFITS[genderLabel]),
    shoes: options.clothed === false ? null : look.pick(SHOES),
  };

  // Face: symmetric, gentle gaussian variation on every modifier plus a blend of one head shape.
  for (const id of faceModifierIds) {
    if (!FACE_VARIATION_GROUPS.includes(id.split("/")[0]!) || HEAD_SHAPES.includes(id)) continue;
    const key = id.replace("/l-", "/r-");
    if (key in params.face) {
      params.face[id] = params.face[key]!;
      continue;
    }
    const sd = id.includes("|") ? 0.22 : 0.15;
    const v = clamp(faceRng.gaussian(0, sd), -0.6, 0.6);
    params.face[id] = id.includes("|") ? v : Math.abs(v);
    if (key !== id) params.face[key] = params.face[id]!;
  }
  if (faceModifierIds.length) params.face[faceRng.pick(HEAD_SHAPES)] = faceRng.range(0.1, 0.5);

  return params;
}
