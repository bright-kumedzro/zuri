/** Turn a Zuri Character into a three.js object. */

import * as THREE from "three";
import type { Character, MeshData } from "@zuri/core";

export interface ToObjectOptions {
  /** Base URL that texture paths in the manifest are relative to. */
  assetsUrl: string;
  textureLoader?: THREE.TextureLoader;
}

const textureCache = new Map<string, { texture: THREE.Texture; ready: Promise<void> }>();
let pending: Promise<void>[] = [];

function loadTexture(url: string, loader: THREE.TextureLoader, color: boolean): THREE.Texture {
  const key = `${url}|${color}`;
  let entry = textureCache.get(key);
  if (!entry) {
    let texture!: THREE.Texture;
    const ready = new Promise<void>((resolve, reject) => {
      texture = loader.load(url, () => resolve(), undefined, reject);
    });
    texture.flipY = true;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    entry = { texture, ready };
    textureCache.set(key, entry);
  }
  pending.push(entry.ready);
  return entry.texture;
}

function material(mesh: MeshData, opts: Required<ToObjectOptions>): THREE.Material {
  const m = mesh.material;
  const url = (p: string) => new URL(p, opts.assetsUrl).href;
  const map = m.map ? loadTexture(url(m.map), opts.textureLoader, true) : null;
  const tint = new THREE.Color(1, 1, 1);
  if (m.tint && m.meanColor) {
    // Recolor: scale the texture so its average lands on the target color (in linear space).
    const target = new THREE.Color().setRGB(...m.tint, THREE.SRGBColorSpace);
    const mean = new THREE.Color().setRGB(...m.meanColor, THREE.SRGBColorSpace);
    tint.setRGB(
      Math.min(4, target.r / Math.max(mean.r, 1e-3)),
      Math.min(4, target.g / Math.max(mean.g, 1e-3)),
      Math.min(4, target.b / Math.max(mean.b, 1e-3)),
      THREE.LinearSRGBColorSpace,
    );
  } else if (m.tint) {
    tint.setRGB(...m.tint, THREE.LinearSRGBColorSpace);
  }

  switch (mesh.kind) {
    case "body":
      return new THREE.MeshPhysicalMaterial({
        map,
        color: tint,
        roughness: 0.58,
        metalness: 0,
        specularIntensity: 0.45,
        sheen: 0.25,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0.85, 0.55, 0.45),
      });
    case "eyes":
      // The cornea is a transparent shell in the texture's alpha; cut it out and let clearcoat provide the wet gloss.
      return new THREE.MeshPhysicalMaterial({ map, alphaTest: 0.5, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
    case "teeth":
      return new THREE.MeshStandardMaterial({ map, roughness: 0.35 });
    case "hair":
    case "eyebrows":
    case "eyelashes":
      return new THREE.MeshStandardMaterial({
        map,
        color: tint,
        roughness: 0.65,
        alphaTest: 0.35,
        alphaToCoverage: true,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true,
        polygonOffset: mesh.kind !== "hair",
        polygonOffsetFactor: -1,
      });
    default:
      return new THREE.MeshStandardMaterial({
        map,
        color: tint,
        normalMap: m.normalMap ? loadTexture(url(m.normalMap), opts.textureLoader, false) : null,
        aoMap: m.aoMap ? loadTexture(url(m.aoMap), opts.textureLoader, false) : null,
        roughness: 0.85,
        // Skin under clothes is removed, so openings (cuffs, rips, collars) must show the garment's inside.
        side: THREE.DoubleSide,
        alphaTest: m.transparent ? 0.5 : 0,
      });
  }
}

export function toGeometry(mesh: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Build a THREE.Group (one mesh per part). Meters, Y up, feet at the origin, facing +Z. */
export function toObject3D(character: Character, options: ToObjectOptions): THREE.Group {
  const opts: Required<ToObjectOptions> = { textureLoader: new THREE.TextureLoader(), ...options };
  const group = new THREE.Group();
  pending = [];
  group.name = `zuri:${character.params.seed}`;
  for (const mesh of character.meshes) {
    const obj = new THREE.Mesh(toGeometry(mesh), material(mesh, opts));
    obj.name = mesh.id;
    obj.renderOrder = mesh.renderOrder;
    obj.castShadow = true;
    obj.receiveShadow = true;
    group.add(obj);
  }
  group.userData = {
    height: character.height,
    eyeHeight: character.eyeHeight,
    params: character.params,
    /** Resolves once every texture has loaded (await before rendering a still image). */
    ready: Promise.all(pending).then(() => undefined),
  };
  return group;
}

export function disposeObject3D(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}
