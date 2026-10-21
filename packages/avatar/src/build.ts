/** Assemble an avatar: params -> rig -> meshed fields + eyes + accessories -> THREE.Group. */

import * as THREE from "three";
import type { AvatarParams, Expression } from "./params.ts";
import { buildRig, type AvatarStyle, type Rig } from "./head.ts";
import { makeCanvas, paintFace, shade } from "./face.ts";
import { meshAvatar, type AvatarMeshes, type PartMesh } from "./mesh.ts";
import { Random } from "@zuri/core/random";

export interface BuildOptions {
  /** Grid resolution multiplier. 1 = default quality; 0.75 is faster for thumbnails. */
  quality?: number;
  /** "soft" (default, Memoji-like) or "toon" (animated-film look). The same seed is the same person in both. */
  style?: AvatarStyle;
}

const linear = (hex: string) => new THREE.Color(hex);

function geometry(m: PartMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  if (m.colors) g.setAttribute("color", new THREE.BufferAttribute(m.colors, 3));
  if (m.uvs) g.setAttribute("uv", new THREE.BufferAttribute(m.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function skinMaterial(p: AvatarParams, toon: boolean, map?: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: map ?? null,
    color: map ? 0xffffff : linear(p.skin),
    // Toon skin is smooth with a soft gloss, like a rendered animated-film character.
    roughness: toon ? 0.42 : 0.55,
    specularIntensity: toon ? 0.45 : 0.35,
    clearcoat: toon ? 0.22 : 0,
    clearcoatRoughness: 0.45,
    sheen: toon ? 0.35 : 0.5,
    sheenRoughness: 0.5,
    sheenColor: linear(p.skin).lerp(new THREE.Color(1, 0.85, 0.8), 0.35),
  });
}

function eyeTexture(color: string, toon: boolean): THREE.Texture {
  const W = 64, H = 512;
  // Bands in degrees from the front of the eyeball. Toon eyes get a bigger iris and pupil.
  const [pupil, irisStart, iris, ringA, ringB] = toon ? [21, 22, 52, 48, 56] : [18, 19, 45, 41, 49];
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const deg = (d: number) => (d / 180) * H;
  const sclera = ctx.createLinearGradient(0, 0, 0, H);
  sclera.addColorStop(0, "#fbf8f4");
  sclera.addColorStop(0.5, "#efe6e0");
  sclera.addColorStop(1, "#d9cbc4");
  ctx.fillStyle = sclera;
  ctx.fillRect(0, 0, W, H);
  const irisFill = ctx.createLinearGradient(0, 0, 0, deg(iris));
  irisFill.addColorStop(0, shade(color, 0.7));
  irisFill.addColorStop(0.45, shade(color, toon ? 1.4 : 1.25));
  irisFill.addColorStop(0.8, color);
  irisFill.addColorStop(1, shade(color, 0.45));
  ctx.fillStyle = irisFill;
  ctx.fillRect(0, 0, W, deg(iris));
  // Radial streaks.
  for (let i = 0; i < W; i += 2) {
    ctx.fillStyle = shade(color, i % 6 === 0 ? 1.5 : 0.75, toon ? 0.2 : 0.35);
    ctx.fillRect(i, deg(irisStart), 1, deg(iris - irisStart - 4));
  }
  ctx.fillStyle = "#0b0807";
  ctx.fillRect(0, 0, W, deg(pupil));
  // Soft limbal ring.
  const ring = ctx.createLinearGradient(0, deg(ringA), 0, deg(ringB));
  ring.addColorStop(0, shade(color, 0.35, 0.9));
  ring.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ring;
  ctx.fillRect(0, deg(ringA), W, deg(ringB - ringA));
  const t = new THREE.CanvasTexture(c as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const LIDS: Record<Expression, [number, number]> = {
  neutral: [1.1, 2.3],
  smile: [1.13, 2.16],
  grin: [1.16, 2.08],
  laugh: [1.6, 1.68],
  surprised: [0.86, 2.48],
  wink: [1.16, 2.08],
  smirk: [1.2, 2.25],
};
const CLOSED: [number, number] = [1.62, 1.66];

function buildEye(p: AvatarParams, rig: Rig, side: 1 | -1, eyeMat: THREE.Material, lidMat: THREE.Material) {
  const { r } = rig.eye;
  const group = new THREE.Group();
  group.name = side > 0 ? "eye.r" : "eye.l";
  group.position.set(side * rig.eye.x, rig.eye.y, rig.eye.z);
  group.scale.x = side;
  group.rotation.z = side * p.eyes.tilt;

  const ballGeo = new THREE.SphereGeometry(r, 48, 32);
  ballGeo.rotateX(Math.PI / 2);
  const ball = new THREE.Mesh(ballGeo, eyeMat);
  // Look slightly toward the viewer's center.
  ball.rotation.y = -0.06;
  group.add(ball);

  const toon = rig.style === "toon";
  const catchlights = [[new THREE.Vector3(-0.38, 0.42, 0.82), toon ? 0.2 : 0.14], [new THREE.Vector3(0.3, -0.3, 0.9), toon ? 0.09 : 0.06]] as const;
  for (const [dir, size] of catchlights) {
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(r * size, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, toneMapped: false }),
    );
    const n = dir.clone().normalize();
    spot.position.copy(n.clone().multiplyScalar(r * 1.004));
    spot.lookAt(n.clone().multiplyScalar(2 * r));
    group.add(spot);
  }

  const upper = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
  const lower = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
  upper.name = "lid.upper";
  lower.name = "lid.lower";

  // Lash line along the upper lid edge, with a small flick for lashes.
  const pts: THREE.Vector3[] = [];
  const R = r * 1.075;
  for (let i = 0; i <= 24; i++) {
    const a = -1.45 + (2.9 * i) / 24;
    pts.push(new THREE.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R));
  }
  if (p.eyes.lashes) {
    const end = pts[pts.length - 1]!;
    pts.push(end.clone().add(new THREE.Vector3(r * 0.22, r * 0.16, -r * 0.08)));
  }
  const lash = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, p.eyes.lashes ? r * 0.085 : r * 0.05, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x15100e, roughness: 0.5 }),
  );
  upper.add(lash);
  group.add(upper, lower);

  const closed = p.expression === "wink" && side < 0;
  const [u, l] = closed ? CLOSED : LIDS[p.expression];
  const setLids = (blink: number) => {
    const uu = u + (CLOSED[0] - u) * blink;
    const ll = l + (CLOSED[1] - l) * blink;
    upper.rotation.x = uu - Math.PI / 2;
    lower.rotation.x = ll - Math.PI / 2;
  };
  setLids(0);
  return { group, setLids };
}

function buildGlasses(p: AvatarParams, rig: Rig): THREE.Group {
  const g = new THREE.Group();
  g.name = "glasses";
  const frameMat = new THREE.MeshPhysicalMaterial({
    color: linear(p.glassesColor),
    roughness: 0.3,
    metalness: p.glassesColor === "#c9a24d" ? 1 : 0,
    clearcoat: 0.6,
  });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false });
  const zf = rig.eye.z + rig.eye.r * 1.06 + 0.075;
  const hw = p.glasses === "round" ? 0.235 : 0.26, hh = p.glasses === "round" ? 0.235 : 0.19;
  const tube = 0.02;
  for (const s of [-1, 1]) {
    const cx = s * (rig.eye.x + 0.01), cy = rig.eye.y;
    const shape = new THREE.Shape();
    if (p.glasses === "round") shape.absarc(0, 0, hw, 0, Math.PI * 2, false);
    else {
      const rr = 0.08;
      shape.moveTo(-hw + rr, -hh);
      shape.lineTo(hw - rr, -hh);
      shape.quadraticCurveTo(hw, -hh, hw, -hh + rr);
      shape.lineTo(hw, hh - rr);
      shape.quadraticCurveTo(hw, hh, hw - rr, hh);
      shape.lineTo(-hw + rr, hh);
      shape.quadraticCurveTo(-hw, hh, -hw, hh - rr);
      shape.lineTo(-hw, -hh + rr);
      shape.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    }
    const pts = shape.getSpacedPoints(64).map((v) => new THREE.Vector3(cx + v.x, cy + v.y, zf));
    const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, tube, 8, true), frameMat);
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), lensMat);
    lens.position.set(cx, cy, zf);
    // Temple arm back to the ear.
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(cx + s * hw, cy + 0.05, zf),
          new THREE.Vector3(s * (rig.ear.x + 0.02), cy + 0.08, zf - 0.35),
          new THREE.Vector3(s * (rig.ear.x + 0.04), rig.ear.y + rig.ear.h * 0.6, rig.ear.z),
        ]),
        24, tube * 0.8, 6, false,
      ),
      frameMat,
    );
    g.add(frame, lens, arm);
  }
  const bridge = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-(rig.eye.x - hw + 0.01), rig.eye.y + 0.04, zf),
        new THREE.Vector3(0, rig.eye.y + 0.08, zf + 0.02),
        new THREE.Vector3(rig.eye.x - hw + 0.01, rig.eye.y + 0.04, zf),
      ]),
      16, tube * 0.8, 6, false,
    ),
    frameMat,
  );
  g.add(bridge);
  return g;
}

function buildEarrings(p: AvatarParams, rig: Rig): THREE.Group {
  const g = new THREE.Group();
  g.name = "earrings";
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xe0b85c, metalness: 1, roughness: 0.22 });
  for (const s of [-1, 1]) {
    const x = s * (rig.ear.x + 0.035), y = rig.ear.y - rig.ear.h * 0.82, z = rig.ear.z + 0.05;
    if (p.earrings === "studs") {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), gold);
      m.position.set(x, y, z);
      g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.013, 10, 40), gold);
      m.position.set(x + s * 0.01, y - 0.075, z);
      m.rotation.y = Math.PI / 2;
      g.add(m);
    }
  }
  return g;
}

export interface Avatar extends THREE.Group {
  userData: {
    params: AvatarParams;
    /** Advance idle animation (blinks, sway). `t` in seconds. */
    tick: (t: number) => void;
    /** Top of the hair, for framing. */
    top: number;
  };
}

export function buildAvatar(p: AvatarParams, options: BuildOptions = {}): Avatar {
  return assembleAvatar(p, meshAvatar(p, options.quality ?? 1, options.style ?? "soft"));
}

/** Cheap half of building: wrap precomputed meshes (possibly from a worker) with materials, eyes and accessories. */
export function assembleAvatar(p: AvatarParams, data: AvatarMeshes): Avatar {
  const style = data.style ?? "soft";
  const toon = style === "toon";
  const rig = buildRig(p, style);
  const group = new THREE.Group() as Avatar;
  group.name = `zuri:${p.seed}`;
  const meshes: THREE.Mesh[] = [];

  const faceTex = new THREE.CanvasTexture(paintFace(p, rig) as HTMLCanvasElement);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const body = new THREE.Mesh(geometry(data.body), skinMaterial(p, toon, faceTex));
  body.name = "skin";
  meshes.push(body);

  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(p.eyes.color, toon), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
  const lidMat = skinMaterial(p, toon);
  const eyes = ([1, -1] as const).map((s) => buildEye(p, rig, s, eyeMat, lidMat));
  for (const e of eyes) group.add(e.group);

  if (data.hair) {
    const base = linear(p.hair.color);
    const print = data.hair.print;
    const m = new THREE.Mesh(
      geometry(data.hair),
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        // Toon hair is glossy, so the sculpted grooves catch the light.
        roughness: print ? 0.75 : toon ? 0.34 : 0.5,
        sheen: print ? 0.3 : 0.5,
        sheenRoughness: 0.45,
        sheenColor: print ? new THREE.Color(0xffffff) : base.clone().lerp(new THREE.Color(1, 1, 1), 0.35),
        specularIntensity: toon ? 0.5 : 0.3,
        clearcoat: toon && !print ? 0.5 : 0,
        clearcoatRoughness: 0.3,
      }),
    );
    m.name = "hair";
    meshes.push(m);
  }

  if (data.facialHair) {
    const base = linear(p.brows.color);
    const m = new THREE.Mesh(
      geometry(data.facialHair),
      new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.7, sheen: 0.6, sheenColor: base.clone().lerp(new THREE.Color(1, 1, 1), 0.3) }),
    );
    m.name = "facialHair";
    meshes.push(m);
  }

  if (data.brows) {
    const m = new THREE.Mesh(geometry(data.brows), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, sheen: 0.4, specularIntensity: 0.3 }));
    m.name = "brows";
    meshes.push(m);
  }

  const outfit = new THREE.Mesh(
    geometry(data.outfit),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.35, 0.35, 0.35) }),
  );
  outfit.name = "outfit";
  meshes.push(outfit);

  for (const m of meshes) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  if (p.glasses !== "none") group.add(buildGlasses(p, rig));
  if (p.earrings !== "none") group.add(buildEarrings(p, rig));

  // Idle animation: blink every few seconds, gentle sway.
  const timing = new Random(`${p.seed}/idle`);
  const phase = timing.range(0, 6);
  const period = timing.range(3.4, 5);
  group.userData = {
    params: p,
    top: data.top,
    tick: (t: number) => {
      const k = ((t + phase) % period) / 0.16;
      const blink = p.expression === "laugh" ? 0 : k < 1 ? Math.sin(k * Math.PI) : 0;
      for (const e of eyes) e.setLids(blink);
      group.rotation.y = 0.14 * Math.sin(t * 0.55 + phase);
      group.rotation.x = 0.025 * Math.sin(t * 0.8 + phase);
      group.rotation.z = 0.02 * Math.sin(t * 0.43 + phase);
    },
  };
  return group;
}

export function disposeAvatar(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    }
  });
}
