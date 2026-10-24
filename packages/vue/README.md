# @brightkumedzro/zuri-vue

`<Avatar seed="…" />` for Vue 3 and Nuxt: a unique 3D, toon or flat avatar for any string (a user ID, an email, a name).
The same seed is always the same face.

**[Docs](https://zuri-olive.vercel.app/docs#vue) · [Builder](https://zuri-olive.vercel.app/#builder) · [GitHub](https://github.com/bright-kumedzro/zuri)**

```sh
npm i @brightkumedzro/zuri-vue three
```

```vue
<script setup>
import { Avatar } from "@brightkumedzro/zuri-vue";
</script>

<template>
  <Avatar :seed="user.id" />
  <Avatar :seed="user.id" look="toon" :size="96" />
  <Avatar :seed="user.id" look="flat" />
  <Avatar :seed="user.id" live :size="200" />
  <Avatar :seed="user.id" hair="locs" outfit="kente" presentation="feminine" />
</template>
```

Props: `seed`, `size` (default 64), `look` (`"3d"`, `"toon"`, `"flat"`), `live`, `shape`, `transparent`, `alt`, plus every
trait option. Works with Nuxt server rendering: flat avatars render on the server, 3D ones fill in in the browser.
Tested with Nuxt 4 (Vue 3.5).

MIT
