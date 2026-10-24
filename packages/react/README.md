# @brightkumedzro/zuri-react

`<Avatar seed="…" />` for React, Next.js and friends: a unique 3D, toon or flat avatar for any string (a user ID, an
email, a name). The same seed is always the same face.

**[Docs](https://zuri-olive.vercel.app/docs#react) · [Builder](https://zuri-olive.vercel.app/#builder) · [GitHub](https://github.com/bright-kumedzro/zuri)**

```sh
npm i @brightkumedzro/zuri-react three
```

```tsx
import { Avatar } from "@brightkumedzro/zuri-react";

<Avatar seed={user.id} />                              // 3D image, 64 px
<Avatar seed={user.id} look="toon" size={96} />
<Avatar seed={user.id} look="flat" />                  // SVG, also rendered on the server
<Avatar seed={user.id} live size={200} />              // animated 3D, drag to rotate
<Avatar seed={user.id} hair="locs" outfit="kente" presentation="feminine" />
```

Props: `seed`, `size` (CSS px, default 64), `look` (`"3d"`, `"toon"`, `"flat"`), `live`, `shape` (`"circle"`,
`"rounded"`, `"square"`), `transparent`, `alt`, `className`, `style`, plus every trait option (`hair`, `skin`, `outfit`,
`faceShape`, `expression`, …).

Works with server rendering (Next.js App Router included): flat avatars render on the server; 3D ones show a placeholder in
the avatar's background color and fill in in the browser. Tested with Next.js 16 and React 19.

MIT
