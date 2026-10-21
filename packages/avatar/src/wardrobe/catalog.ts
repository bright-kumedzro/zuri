/**
 * The wardrobe: every top and accessory an avatar can wear. Any garment fits any avatar; presentation only
 * affects which of the original tops are picked at random. Garments added after v1 are opt-in, so adding
 * clothes never changes an existing seed.
 */

export type Category = "everyday" | "formal" | "traditional" | "work";

export interface GarmentInfo {
  id: string;
  category: Category;
  /** Colors used when the caller doesn't pass outfitColor / accentColor (a lab coat is white, denim is blue). */
  color?: string;
  accent?: string;
  /** Part of the random pool for generated faces (the original v1 tops only). */
  random?: boolean;
}

export const WARDROBE = [
  // Original tops, picked at random for generated faces.
  { id: "tee", category: "everyday", random: true },
  { id: "vneck", category: "everyday", random: true },
  { id: "hoodie", category: "everyday", random: true },
  { id: "shirt", category: "everyday", random: true },
  { id: "turtleneck", category: "everyday", random: true },
  { id: "blazer", category: "formal", random: true },
  { id: "tank", category: "everyday", random: true },
  // Opt-in.
  { id: "sweater", category: "everyday" },
  { id: "cardigan", category: "everyday" },
  { id: "buttonup", category: "everyday" },
  { id: "denim", category: "everyday", color: "#3d6894", accent: "#c9843a" },
  { id: "suit", category: "formal" },
  { id: "blouse", category: "formal" },
  { id: "wrap", category: "formal" },
  { id: "bowtie", category: "formal", color: "#f4f1ea", accent: "#1f2430" },
  { id: "kaftan", category: "traditional" },
  { id: "kente", category: "traditional" },
  { id: "ankara", category: "traditional" },
  { id: "agbada", category: "traditional" },
  { id: "labcoat", category: "work", color: "#f6f6f3" },
  { id: "scrubs", category: "work", color: "#3a8f8c" },
  { id: "chef", category: "work", color: "#f6f6f3", accent: "#1f2430" },
] as const satisfies readonly GarmentInfo[];

export type Outfit = (typeof WARDROBE)[number]["id"];

export const ACCESSORY_LIST = ["none", "scarf", "necklace", "headtie"] as const;
export type Accessory = (typeof ACCESSORY_LIST)[number];

/** Kente: gold, green, red and black, woven in blocks. */
export const KENTE = ["#e3a92b", "#1f7a45", "#c3362d", "#1a1714"] as const;

export const garmentInfo = (id: string): GarmentInfo | undefined => (WARDROBE as readonly GarmentInfo[]).find((g) => g.id === id);
