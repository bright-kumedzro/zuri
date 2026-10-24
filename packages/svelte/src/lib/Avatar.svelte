<!--
  <Avatar seed="…" /> for Svelte 4 and 5 (and SvelteKit).
  Flat avatars render on the server too. 3D and toon avatars show a placeholder in the avatar's background color
  during server rendering, then fill in in the browser.
-->
<script>
  import { onDestroy, onMount } from "svelte";
  import { avatarImage, generateAvatar, mountAvatar } from "@brightkumedzro/zuri-avatar";
  import { createFlatAvatar, flatAvatarDataURL } from "@brightkumedzro/zuri-avatar/flat";

  /** Any string: a user ID, an email, a name. The same seed is always the same face. @type {string} */
  export let seed;
  /** Displayed size in CSS pixels (the image renders at 2x). */
  export let size = 64;
  /** @type {"3d" | "toon" | "flat"} */
  export let look = "3d";
  /** A live, animated 3D canvas (drag to rotate) instead of an image. */
  export let live = false;
  /** @type {"circle" | "rounded" | "square"} */
  export let shape = "circle";
  export let transparent = false;
  export let alt = "";
  /** @type {import("@brightkumedzro/zuri-avatar").Presentation | undefined} */
  export let presentation = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").FaceShape | undefined} */
  export let faceShape = undefined;
  /** @type {number | string | undefined} */
  export let skin = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").HairStyle | undefined} */
  export let hair = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").Outfit | undefined} */
  export let outfit = undefined;
  /** @type {string | undefined} */
  export let outfitColor = undefined;
  /** @type {string | undefined} */
  export let accentColor = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").Accessory | undefined} */
  export let accessory = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").Expression | undefined} */
  export let expression = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").Glasses | undefined} */
  export let glasses = undefined;
  /** @type {import("@brightkumedzro/zuri-avatar").FacialHair | undefined} */
  export let facialHair = undefined;
  /** @type {string | undefined} */
  export let background = undefined;

  const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  const RADIUS = { circle: "50%", rounded: "22%", square: "0" };

  /** @type {import("@brightkumedzro/zuri-avatar").AvatarOptions} */
  $: traits = Object.fromEntries(
    Object.entries({ presentation, faceShape, skin, hair, outfit, outfitColor, accentColor, accessory, expression, glasses, facialHair, background }).filter(([, v]) => v !== undefined),
  );
  $: style3d = look === "toon" ? "toon" : "soft";
  $: flatSrc = look === "flat" ? flatAvatarDataURL(createFlatAvatar(seed, { ...traits, size: size * 2, transparent, shape })) : "";
  $: bg = transparent ? "transparent" : generateAvatar(seed, traits).background;

  // 3D image, rendered in the browser only.
  let browser = false;
  /** @type {string | undefined} */
  let src;
  let request = 0;
  $: if (browser && look !== "flat" && !live) render(seed, traits, size, style3d);
  /** @param {string} s @param {object} t @param {number} z @param {"soft" | "toon"} st */
  function render(s, t, z, st) {
    const id = ++request;
    src = undefined;
    avatarImage(s, { ...t, style: st, size: z * 2, transparent: true }).then((url) => {
      if (id === request) src = url;
    });
  }

  // Live 3D canvas.
  /** @type {HTMLCanvasElement | undefined} */
  let canvas;
  /** @type {import("@brightkumedzro/zuri-avatar").MountedAvatar | null} */
  let mounted = null;
  $: if (browser) syncLive(canvas, live, look);
  $: mounted?.update(seed, { ...traits, style: style3d, transparent: true });
  /** @param {HTMLCanvasElement | undefined} c @param {boolean} l @param {string} lk */
  function syncLive(c, l, lk) {
    mounted?.dispose();
    mounted = l && lk !== "flat" && c ? mountAvatar(c, seed, { ...traits, style: style3d, transparent: true }) : null;
  }

  onMount(() => (browser = true));
  onDestroy(() => mounted?.dispose());

  $: dims = `width:${size}px;height:${size}px;display:inline-block;vertical-align:middle;`;
  $: framed = `${dims}background:${bg};border-radius:${RADIUS[shape]};object-fit:cover;`;
</script>

{#if look === "flat"}
  <img src={flatSrc} width={size} height={size} {alt} style={dims} />
{:else if live}
  <canvas bind:this={canvas} role="img" aria-label={alt || undefined} style="{framed}touch-action:pan-y;"></canvas>
{:else}
  <img src={src ?? PIXEL} width={size} height={size} {alt} style={framed} />
{/if}
