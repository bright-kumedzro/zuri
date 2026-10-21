import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  AvatarFactory,
  AvatarStage,
  BACKGROUNDS,
  EXPRESSION_LIST,
  HAIR_STYLE_LIST,
  OUTFIT_LIST,
  SKIN_TONES,
  createFlatAvatar,
  disposeAvatar,
  flatAvatarSVG,
  rasterizeSVG,
  generateAvatar,
  snapshotAvatar,
  type Avatar,
  type AvatarOptions,
  type AvatarParams,
} from "@zuri/avatar";
import { LANGS, detectLang, lang, setLang, t, type Key, type Lang } from "./i18n.ts";
import { CURRENCIES, detectCurrency, formatPrice, yearly } from "./pricing.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Seeds pre-rendered into /avatars (transparent, see README). */
const CAST = [
  "amara", "kwame", "lin", "sofia", "tunde", "maya", "obi", "zara",
  "kofi", "mei", "leo", "ama", "yaw", "priya", "diego", "nia",
  "efua", "hiro", "layla", "kojo", "ines", "sena", "musa", "eli",
];
/** Cast members that show off each hair texture. */
const HAIR_SHOWCASE: [string, string][] = [
  ["afro", "lin"], ["cornrows", "sena"], ["headwrap", "eli"], ["curly", "sofia"],
  ["bun", "kofi"], ["long", "yaw"], ["bob", "tunde"], ["fade", "ines"],
];

const factory = new AvatarFactory();

// --- Live 3D tiles --------------------------------------------------------------------------------

class LiveTile {
  readonly stage: AvatarStage;
  private yaw = 0;
  private drag: { x: number; yaw: number } | null = null;
  private visible = true;
  private request = 0;
  onShow?: (avatar: Avatar) => void;

  constructor(readonly tile: HTMLElement, canvas: HTMLCanvasElement, private readonly spinner: HTMLElement) {
    this.stage = new AvatarStage({ canvas, transparent: true });
    const resize = () => {
      const r = tile.getBoundingClientRect();
      if (r.width) this.stage.setSize(Math.round(r.width), Math.round(r.height));
    };
    new ResizeObserver(resize).observe(tile);
    resize();
    new IntersectionObserver(([e]) => (this.visible = !!e?.isIntersecting)).observe(tile);
    canvas.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, yaw: this.yaw };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012;
    });
    canvas.addEventListener("pointerup", () => (this.drag = null));
    canvas.addEventListener("pointercancel", () => (this.drag = null));
  }

  async show(params: AvatarParams) {
    const id = ++this.request;
    const timer = setTimeout(() => this.spinner.classList.add("on"), 150);
    const avatar = await factory.build(params);
    clearTimeout(timer);
    if (id !== this.request) return disposeAvatar(avatar);
    this.spinner.classList.remove("on");
    this.stage.show(avatar);
    this.frame(performance.now());
    this.onShow?.(avatar);
  }

  frame(now: number) {
    if (!this.visible || document.hidden) return;
    if (!this.drag) this.yaw *= 0.9;
    const a = this.stage.avatar;
    if (a) {
      a.userData.tick(now / 1000);
      if (reducedMotion) a.rotation.set(0, 0, 0);
      a.rotation.y += this.yaw;
    }
    this.stage.render();
  }

  /** PNG of the current avatar. snapshotAvatar borrows it, so hand it back afterwards. */
  snapshot(size: number, transparent: boolean): string | null {
    const a = this.stage.avatar;
    if (!a) return null;
    const url = snapshotAvatar(a, { size, transparent });
    this.stage.scene.add(a);
    return url;
  }
}

const hero = new LiveTile($("#hero-tile"), $<HTMLCanvasElement>("#hero-canvas"), $("#hero-loading"));
const builder = new LiveTile($("#builder-tile"), $<HTMLCanvasElement>("#builder-canvas"), $("#builder-loading"));

// One loop for both tiles, ~30 fps: plenty for blinks and sway.
let last = 0;
const loop = (now: number) => {
  requestAnimationFrame(loop);
  if (now - last < 32) return;
  last = now;
  hero.frame(now);
  builder.frame(now);
};
requestAnimationFrame(loop);

// --- Utilities ------------------------------------------------------------------------------------

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}
const slug = (s: string) => (s || "zuri").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "zuri";

async function copy(text: string, button: HTMLElement, doneKey?: Key) {
  await navigator.clipboard.writeText(text);
  button.classList.add("copied");
  const label = doneKey ? button.textContent : null;
  if (doneKey) button.textContent = t(doneKey);
  setTimeout(() => {
    button.classList.remove("copied");
    if (label !== null) button.textContent = label;
  }, 1400);
}

// --- Hero -----------------------------------------------------------------------------------------

let heroSeed = "amara";
const heroInput = $<HTMLInputElement>("#hero-seed");
const playInput = $<HTMLInputElement>("#play-seed");
const poster = $<HTMLImageElement>("#hero-poster");

hero.onShow = (avatar) => {
  poster.classList.add("hide");
  updatePreviews(avatar);
};

let heroTimer = 0;
function setHeroSeed(value: string, from?: HTMLInputElement) {
  heroSeed = value.trim() || "amara";
  if (from !== heroInput && heroInput.value !== value) heroInput.value = value;
  if (from !== playInput) playInput.value = heroSeed;
  renderCode();
  clearTimeout(heroTimer);
  heroTimer = window.setTimeout(() => hero.show(generateAvatar(heroSeed)), 300);
  $("#style-flat").innerHTML = createFlatAvatar(heroSeed, { size: 512 });
  $("#style-3d").parentElement!.style.background = generateAvatar(heroSeed).background;
}
heroInput.addEventListener("input", () => setHeroSeed(heroInput.value, heroInput));
playInput.addEventListener("input", () => setHeroSeed(playInput.value, playInput));
$("#hero-form").addEventListener("submit", (e) => {
  e.preventDefault();
  openBuilder({ seed: heroSeed });
});
$("#copy-install").addEventListener("click", (e) => copy("npm i @zuri/avatar three", e.currentTarget as HTMLElement));

// --- Cast grid ------------------------------------------------------------------------------------

$("#cast").innerHTML = CAST.map(
  (n) => `<a class="tile" href="#" data-seed="${n}" aria-label="${n}"><img src="/avatars/${n}.webp" alt="" loading="lazy" /><span>${n}</span></a>`,
).join("");
$("#cast").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("[data-seed]");
  if (!a) return;
  e.preventDefault();
  heroInput.value = a.dataset.seed!;
  setHeroSeed(a.dataset.seed!);
  window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
});

// --- Audiences ------------------------------------------------------------------------------------

for (const tab of document.querySelectorAll<HTMLButtonElement>("#aud-tabs [data-aud]")) {
  tab.addEventListener("click", () => {
    for (const other of document.querySelectorAll<HTMLButtonElement>("#aud-tabs [data-aud]")) other.setAttribute("aria-selected", String(other === tab));
    for (const panel of document.querySelectorAll<HTMLElement>(".aud-panel")) panel.hidden = panel.dataset.panel !== tab.dataset.aud;
  });
}

// --- Inclusion ------------------------------------------------------------------------------------

$("#tones").innerHTML = SKIN_TONES.map((c, i) => `<button type="button" style="background:${c}" data-tone="${i}" aria-label="Skin tone ${i + 1}"></button>`).join("");
$("#tones").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tone]");
  if (b) openBuilder({ seed: state.seed, skin: Number(b.dataset.tone) });
});
function renderHairRow() {
  $("#hair-row").innerHTML = HAIR_SHOWCASE.map(
    ([style, seed]) => `<a href="#builder" data-hair="${style}" data-seed="${seed}"><img src="/avatars/${seed}.webp" alt="" loading="lazy" />${t(`hair.${style}` as Key)}</a>`,
  ).join("");
}
$("#hair-row").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("[data-hair]");
  if (!a) return;
  e.preventDefault();
  openBuilder({ seed: a.dataset.seed!, hair: a.dataset.hair as AvatarOptions["hair"] });
});

// --- Styles -------------------------------------------------------------------------------------

for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-look]")) {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    openBuilder({ seed: heroSeed, look: a.dataset.look ? "flat" : undefined });
  });
}

// --- Builder --------------------------------------------------------------------------------------

interface BuilderState extends AvatarOptions {
  seed: string;
  transparent?: boolean;
  /** Undefined is 3D. */
  look?: "flat";
}
let state: BuilderState = { seed: "kwame" };
const builderSeed = $<HTMLInputElement>("#builder-seed");
const builderFlat = $("#builder-flat");
const builderCanvas = $<HTMLCanvasElement>("#builder-canvas");
const dlAlt = $("#dl-glb");

function builderParams(): AvatarParams {
  const { seed, transparent: _, look: __, ...options } = state;
  return generateAvatar(seed || "zuri", options);
}

const flatSVG = (size = 512) => flatAvatarSVG(builderParams(), { size, transparent: state.transparent });

let builderTimer = 0;
function updateBuilder(immediate = false) {
  const params = builderParams();
  const flat = state.look === "flat";
  builder.tile.style.background = state.transparent ? "" : params.background;
  builder.tile.classList.toggle("clear", !!state.transparent);
  builderFlat.hidden = !flat;
  builderCanvas.hidden = flat;
  dlAlt.dataset.i18n = flat ? "builder.svg" : "builder.glb";
  dlAlt.textContent = t(dlAlt.dataset.i18n as Key);
  clearTimeout(builderTimer);
  if (flat) builderFlat.innerHTML = flatSVG();
  else builderTimer = window.setTimeout(() => builder.show(params), immediate ? 0 : 250);
  syncControls();
}

function openBuilder(next: BuilderState) {
  state = next;
  builderSeed.value = state.seed;
  updateBuilder(true);
  $("#builder").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
}

builderSeed.addEventListener("input", () => {
  state.seed = builderSeed.value.trim();
  updateBuilder();
});
const NAMES = ["Adaeze", "Kwabena", "Amina", "Chen", "Sofía", "Lukas", "Priya", "Thandiwe", "Mateus", "Yuki", "Fatou", "Emma", "Kofi", "Léa", "Omar", "Zanele", "Diego", "Ingrid"];
$("#surprise").addEventListener("click", () => {
  state = { seed: `${NAMES[Math.floor(Math.random() * NAMES.length)]}-${Math.floor(Math.random() * 9000 + 1000)}` };
  builderSeed.value = state.seed;
  updateBuilder(true);
});

type Choice = { value: string | undefined; label: string };
const auto = (): Choice => ({ value: undefined, label: t("opt.auto") });

/** Each control: render into the grid, and re-mark the current selection on sync. */
const controls: { el: HTMLElement; sync: () => void }[] = [];

function segmented(labelKey: Key, key: keyof BuilderState, choices: () => Choice[], wide = false) {
  const field = document.createElement("div");
  field.className = `field${wide ? " wide" : ""}`;
  const render = () => {
    field.innerHTML = `<span class="label">${t(labelKey)}</span><div class="seg"></div>`;
    const seg = field.querySelector(".seg")!;
    for (const c of choices()) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.label;
      b.dataset.value = c.value ?? "";
      b.addEventListener("click", () => {
        (state as unknown as Record<string, unknown>)[key] = c.value;
        updateBuilder();
      });
      seg.append(b);
    }
  };
  render();
  controls.push({
    el: field,
    sync: () => {
      const v = String(state[key] ?? "");
      for (const b of field.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.value === v));
    },
  });
}

function dropdown(labelKey: Key, key: keyof BuilderState, choices: () => Choice[]) {
  const field = document.createElement("div");
  field.className = "field";
  const id = `ctl-${key}`;
  field.innerHTML = `<label for="${id}">${t(labelKey)}</label><select id="${id}"></select>`;
  const select = field.querySelector("select")!;
  for (const c of choices()) select.add(new Option(c.label, c.value ?? ""));
  select.addEventListener("change", () => {
    (state as unknown as Record<string, unknown>)[key] = select.value || undefined;
    updateBuilder();
  });
  controls.push({ el: field, sync: () => (select.value = String(state[key] ?? "")) });
}

function swatches(labelKey: Key, items: () => { value: string | undefined; color?: string; label: string; cls?: string }[], apply: (v: string | undefined) => void, current: () => string | undefined) {
  const field = document.createElement("div");
  field.className = "field wide";
  field.innerHTML = `<span class="label">${t(labelKey)}</span><div class="swatches"></div>`;
  const row = field.querySelector(".swatches")!;
  for (const item of items()) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = item.label;
    b.setAttribute("aria-label", item.label);
    b.dataset.value = item.value ?? "";
    if (item.color) b.style.background = item.color;
    if (item.cls) b.className = item.cls;
    if (item.cls === "auto") b.textContent = item.label;
    b.addEventListener("click", () => {
      apply(item.value);
      updateBuilder();
    });
    row.append(b);
  }
  controls.push({
    el: field,
    sync: () => {
      const v = current() ?? "";
      for (const b of row.querySelectorAll<HTMLButtonElement>("button")) b.setAttribute("aria-pressed", String(b.dataset.value === v));
    },
  });
}

function buildControls() {
  const root = $("#controls");
  for (const c of controls.splice(0)) c.el.remove();
  segmented("builder.look", "look", () => [{ value: undefined, label: t("opt.3d") }, { value: "flat", label: t("opt.flat") }], true);
  segmented("builder.style", "presentation", () => [auto(), { value: "feminine", label: t("opt.feminine") }, { value: "masculine", label: t("opt.masculine") }]);
  segmented("builder.glasses", "glasses", () => [auto(), { value: "none", label: t("opt.none") }, { value: "round", label: t("opt.round") }, { value: "square", label: t("opt.square") }]);
  swatches(
    "builder.skin",
    () => [{ value: undefined, label: t("opt.auto"), cls: "auto" }, ...SKIN_TONES.map((c, i) => ({ value: String(i), color: c, label: `${i + 1}` }))],
    (v) => (state.skin = v === undefined ? undefined : Number(v)),
    () => (state.skin === undefined ? undefined : String(state.skin)),
  );
  dropdown("builder.hair", "hair", () => [auto(), ...HAIR_STYLE_LIST.map((h) => ({ value: h, label: t(`hair.${h}` as Key) }))]);
  dropdown("builder.outfit", "outfit", () => [auto(), ...OUTFIT_LIST.map((o) => ({ value: o, label: t(`outfit.${o}` as Key) }))]);
  dropdown("builder.facial", "facialHair", () => [
    auto(), { value: "none", label: t("opt.none") },
    ...(["stubble", "mustache", "goatee", "beard"] as const).map((f) => ({ value: f, label: t(`facial.${f}` as Key) })),
  ]);
  dropdown("builder.expression", "expression", () => [auto(), ...EXPRESSION_LIST.map((e) => ({ value: e, label: t(`expr.${e}` as Key) }))]);
  swatches(
    "builder.background",
    () => [
      { value: undefined, label: t("opt.auto"), cls: "auto" },
      ...BACKGROUNDS.map((c) => ({ value: c, color: c, label: c })),
      { value: "transparent", label: t("opt.transparent"), cls: "clear" },
    ],
    (v) => {
      state.transparent = v === "transparent";
      state.background = v === "transparent" ? undefined : v;
    },
    () => (state.transparent ? "transparent" : state.background),
  );
  const reset = document.createElement("div");
  reset.className = "field wide";
  reset.innerHTML = `<div><button type="button" class="tertiary sm">${t("builder.reset")}</button></div>`;
  reset.querySelector("button")!.addEventListener("click", () => {
    state = { seed: state.seed, look: state.look };
    updateBuilder();
  });
  controls.push({ el: reset, sync: () => {} });
  for (const c of controls) root.append(c.el);
  syncControls();
}
function syncControls() {
  for (const c of controls) c.sync();
}

function builderCode(): string {
  const { seed, transparent, look, ...options } = state;
  const opts = Object.entries(options).filter(([, v]) => v !== undefined);
  if (look === "flat") {
    const all = [...opts, ["size", 512], ...(transparent ? [["transparent", true]] : [])];
    return `import { createFlatAvatar } from "@zuri/avatar/flat";

const svg = createFlatAvatar(${JSON.stringify(seed)}, { ${all.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} });`;
  }
  const args = opts.length ? `, { ${opts.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }` : "";
  return `import { AvatarFactory, snapshotAvatar } from "@zuri/avatar";

const avatar = await new AvatarFactory().create(${JSON.stringify(seed)}${args});
const png = snapshotAvatar(avatar, { size: 512${transparent ? ", transparent: true" : ""} });`;
}

$("#dl-png").addEventListener("click", async () => {
  const url = state.look === "flat" ? await rasterizeSVG(flatSVG(1024), { size: 1024 }) : builder.snapshot(1024, !!state.transparent);
  if (url) download(url, `${slug(state.seed)}.png`);
});
dlAlt.addEventListener("click", async () => {
  if (state.look === "flat") {
    const url = URL.createObjectURL(new Blob([flatSVG()], { type: "image/svg+xml" }));
    download(url, `${slug(state.seed)}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const a = builder.stage.avatar;
  if (!a) return;
  const rotation = a.rotation.clone();
  a.rotation.set(0, 0, 0);
  const glb = (await new GLTFExporter().parseAsync(a, { binary: true })) as ArrayBuffer;
  a.rotation.copy(rotation);
  const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
  download(url, `${slug(state.seed)}.glb`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
$("#copy-code").addEventListener("click", (e) => copy(builderCode(), e.currentTarget as HTMLElement, "builder.copied"));

// --- Playground -----------------------------------------------------------------------------------

const k = (s: string) => `<span class="k">${s}</span>`;
const str = (s: string) => `<span class="s">"${s}"</span>`;
const c = (s: string) => `<span class="c">${s}</span>`;

const SNIPPETS: Record<string, (s: string) => string> = {
  html: (s) => `&lt;canvas id="avatar" width="256" height="256"&gt;&lt;/canvas&gt;

&lt;script type="module"&gt;
  ${k("import")} { AvatarFactory, AvatarStage } ${k("from")} ${str("@zuri/avatar")};

  ${k("const")} stage = ${k("new")} AvatarStage({ canvas: avatar, transparent: ${k("true")} });
  stage.show(${k("await new")} AvatarFactory().create(${str(s)}));
  stage.render();
&lt;/script&gt;`,
  react: (s) => `${k("import")} { AvatarFactory, snapshotAvatar } ${k("from")} ${str("@zuri/avatar")};

${k("const")} zuri = ${k("new")} AvatarFactory();

${k("export function")} Avatar({ seed = ${str(s)}, size = 48 }) {
  ${k("const")} [src, setSrc] = useState&lt;string&gt;();
  useEffect(() =&gt; {
    zuri.create(seed).then((a) =&gt; setSrc(snapshotAvatar(a, { size: size * 2 })));
  }, [seed]);
  ${k("return")} &lt;img src={src} width={size} height={size} alt="" /&gt;;
}`,
  vue: (s) => `&lt;script setup&gt;
${k("import")} { ref, watchEffect } ${k("from")} ${str("vue")};
${k("import")} { AvatarFactory, snapshotAvatar } ${k("from")} ${str("@zuri/avatar")};

${k("const")} props = defineProps({ seed: { default: ${str(s)} } });
${k("const")} src = ref();
${k("const")} zuri = ${k("new")} AvatarFactory();
watchEffect(${k("async")} () =&gt; (src.value = snapshotAvatar(${k("await")} zuri.create(props.seed))));
&lt;/script&gt;

&lt;template&gt;&lt;img :src="src" width="48" height="48" alt="" /&gt;&lt;/template&gt;`,
  "three.js": (s) => `${k("import")} { AvatarFactory } ${k("from")} ${str("@zuri/avatar")};

${c("// meshed on a worker pool, returns a THREE.Group")}
${k("const")} avatar = ${k("await new")} AvatarFactory().create(${str(s)});
scene.add(avatar);

${c("// idle blinking + sway")}
renderer.setAnimationLoop((t) =&gt; avatar.userData.tick(t / 1000));`,
  url: (s) => `${c("# pro: hosted, CDN cached")}
https://api.zuri.dev/avatar/${encodeURIComponent(s)}.png?size=256
https://api.zuri.dev/avatar/${encodeURIComponent(s)}.glb`,
};

let tab = "html";
const tabs = $("#code-tabs");
const code = $("#code");
const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
function renderCode() {
  code.innerHTML = SNIPPETS[tab]!(escape(heroSeed));
}
for (const name of Object.keys(SNIPPETS)) {
  const b = document.createElement("button");
  b.textContent = name;
  b.setAttribute("role", "tab");
  b.setAttribute("aria-selected", String(name === tab));
  b.addEventListener("click", () => {
    tab = name;
    for (const el of tabs.children) el.setAttribute("aria-selected", String(el === b));
    renderCode();
  });
  tabs.append(b);
}
$("#copy-snippet").addEventListener("click", (e) => copy(code.textContent ?? "", e.currentTarget as HTMLElement));

function updatePreviews(avatar: Avatar) {
  const src = hero.snapshot(128, true) ?? snapshotAvatar(avatar, { size: 128, transparent: true });
  for (const img of document.querySelectorAll<HTMLImageElement>("[data-avatar]")) img.src = src;
  const style3d = $<HTMLImageElement>("#style-3d");
  style3d.src = hero.snapshot(512, true) ?? style3d.src;
  const name = heroSeed.split("@")[0]!;
  for (const el of document.querySelectorAll("[data-name]")) el.textContent = name.charAt(0).toUpperCase() + name.slice(1);
}
$("#stack").innerHTML = ["nia", "hiro", "sofia", "kojo", "maya"].map((n) => `<img src="/avatars/${n}.webp" alt="" />`).join("");
$("#final-faces").innerHTML = ["kwame", "mei", "sofia", "obi", "priya", "eli", "leo"].map((n) => `<img src="/avatars/${n}.webp" alt="" loading="lazy" />`).join("");

// --- Pricing --------------------------------------------------------------------------------------

let period: "monthly" | "yearly" = "monthly";
let currency = detectCurrency();
const currencySelect = $<HTMLSelectElement>("#currency");
for (const cur of CURRENCIES) currencySelect.add(new Option(cur.label, cur.code));
currencySelect.value = currency;
currencySelect.addEventListener("change", () => {
  currency = currencySelect.value;
  localStorage.setItem("zuri.currency", currency);
  renderPrices();
});
for (const b of document.querySelectorAll<HTMLButtonElement>("#period [data-period]")) {
  b.addEventListener("click", () => {
    period = b.dataset.period as typeof period;
    for (const o of document.querySelectorAll("#period [data-period]")) o.setAttribute("aria-selected", String(o === b));
    renderPrices();
  });
}
function renderPrices() {
  const cur = CURRENCIES.find((x) => x.code === currency)!;
  const locale = navigator.language;
  const price = (n: number) => formatPrice(period === "yearly" ? yearly(n) : n, cur.code, locale);
  $("#price-free").textContent = formatPrice(0, cur.code, locale);
  $("#price-pro").textContent = price(cur.pro);
  $("#price-biz").textContent = price(cur.business);
  for (const el of document.querySelectorAll("[data-billing]")) el.textContent = period === "yearly" ? t("pricing.billedYearly") : " ";
  $("#regional").textContent = t("pricing.regional", { currency: cur.code });
}

// --- Language and nav -----------------------------------------------------------------------------

const langSelect = $<HTMLSelectElement>("#lang");
for (const [code, name] of Object.entries(LANGS)) langSelect.add(new Option(name, code));
function applyLang(l: Lang) {
  setLang(l);
  langSelect.value = l;
  buildControls();
  renderHairRow();
  renderPrices();
}
langSelect.addEventListener("change", () => applyLang(langSelect.value as Lang));

const nav = $(".top");
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 8), { passive: true });

// --- Start ----------------------------------------------------------------------------------------

applyLang(detectLang());
builderSeed.value = state.seed;
setHeroSeed(heroSeed);
// Build the builder's avatar once it's close to the viewport, so the hero gets the workers first.
new IntersectionObserver((entries, obs) => {
  if (entries.some((e) => e.isIntersecting)) {
    obs.disconnect();
    if (!builder.stage.avatar) updateBuilder(true);
  }
}, { rootMargin: "400px" }).observe(builder.tile);
syncControls();

if (import.meta.env.DEV) Object.assign(window, { zuri: { hero, builder, factory, lang } });
