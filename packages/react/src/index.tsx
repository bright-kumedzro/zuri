"use client";
/**
 * <Avatar seed="…" /> for React (and Next.js, Remix, Gatsby…).
 *
 * Flat avatars render on the server too. 3D and toon avatars show a placeholder in the avatar's background color
 * during server rendering, then fill in in the browser, so hydration always matches.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { avatarImage, generateAvatar, mountAvatar, type AvatarOptions, type MountedAvatar } from "@brightkumedzro/zuri-avatar";
import { createFlatAvatar, flatAvatarDataURL } from "@brightkumedzro/zuri-avatar/flat";

export type { AvatarOptions } from "@brightkumedzro/zuri-avatar";

export interface AvatarProps extends AvatarOptions {
  /** Any string: a user ID, an email, a name. The same seed is always the same face. */
  seed: string;
  /** Displayed size in CSS pixels (the image renders at 2x for sharp screens). Default 64. */
  size?: number;
  /** Default "3d". */
  look?: "3d" | "toon" | "flat";
  /** A live, animated 3D canvas (drag to rotate) instead of an image. 3D and toon only. */
  live?: boolean;
  /** Default "circle". */
  shape?: "circle" | "rounded" | "square";
  /** Leave out the background color. */
  transparent?: boolean;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const RADIUS = { circle: "50%", rounded: "22%", square: "0" } as const;

export function Avatar(props: AvatarProps) {
  const { seed, size = 64, look = "3d", live = false, shape = "circle", transparent = false, alt = "", className, style, ...traits } = props;
  const key = JSON.stringify(traits);
  const opts = useMemo(() => traits, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const base: CSSProperties = { width: size, height: size, display: "inline-block", verticalAlign: "middle", ...style };

  // Flat: a pure function of the props, so it renders identically on the server and in the browser.
  const flatSrc = useMemo(
    () => (look === "flat" ? flatAvatarDataURL(createFlatAvatar(seed, { ...opts, size: size * 2, transparent, shape })) : ""),
    [look, seed, opts, size, transparent, shape],
  );
  const background = useMemo(() => (transparent ? "transparent" : generateAvatar(seed, opts).background), [seed, opts, transparent]);

  // 3D image, rendered in the browser.
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (look === "flat" || live) return;
    let current = true;
    setSrc(undefined);
    avatarImage(seed, { ...opts, style: look === "toon" ? "toon" : "soft", size: size * 2, transparent: true }).then((url) => current && setSrc(url));
    return () => {
      current = false;
    };
  }, [look, live, seed, opts, size]);

  // Live 3D canvas.
  const canvas = useRef<HTMLCanvasElement>(null);
  const mounted = useRef<MountedAvatar | null>(null);
  useEffect(() => {
    if (!live || look === "flat" || !canvas.current) return;
    mounted.current = mountAvatar(canvas.current, seed, { ...opts, style: look === "toon" ? "toon" : "soft", transparent: true });
    return () => {
      mounted.current?.dispose();
      mounted.current = null;
    };
    // Mount once per canvas; seed and option changes go through update() below.
  }, [live, look]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    mounted.current?.update(seed, { ...opts, style: look === "toon" ? "toon" : "soft", transparent: true });
  }, [seed, opts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (look === "flat") return <img src={flatSrc} width={size} height={size} alt={alt} className={className} style={base} />;
  const framed: CSSProperties = { ...base, background, borderRadius: RADIUS[shape], objectFit: "cover" };
  if (live) return <canvas ref={canvas} role="img" aria-label={alt || undefined} className={className} style={{ ...framed, touchAction: "pan-y" }} />;
  return <img src={src ?? PIXEL} width={size} height={size} alt={alt} className={className} style={framed} />;
}

export default Avatar;
