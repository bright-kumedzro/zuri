import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { AvatarFactory, AvatarStage, disposeAvatar, snapshotAvatar, type Avatar } from "@zuri/avatar";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** Seeds pre-rendered into /avatars (transparent, see README). */
const CAST = [
  "amara", "kwame", "lin", "sofia", "tunde", "maya", "obi", "zara",
  "kofi", "mei", "leo", "ama", "yaw", "priya", "diego", "nia",
  "efua", "hiro", "layla", "kojo", "ines", "sena", "musa", "eli",
];

const factory = new AvatarFactory();
let seed = "amara";

// --- Live tile ----------------------------------------------------------------------------------

const canvas = $<HTMLCanvasElement>("#stage");
const tile = canvas.parentElement!;
const stage = new AvatarStage({ canvas, transparent: true });
const resize = () => {
  const r = tile.getBoundingClientRect();
  stage.setSize(Math.round(r.width), Math.round(r.height));
};
new ResizeObserver(resize).observe(tile);
resize();

let yaw = 0;
let drag: { x: number; yaw: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, yaw };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012;
});
canvas.addEventListener("pointerup", () => (drag = null));

// Animate only while visible, at ~30 fps: plenty for blinks and sway.
let visible = true;
new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting)).observe(tile);
const clock = performance.now();
let last = 0;
const loop = (now: number) => {
  requestAnimationFrame(loop);
  if (!visible || document.hidden || now - last < 32) return;
  last = now;
  if (!drag) yaw *= 0.9;
  const a = stage.avatar;
  if (a) {
    a.userData.tick((now - clock) / 1000);
    a.rotation.y += yaw;
  }
  stage.render();
};
requestAnimationFrame(loop);

// --- Seed (shared by the tile and the playground) -----------------------------------------------

const heroSeed = $<HTMLInputElement>("#hero-seed");
const playSeed = $<HTMLInputElement>("#seed");
const loading = $("#loading");
let request = 0;

async function show() {
  const id = ++request;
  loading.classList.add("on");
  const avatar = await factory.create(seed || "zuri");
  if (id !== request) return disposeAvatar(avatar);
  loading.classList.remove("on");
  stage.show(avatar);
  updatePreviews(avatar);
}

let debounce = 0;
function setSeed(value: string, from?: HTMLInputElement) {
  seed = value.trim();
  if (from !== heroSeed) heroSeed.value = seed;
  if (from !== playSeed) playSeed.value = seed;
  renderCode();
  clearTimeout(debounce);
  debounce = window.setTimeout(show, 300);
}
for (const input of [heroSeed, playSeed]) input.addEventListener("input", () => setSeed(input.value, input));

// --- Cast grid ----------------------------------------------------------------------------------

$("#cast").innerHTML = CAST.map(
  (n) => `<a class="tile" href="#" data-seed="${n}" title="${n}"><img src="/avatars/${n}.webp" alt="${n}" loading="lazy" /></a>`,
).join("");
$("#cast").addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>("[data-seed]");
  if (!a) return;
  e.preventDefault();
  setSeed(a.dataset.seed!);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// --- Downloads ----------------------------------------------------------------------------------

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}
const fileName = () => (seed || "zuri").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

/** snapshotAvatar borrows the avatar into its own scene; hand it back afterwards. */
function snapshot(avatar: Avatar, size: number, transparent = true) {
  const url = snapshotAvatar(avatar, { size, transparent });
  stage.scene.add(avatar);
  return url;
}

$("#dl-png").addEventListener("click", () => {
  if (stage.avatar) download(snapshot(stage.avatar, 1024), `${fileName()}.png`);
});
$("#dl-glb").addEventListener("click", async () => {
  const a = stage.avatar;
  if (!a) return;
  const rotation = a.rotation.clone();
  a.rotation.set(0, 0, 0);
  const glb = (await new GLTFExporter().parseAsync(a, { binary: true })) as ArrayBuffer;
  a.rotation.copy(rotation);
  const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
  download(url, `${fileName()}.glb`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// --- Playground ---------------------------------------------------------------------------------

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
  "three.js": (s) => `${k("import")} { AvatarFactory } ${k("from")} ${str("@zuri/avatar")};

${c("// meshed on a worker pool, returns a THREE.Group")}
${k("const")} avatar = ${k("await new")} AvatarFactory().create(${str(s)});
scene.add(avatar);

${c("// idle blinking + sway")}
renderer.setAnimationLoop((t) =&gt; avatar.userData.tick(t / 1000));`,
  png: (s) => `${k("import")} { AvatarFactory, snapshotAvatar } ${k("from")} ${str("@zuri/avatar")};

${k("const")} avatar = ${k("await new")} AvatarFactory().create(${str(s)});
img.src = snapshotAvatar(avatar, { size: 256, transparent: ${k("true")} });`,
  url: (s) => `${c("# pro: hosted, CDN cached")}
https://api.zuri.dev/avatar/${encodeURIComponent(s)}.png?size=256
https://api.zuri.dev/avatar/${encodeURIComponent(s)}.glb`,
};

let tab = "html";
const tabs = $("#tabs");
const code = $("#code");
const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
function renderCode() {
  code.innerHTML = SNIPPETS[tab]!(escape(seed || "zuri"));
}
for (const name of Object.keys(SNIPPETS)) {
  const b = document.createElement("button");
  b.textContent = name;
  b.className = name === tab ? "on" : "";
  b.addEventListener("click", () => {
    tab = name;
    for (const el of tabs.children) el.classList.toggle("on", el === b);
    renderCode();
  });
  tabs.append(b);
}
$("#copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(code.textContent ?? "");
  $("#copy").textContent = "copied";
  setTimeout(() => ($("#copy").textContent = "copy"), 1200);
});

function updatePreviews(avatar: Avatar) {
  const src = snapshot(avatar, 128);
  for (const img of document.querySelectorAll<HTMLImageElement>("[data-avatar]")) img.src = src;
  const name = (seed || "zuri").split("@")[0]!;
  for (const el of document.querySelectorAll("[data-name]")) el.textContent = name;
}
$("#stack").innerHTML = ["nia", "hiro", "sofia", "kojo", "maya"].map((n) => `<img src="/avatars/${n}.webp" alt="${n}" />`).join("");

setSeed(seed);

if (import.meta.env.DEV) Object.assign(window, { zuri: { stage, factory } });
