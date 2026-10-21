# @brightkumedzro/zuri-avatar

A real face for every user. Turn any string (a user ID, an email, a name) into a unique avatar: live 3D, PNG, `.glb`
or flat SVG. The same string always gives the same face, and everything is generated from code in the browser or on
your server. No uploads, no assets, no network requests.

**[Docs](https://zuri-olive.vercel.app/docs) · [Builder](https://zuri-olive.vercel.app/#builder) · [GitHub](https://github.com/bright-kumedzro/zuri)**

## Install

```sh
npm i @brightkumedzro/zuri-avatar three     # 3D (three.js 0.170 or newer)
npm i @brightkumedzro/zuri-avatar           # flat SVG only, no three.js needed
```

## 3D

```ts
import { AvatarFactory, AvatarStage, snapshotAvatar } from "@brightkumedzro/zuri-avatar";

const zuri = new AvatarFactory();                     // meshes on a Web Worker pool
const avatar = await zuri.create("ada@example.com");  // a THREE.Group

img.src = snapshotAvatar(avatar, { size: 256 });      // a PNG data URL…

const stage = new AvatarStage({ canvas, transparent: true });  // …or live 3D
stage.setSize(256, 256);
stage.show(avatar);
stage.render();
```

## Toon 3D

The same person with an animated-film look: big expressive eyes, sculpted glossy hair, smooth skin.

```ts
const avatar = await zuri.create("ada@example.com", { style: "toon" });
```

## Flat 2D

```ts
import { createFlatAvatar, flatAvatarDataURL } from "@brightkumedzro/zuri-avatar/flat";

const svg = createFlatAvatar("ada@example.com", { size: 96, shape: "circle" }); // ~4 KB SVG string
img.src = flatAvatarDataURL(svg);
```

The flat style has no DOM or WebGL dependency, so it also runs in Node, Deno, Bun, workers and edge functions.

## Customise any trait

Anything you leave out comes from the seed, so a user keeps their face when they change their hair.

```ts
zuri.create(user.id, { hair: "locs", skin: 2, outfit: "hoodie", expression: "grin", glasses: "round" });
```

Options: `presentation`, `faceShape` (oval, round, square, heart, long, diamond), `skin` (0–13 or `#rrggbb`), `hair` (16 styles), `outfit` (22 garments: everyday, formal, traditional and work wear), `outfitColor`, `accentColor`, `accessory` (scarf, necklace, head tie), `expression` (7),
`glasses`, `facialHair` and `background` (`#rrggbb`). Invalid values are ignored rather than trusted, so it's safe to
pass options your users chose.

See the [docs](https://zuri-olive.vercel.app/docs) for the full API, React and Vue examples, and `.glb` export.

## License

MIT
