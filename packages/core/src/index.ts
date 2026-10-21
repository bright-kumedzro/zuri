import { ZuriAssets, httpFetcher, type Fetcher } from "./assets.ts";
import { buildCharacter, type Character } from "./character.ts";
import { generateParams, type CharacterParams, type GenerateOptions } from "./params.ts";

export * from "./assets.ts";
export * from "./character.ts";
export * from "./params.ts";
export { Random } from "./random.ts";

/**
 * Entry point.
 *
 *   const zuri = await Zuri.load("https://cdn.example.com/zuri/");
 *   const person = await zuri.generate("user_8f2a", { expression: "smile" });
 */
export class Zuri {
  readonly assets: ZuriAssets;

  constructor(assets: ZuriAssets) {
    this.assets = assets;
  }

  static async load(source: string | Fetcher): Promise<Zuri> {
    return new Zuri(await ZuriAssets.load(typeof source === "string" ? httpFetcher(source) : source));
  }

  params(seed: string, options?: GenerateOptions): CharacterParams {
    return generateParams(seed, options, this.assets.manifest.detail.modifiers.map((m) => m.id));
  }

  generate(seed: string, options?: GenerateOptions): Promise<Character> {
    return buildCharacter(this.assets, this.params(seed, options));
  }

  /** Build from explicit (possibly hand-edited) parameters. */
  build(params: CharacterParams): Promise<Character> {
    return buildCharacter(this.assets, params);
  }
}
