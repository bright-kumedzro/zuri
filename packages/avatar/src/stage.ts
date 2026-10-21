/** A ready-lit scene for showing avatars live or rendering them to images. */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildAvatar, disposeAvatar, type Avatar, type BuildOptions } from "./build.ts";
import type { AvatarStyle } from "./head.ts";
import { generateAvatar, type AvatarOptions } from "./params.ts";
import { BODY_BOTTOM } from "./head.ts";

export type Framing = "head" | "bust";

export interface StageOptions {
  canvas?: HTMLCanvasElement;
  /** Transparent background instead of the avatar's color. */
  transparent?: boolean;
  pixelRatio?: number;
  /** Keep the drawing buffer so the canvas can be read back at any time. */
  preserveDrawingBuffer?: boolean;
}

export class AvatarStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
  avatar: Avatar | null = null;
  framing: Framing = "bust";
  private readonly transparent: boolean;
  private readonly lights: { hemi: THREE.HemisphereLight; key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight };

  constructor(options: StageOptions = {}) {
    this.transparent = options.transparent ?? false;
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    this.renderer.setPixelRatio(options.pixelRatio ?? (typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xfff4ea, 0x6d625c, 1.0);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0e4, 2.3);
    key.position.set(-2.5, 3.2, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    const fill = new THREE.DirectionalLight(0xe6eeff, 0.7);
    fill.position.set(4, 0.5, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6);
    rim.position.set(2.5, 3, -4);
    this.scene.add(key, fill, rim);
    this.lights = { hemi, key, fill, rim };
  }

  /** Studio lighting per style: toon gets a warmer key, a cooler fill, a stronger rim and softer shadows. */
  light(style: AvatarStyle) {
    const { hemi, key, fill, rim } = this.lights;
    const toon = style === "toon";
    hemi.intensity = toon ? 1.1 : 1.0;
    key.color.set(toon ? 0xffe9d6 : 0xfff0e4);
    key.intensity = toon ? 2.5 : 2.3;
    key.shadow.radius = toon ? 9 : 4;
    fill.color.set(toon ? 0xd8e4ff : 0xe6eeff);
    fill.intensity = toon ? 0.85 : 0.7;
    rim.intensity = toon ? 2.4 : 1.6;
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.frame(this.framing);
  }

  /** Swap in a new avatar (disposing the old one). */
  show(avatar: Avatar) {
    if (this.avatar) {
      this.scene.remove(this.avatar);
      disposeAvatar(this.avatar);
    }
    this.avatar = avatar;
    this.light(avatar.userData.style);
    this.scene.add(avatar);
    this.scene.background = this.transparent ? null : new THREE.Color(avatar.userData.params.background);
    this.frame(this.framing);
  }

  frame(framing: Framing) {
    this.framing = framing;
    const top = (this.avatar?.userData.top ?? 1.3) + 0.12;
    const bottom = framing === "head" ? -1.25 : BODY_BOTTOM + 0.08;
    const h = top - bottom;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = Math.max(h, (h * 0.92) / this.camera.aspect + (framing === "head" ? 0 : 0));
    const dist = fit / 2 / Math.tan(fov / 2) + 1.2;
    const cy = (top + bottom) / 2;
    this.camera.position.set(0, cy + 0.15, dist);
    this.camera.lookAt(0, cy, 0);
    this.camera.updateProjectionMatrix();
  }

  render(time?: number) {
    if (time !== undefined) this.avatar?.userData.tick(time);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.avatar) disposeAvatar(this.avatar);
    this.renderer.dispose();
  }
}

export interface SnapshotOptions {
  size?: number;
  framing?: Framing;
  transparent?: boolean;
  type?: "image/png" | "image/webp" | "image/jpeg";
  quality?: number;
}

export type ImageOptions = AvatarOptions & BuildOptions & SnapshotOptions;

/** One offscreen stage per background mode, created on first use. */
const shared = new Map<boolean, AvatarStage>();

/** Render an avatar (facing forward, eyes open) to a data URL with one shared offscreen renderer. */
export function snapshotAvatar(avatar: Avatar, options: SnapshotOptions = {}): string {
  const transparent = options.transparent ?? false;
  let stage = shared.get(transparent);
  if (!stage) {
    stage = new AvatarStage({ canvas: document.createElement("canvas"), transparent, pixelRatio: 1, preserveDrawingBuffer: true });
    shared.set(transparent, stage);
  }
  const size = options.size ?? 256;
  // Borrow the avatar without taking ownership.
  stage.avatar = avatar;
  stage.light(avatar.userData.style);
  stage.scene.add(avatar);
  stage.scene.background = transparent ? null : new THREE.Color(avatar.userData.params.background);
  stage.framing = options.framing ?? "bust";
  stage.setSize(size, size);
  avatar.userData.tick(0);
  const rotation = avatar.rotation.clone();
  avatar.rotation.set(0, 0, 0);
  stage.render();
  const url = stage.renderer.domElement.toDataURL(options.type ?? "image/png", options.quality);
  avatar.rotation.copy(rotation);
  stage.scene.remove(avatar);
  stage.avatar = null;
  return url;
}

/** Build and render a seed on the main thread. Prefer AvatarFactory + snapshotAvatar for many images. */
export function renderAvatarImage(seed: string, options: ImageOptions = {}): string {
  const avatar = buildAvatar(generateAvatar(seed, options), { quality: options.quality ?? 0.8, style: options.style });
  const url = snapshotAvatar(avatar, options);
  disposeAvatar(avatar);
  return url;
}
