/** Loading and typed access to the compiled asset bundle (see tools/compile_assets.py). */

export interface Section {
  offset: number;
  length: number;
  type: "float32" | "uint32" | "int16";
}

export interface SparseTarget {
  name: string;
  scale: number;
  indices: Section;
  deltas: Section;
}

export interface FaceModifier {
  id: string;
  group: string;
  min: number | null;
  max: number | null;
}

export interface ProxyMaterial {
  transparent: boolean;
  doubleSided: boolean;
  map?: string;
  normalMap?: string;
  aoMap?: string;
  /** Average sRGB color of `map` (hair and brows), so it can be recolored to a target. */
  meanColor?: [number, number, number];
}

export type ProxyKind = "eyebrows" | "eyelashes" | "hair" | "eyes" | "teeth" | "outfit" | "shoes" | "hat";

export interface ProxyEntry {
  id: string;
  kind: ProxyKind;
  zDepth: number;
  file: string;
  vertexCount: number;
  scale: [number, number, number][] | null;
  refs: Section;
  weights: Section;
  offsets: Section;
  map: Section;
  uv: Section;
  index: Section;
  deleteVerts: Section;
  material: ProxyMaterial;
}

export interface SkinEntry {
  id: string;
  age: "young" | "middleage" | "old";
  ethnicity: Ethnicity;
  gender: "male" | "female";
  map: string;
}

export type Ethnicity = "african" | "asian" | "caucasian";

export interface Manifest {
  version: number;
  vertexCount: number;
  base: {
    positions: Section;
    body: { map: Section; uv: Section; index: Section };
  };
  macro: {
    components: number;
    targets: { name: string; factors: string[] }[];
    coeffs: Section;
    scales: Section;
    basis: Section;
  };
  detail: {
    targets: SparseTarget[];
    modifiers: FaceModifier[];
    expressions: Record<string, Partial<Record<Ethnicity, number>>>;
  };
  proxies: ProxyEntry[];
  skins: SkinEntry[];
  eyeColors: { id: string; map: string }[];
}

export const f32 = (buf: ArrayBuffer, s: Section) => new Float32Array(buf, s.offset, s.length);
export const u32 = (buf: ArrayBuffer, s: Section) => new Uint32Array(buf, s.offset, s.length);
export const i16 = (buf: ArrayBuffer, s: Section) => new Int16Array(buf, s.offset, s.length);

export type Fetcher = (path: string) => Promise<ArrayBuffer>;

export const httpFetcher =
  (baseUrl: string): Fetcher =>
  async (path) => {
    const res = await fetch(new URL(path, baseUrl));
    if (!res.ok) throw new Error(`zuri: failed to load ${path} (${res.status})`);
    return res.arrayBuffer();
  };

export class ZuriAssets {
  private readonly proxyCache = new Map<string, Promise<ArrayBuffer>>();
  readonly proxyById: Map<string, ProxyEntry>;
  readonly manifest: Manifest;
  readonly base: ArrayBuffer;
  readonly macro: ArrayBuffer;
  readonly targets: ArrayBuffer;
  readonly fetcher: Fetcher;

  constructor(manifest: Manifest, base: ArrayBuffer, macro: ArrayBuffer, targets: ArrayBuffer, fetcher: Fetcher) {
    this.manifest = manifest;
    this.base = base;
    this.macro = macro;
    this.targets = targets;
    this.fetcher = fetcher;
    this.proxyById = new Map(manifest.proxies.map((p) => [p.id, p]));
  }

  static async load(fetcher: Fetcher): Promise<ZuriAssets> {
    const [manifestBuf, base, macro, targets] = await Promise.all([
      fetcher("manifest.json"),
      fetcher("base.bin"),
      fetcher("macro.bin"),
      fetcher("targets.bin"),
    ]);
    const manifest = JSON.parse(new TextDecoder().decode(manifestBuf)) as Manifest;
    return new ZuriAssets(manifest, base, macro, targets, fetcher);
  }

  proxyData(id: string): Promise<ArrayBuffer> {
    const entry = this.proxyById.get(id);
    if (!entry) throw new Error(`zuri: unknown asset "${id}"`);
    let p = this.proxyCache.get(id);
    if (!p) {
      p = this.fetcher(entry.file);
      this.proxyCache.set(id, p);
    }
    return p;
  }

  proxiesOfKind(kind: ProxyKind): ProxyEntry[] {
    return this.manifest.proxies.filter((p) => p.kind === kind);
  }
}
