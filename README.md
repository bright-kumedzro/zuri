# Zuri

A real face for every user. Zuri turns any string (user ID, email, name) into a unique, expressive 3D avatar in
the spirit of Bitmoji or WhatsApp avatars. Same seed, same face, forever, and everything is generated from code.

```ts
import { AvatarFactory, AvatarStage, snapshotAvatar } from "@zuri/avatar";

const zuri = new AvatarFactory();                     // meshes on a Web Worker pool
const avatar = await zuri.create("ada@example.com");  // THREE.Group

scene.add(avatar);                                    // live 3D (call avatar.userData.tick(t) for blinks/sway)
img.src = snapshotAvatar(avatar, { size: 256 });      // or a PNG
```

## Styles

The same seed gives the same person in every style, because every style draws the same `AvatarParams`.

| Style | Status | Output |
|---|---|---|
| Soft 3D (Memoji-like) | Shipped | Live three.js, PNG/WebP, .glb |
| Flat 2D (vector illustration) | Shipped | SVG string, no DOM or WebGL (`@zuri/avatar/flat`) |
| Toon 3D (Pixar-like: exaggerated, sculpted hair) | Planned | A variant of the 3D engine |
| Social 3D (Meta-like: natural proportions) | Planned | A variant of the 3D engine |
| Full-body 3D (game and metaverse characters) | Planned | Needs bodies and rigging |
| Realistic digital humans | Prototype | The v0 MakeHuman engine below |

```ts
import { createFlatAvatar } from "@zuri/avatar/flat";

const svg = createFlatAvatar("ada@example.com", { size: 256, shape: "circle" }); // ~4 KB, runs on servers too
```

## How it works

```
seed ─► params (skin, face shape, eyes, hair, outfit, expression…) ─► signed distance fields ─► surface-net meshes ─► three.js
        packages/avatar/src/params.ts                                head.ts hair.ts outfit.ts   mesher.ts (worker)   build.ts
```

- **No assets.** The head, neck, ears, nose, lips, 16 hairstyles, beards and 7 tops are signed distance fields,
  blended with smooth unions. `mesher.ts` turns them into meshes with surface nets. An octree only samples near
  the surface, and vertices are projected onto it with analytic normals, so the meshes come out smooth.
- **Painted details.** Brows, mouths (7 expressions), blush, freckles and stubble are drawn on a canvas and
  projected onto the face. Eyes are real spheres with lids that blink.
- **Deterministic.** `Random` (sfc32 + cyrb128) is seeded from the string, and every trait group uses its own
  forked stream. `params.version` is bumped when a change alters existing faces.
- **Inclusive by design.** There are 14 skin tones. Hair texture is correlated with skin tone but every
  combination stays possible: coils, locs, braids, cornrows, puffs, afro, high-top and headwraps.

## Layout

| Path | What |
|---|---|
| `packages/avatar` | The stylized avatar engine: params, SDF parts, mesher, worker pool, stage (lighting/camera), snapshots |
| `apps/web` | Landing page (hero, wall, styles, builder, playground, pricing, FAQ) at `/`, docs at `/docs.html`, and a dev contact sheet at `/lab.html` (`&style=flat` for 2D) |
| `packages/core`, `packages/three`, `apps/viewer` | v0 realistic engine built on MakeHuman CC0 data (see below) |

## Develop

```sh
pnpm install
pnpm dev        # landing page on http://localhost:5180, lab at /lab.html
pnpm test
```

The wall images in `apps/web/public/avatars` are pre-rendered so the page loads instantly. Re-render them after
changing the engine:
`/lab.html?seeds=amara,kwame,…&size=282&export=avatars&transparent` with the receiver from
`zuri-shots/recv.mjs` running, then copy the files over.

## Status

Working: the 3D generator (all traits), the flat 2D style, live 3D, PNG, SVG and GLB export, the worker pool, the
landing page and the docs. The pricing page is copy only: there is no billing, API keys or hosted `api.zuri.dev` yet.

Next:
1. A hosted image API (`/v1/avatar/{seed}.png`): headless render plus a CDN.
2. `@zuri/react` and other framework wrappers, plus a customizer UI (override any trait).
3. More style packs (ankara/kente prints, hats, jewelry) and polish for hair textures and beards.
4. Full-body characters and rigging, reusing the realistic engine's skeleton work.

## v0 realistic engine

`packages/core` plus `packages/three` generate realistic humans from MakeHuman CC0 data. They need the vendor
assets in `../zuri-vendor` and `pnpm assets`. Run them with `pnpm dev:viewer` (port 5181).

## Licensing

Code: MIT. MakeHuman-derived data (v0 engine): CC0.
