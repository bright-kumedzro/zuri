/** Every garment beyond the original tops, keyed by outfit id. */

import type { Garment } from "./kit.ts";
import { buttonup, cardigan, denim, sweater } from "./everyday.ts";
import { blouse, bowtie, suit, wrap } from "./formal.ts";
import { agbada, ankara, kaftan, kente } from "./traditional.ts";
import { chef, labcoat, scrubs } from "./work.ts";

export const GARMENTS: Partial<Record<string, Garment>> = {
  sweater, cardigan, buttonup, denim,
  suit, blouse, wrap, bowtie,
  kaftan, kente, ankara, agbada,
  labcoat, scrubs, chef,
};

export { makeKit, type FlatGarment, type FlatKit, type Garment, type GarmentShape, type Kit } from "./kit.ts";
