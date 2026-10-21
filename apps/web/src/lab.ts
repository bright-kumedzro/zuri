/**
 * Dev contact sheet: /lab.html?seeds=a,b,c&cols=4&size=320&framing=bust&post=sheet.jpg (&style=flat for 2D, &style=toon for toon 3D)
 * Builds every seed on the worker pool, tiles the renders, and optionally POSTs the sheet to :5199.
 */

import { AvatarFactory, createFlatAvatar, disposeAvatar, flatAvatarDataURL, generateAvatar, snapshotAvatar, type AvatarOptions, type Framing } from "@brightkumedzro/zuri-avatar";

const q = new URLSearchParams(location.search);
const seeds = (q.get("seeds") ?? "ada,kwame,amara,lin,sofia,tunde,maya,obi").split(",");
const cols = Number(q.get("cols") ?? 4);
const size = Number(q.get("size") ?? 320);
const framing = (q.get("framing") ?? "bust") as Framing;
const quality = Number(q.get("quality") ?? 1);
const opts: AvatarOptions = {};
for (const k of ["presentation", "expression", "hair", "outfit", "glasses", "facialHair"] as const) {
  const v = q.get(k);
  if (v) (opts as Record<string, string>)[k] = v;
}
if (q.get("skin")) opts.skin = Number(q.get("skin"));

const sheet = document.createElement("canvas");
sheet.width = cols * size;
sheet.height = Math.ceil(seeds.length / cols) * size;
const ctx = sheet.getContext("2d")!;
document.body.append(sheet);

const factory = new AvatarFactory();
const t0 = performance.now();
await Promise.all(
  seeds.map(async (seed, i) => {
    const img = new Image();
    if (q.get("style") === "flat") {
      img.src = flatAvatarDataURL(createFlatAvatar(seed, { ...opts, size }));
    } else {
      const avatar = await factory.create(seed, { ...opts, quality, style: q.get("style") === "toon" ? "toon" : "soft" });
      img.src = snapshotAvatar(avatar, { size, framing });
      // ?export=dir also saves each render as dir/<seed>.webp through the receiver.
      const dir = q.get("export");
      if (dir) {
        const webp = snapshotAvatar(avatar, { size, framing, type: "image/webp", quality: 0.86, transparent: q.has("transparent") });
        await fetch(`http://localhost:5199/?name=${encodeURIComponent(`${dir}/${seed}.webp`)}`, { method: "POST", body: webp });
      }
      disposeAvatar(avatar);
    }
    await img.decode();
    const x = (i % cols) * size, y = Math.floor(i / cols) * size;
    ctx.drawImage(img, x, y);
    const p = generateAvatar(seed, opts);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, size, 16);
    ctx.fillStyle = "#fff";
    ctx.font = "11px system-ui";
    ctx.fillText(`${seed} · ${p.hair.style} · ${p.expression} · ${p.outfit.style} · ${p.facialHair}`, x + 4, y + 12);
  }),
);
const info = { total: Math.round(performance.now() - t0) };
document.title = "done";
(window as unknown as { labInfo: unknown }).labInfo = info;
const post = q.get("post");
if (post) await fetch(`http://localhost:5199/?name=${encodeURIComponent(post)}`, { method: "POST", body: sheet.toDataURL("image/jpeg", 0.88) });
