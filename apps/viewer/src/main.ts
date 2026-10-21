import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Zuri, type Expression, type GenerateOptions } from "@zuri/core";
import { disposeObject3D, toObject3D } from "@zuri/three";

const ASSETS_URL = new URL("/", location.href).href;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");

// ---------------------------------------------------------------- scene

function createStage(renderer: THREE.WebGLRenderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1b1d22");
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const key = new THREE.DirectionalLight("#fff1e0", 2.2);
  key.position.set(1.2, 2.4, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
  key.shadow.camera.right = key.shadow.camera.top = 1.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  const rim = new THREE.DirectionalLight("#bcd4ff", 1.6);
  rim.position.set(-1.5, 2, -2);
  const fill = new THREE.DirectionalLight("#ffffff", 0.35);
  fill.position.set(-2, 1, 2);
  scene.add(key, rim, fill);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return scene;
}

function frame(camera: THREE.PerspectiveCamera, target: THREE.Vector3, obj: THREE.Object3D, mode: "bust" | "full") {
  const { height, eyeHeight } = obj.userData as { height: number; eyeHeight: number };
  if (mode === "bust") {
    target.set(0, eyeHeight - 0.09, 0);
    camera.position.set(0.12, eyeHeight - 0.03, 0.95);
  } else {
    target.set(0, height * 0.52, 0);
    camera.position.set(0.4, height * 0.6, height * 2.0);
  }
  camera.lookAt(target);
}

// ---------------------------------------------------------------- app

const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene = createStage(renderer);
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// Offscreen renderer for gallery portraits (prototype of the avatar image API).
const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
thumbRenderer.setSize(256, 256, false);
const thumbScene = createStage(thumbRenderer);
const thumbCamera = new THREE.PerspectiveCamera(24, 1, 0.05, 50);

let zuri: Zuri;
let current: THREE.Group | null = null;
let generation = 0;

function options(): GenerateOptions {
  const gender = $<HTMLSelectElement>("gender").value;
  const ethnicity = $<HTMLSelectElement>("ethnicity").value;
  return {
    gender: (gender || undefined) as GenerateOptions["gender"],
    ethnicity: (ethnicity || undefined) as GenerateOptions["ethnicity"],
    expression: $<HTMLSelectElement>("expression").value as Expression,
    clothed: $<HTMLInputElement>("clothed").checked,
  };
}

async function show(seed: string) {
  const run = ++generation;
  status.textContent = "generating…";
  const t0 = performance.now();
  const character = await zuri.generate(seed, options());
  if (run !== generation) return;
  const obj = toObject3D(character, { assetsUrl: ASSETS_URL });
  await obj.userData.ready;
  if (run !== generation) return disposeObject3D(obj);
  if (current) {
    scene.remove(current);
    disposeObject3D(current);
  }
  current = obj;
  scene.add(obj);
  frame(camera, controls.target, obj, $<HTMLSelectElement>("framing").value as "bust" | "full");
  const p = character.params;
  status.textContent = `${(performance.now() - t0).toFixed(0)} ms · ${character.height.toFixed(2)} m`;
  $("params").textContent = JSON.stringify(
    {
      seed: p.seed,
      gender: p.gender < 0.5 ? "female" : "male",
      age: p.ageYears,
      ethnicity: Object.fromEntries(Object.entries(p.ethnicity).map(([k, v]) => [k, +v.toFixed(2)])),
      muscle: +p.muscle.toFixed(2),
      weight: +p.weight.toFixed(2),
      height: +p.height.toFixed(2),
      eyes: p.eyes,
      hair: p.hair,
      outfit: p.outfit,
      shoes: p.shoes,
    },
    null,
    2,
  );
}

async function portrait(seed: string): Promise<string> {
  const obj = toObject3D(await zuri.generate(seed, options()), { assetsUrl: ASSETS_URL });
  await obj.userData.ready;
  thumbScene.add(obj);
  const target = new THREE.Vector3();
  frame(thumbCamera, target, obj, "bust");
  thumbRenderer.render(thumbScene, thumbCamera);
  const url = thumbRenderer.domElement.toDataURL("image/webp");
  thumbScene.remove(obj);
  disposeObject3D(obj);
  return url;
}

async function renderGallery(base: string) {
  const gallery = $("gallery");
  gallery.innerHTML = "";
  const seeds = Array.from({ length: 8 }, (_, i) => `${base}#${i + 1}`);
  const figs = seeds.map((seed) => {
    const fig = document.createElement("figure");
    fig.innerHTML = `<img alt="" /><figcaption>${seed}</figcaption>`;
    fig.onclick = () => {
      $<HTMLInputElement>("seed").value = seed;
      void show(seed);
    };
    gallery.appendChild(fig);
    return fig;
  });
  for (let i = 0; i < seeds.length; i++) {
    figs[i]!.querySelector("img")!.src = await portrait(seeds[i]!);
  }
}

function exportGlb() {
  if (!current) return;
  new GLTFExporter().parse(
    current,
    (glb) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([glb as ArrayBuffer], { type: "model/gltf-binary" }));
      a.download = `zuri-${(current!.userData.params as { seed: string }).seed.replace(/[^\w-]+/g, "_")}.glb`;
      a.click();
    },
    (err) => alert(`Export failed: ${err}`),
    { binary: true },
  );
}

/** `?still=<seed>&framing=bust|full`: render one frame and stop. Used for automated screenshots. */
async function still(seed: string) {
  renderer.setAnimationLoop(null);
  const q = new URLSearchParams(location.search);
  $<HTMLSelectElement>("framing").value = q.get("framing") ?? "bust";
  for (const k of ["gender", "ethnicity", "expression"]) if (q.get(k)) $<HTMLSelectElement>(k).value = q.get(k)!;
  await show(seed);
  controls.update();
  renderer.render(scene, camera);
  // Read back in the same task as the render; the drawing buffer is not preserved.
  const shot = () => {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/jpeg", 0.92);
  };
  Object.assign(window, { zuriShot: shot(), zuriDebug: { THREE, scene, camera, shot, current } });
  document.body.dataset.still = "ready";
}

async function main() {
  zuri = await Zuri.load(ASSETS_URL);
  const stillSeed = new URLSearchParams(location.search).get("still");
  if (stillSeed) return still(stillSeed);
  const seedInput = $<HTMLInputElement>("seed");
  const refresh = () => {
    void show(seedInput.value);
    void renderGallery(seedInput.value);
  };
  seedInput.addEventListener("change", refresh);
  for (const id of ["gender", "ethnicity", "expression", "clothed"]) $(id).addEventListener("change", refresh);
  $("framing").addEventListener("change", () => current && frame(camera, controls.target, current, $<HTMLSelectElement>("framing").value as "bust" | "full"));
  $("random").onclick = () => {
    seedInput.value = Math.random().toString(36).slice(2, 10);
    refresh();
  };
  $("export").onclick = exportGlb;
  refresh();
}

main().catch((err) => {
  status.textContent = String(err);
  console.error(err);
});
