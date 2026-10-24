# @brightkumedzro/zuri-svelte

`<Avatar seed="…" />` for Svelte and SvelteKit: a unique 3D, toon or flat avatar for any string (a user ID, an email,
a name). The same seed is always the same face.

**[Docs](https://zuri-olive.vercel.app/docs#svelte) · [Builder](https://zuri-olive.vercel.app/#builder) · [GitHub](https://github.com/bright-kumedzro/zuri)**

```sh
npm i @brightkumedzro/zuri-svelte three
```

```svelte
<script>
  import { Avatar } from "@brightkumedzro/zuri-svelte";
</script>

<Avatar seed={user.id} />
<Avatar seed={user.id} look="toon" size={96} />
<Avatar seed={user.id} look="flat" />
<Avatar seed={user.id} live size={200} />
<Avatar seed={user.id} hair="locs" outfit="kente" presentation="feminine" />
```

Props: `seed`, `size` (default 64), `look` (`"3d"`, `"toon"`, `"flat"`), `live`, `shape`, `transparent`, `alt`, plus every
trait option. Works with SvelteKit server rendering: flat avatars render on the server, 3D ones fill in in the browser.
Written to work with Svelte 4 and 5; tested with SvelteKit 3 and Svelte 5.

MIT
