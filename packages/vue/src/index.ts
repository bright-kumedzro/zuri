/**
 * <Avatar seed="…" /> for Vue 3 (and Nuxt).
 *
 * Flat avatars render on the server too. 3D and toon avatars show a placeholder in the avatar's background color
 * during server rendering, then fill in in the browser.
 */

import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import {
  avatarImage,
  generateAvatar,
  mountAvatar,
  type Accessory,
  type AvatarOptions,
  type Expression,
  type FaceShape,
  type FacialHair,
  type Glasses,
  type HairStyle,
  type MountedAvatar,
  type Outfit,
  type Presentation,
} from "@brightkumedzro/zuri-avatar";
import { createFlatAvatar, flatAvatarDataURL } from "@brightkumedzro/zuri-avatar/flat";

export type { AvatarOptions } from "@brightkumedzro/zuri-avatar";

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const RADIUS = { circle: "50%", rounded: "22%", square: "0" } as const;
const opt = <T>() => ({ type: null as unknown as PropType<T>, default: undefined });

export const Avatar = defineComponent({
  name: "ZuriAvatar",
  props: {
    /** Any string: a user ID, an email, a name. The same seed is always the same face. */
    seed: { type: String, required: true },
    /** Displayed size in CSS pixels (the image renders at 2x). */
    size: { type: Number, default: 64 },
    look: { type: String as PropType<"3d" | "toon" | "flat">, default: "3d" },
    /** A live, animated 3D canvas (drag to rotate) instead of an image. */
    live: { type: Boolean, default: false },
    shape: { type: String as PropType<"circle" | "rounded" | "square">, default: "circle" },
    transparent: { type: Boolean, default: false },
    alt: { type: String, default: "" },
    presentation: opt<Presentation>(),
    faceShape: opt<FaceShape>(),
    skin: opt<number | string>(),
    hair: opt<HairStyle>(),
    outfit: opt<Outfit>(),
    outfitColor: opt<string>(),
    accentColor: opt<string>(),
    accessory: opt<Accessory>(),
    expression: opt<Expression>(),
    glasses: opt<Glasses>(),
    facialHair: opt<FacialHair>(),
    background: opt<string>(),
  },
  setup(props) {
    const traits = computed<AvatarOptions>(() => {
      const { seed: _s, size: _z, look: _l, live: _v, shape: _h, transparent: _t, alt: _a, ...rest } = props;
      return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as AvatarOptions;
    });
    const style = computed(() => (props.look === "toon" ? "toon" : "soft"));
    const flatSrc = computed(() =>
      props.look === "flat" ? flatAvatarDataURL(createFlatAvatar(props.seed, { ...traits.value, size: props.size * 2, transparent: props.transparent, shape: props.shape })) : "",
    );
    const background = computed(() => (props.transparent ? "transparent" : generateAvatar(props.seed, traits.value).background));

    // 3D image, rendered in the browser.
    const src = ref<string>();
    let request = 0;
    const renderImage = () => {
      if (props.look === "flat" || props.live) return;
      const id = ++request;
      src.value = undefined;
      avatarImage(props.seed, { ...traits.value, style: style.value, size: props.size * 2, transparent: true }).then((url) => {
        if (id === request) src.value = url;
      });
    };

    // Live 3D canvas.
    const canvas = ref<HTMLCanvasElement>();
    let mounted: MountedAvatar | null = null;
    const mountLive = () => {
      mounted?.dispose();
      mounted = props.live && props.look !== "flat" && canvas.value ? mountAvatar(canvas.value, props.seed, { ...traits.value, style: style.value, transparent: true }) : null;
    };

    onMounted(() => {
      renderImage();
      mountLive();
    });
    watch([() => props.seed, traits, () => props.size, () => props.look], () => {
      renderImage();
      mounted?.update(props.seed, { ...traits.value, style: style.value, transparent: true });
    });
    watch([() => props.live, () => props.look], () => queueMicrotask(mountLive));
    onBeforeUnmount(() => mounted?.dispose());

    return () => {
      const size = `${props.size}px`;
      const base = { width: size, height: size, display: "inline-block", verticalAlign: "middle" };
      if (props.look === "flat") return h("img", { src: flatSrc.value, width: props.size, height: props.size, alt: props.alt, style: base });
      const framed = { ...base, background: background.value, borderRadius: RADIUS[props.shape], objectFit: "cover" };
      if (props.live) return h("canvas", { ref: canvas, role: "img", "aria-label": props.alt || undefined, style: { ...framed, touchAction: "pan-y" } });
      return h("img", { src: src.value ?? PIXEL, width: props.size, height: props.size, alt: props.alt, style: framed });
    };
  },
});

export default Avatar;
