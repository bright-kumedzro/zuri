import { test } from "node:test";
import assert from "node:assert/strict";
import { createFlatAvatar, flatAvatarSVG } from "../src/flat.ts";
import { generateAvatar, type AvatarOptions, type AvatarParams } from "../src/params.ts";

const EVIL = `#fff"/><script>alert(1)</script><rect fill="`;
const clean = (svg: string) => {
  assert.doesNotMatch(svg, /<script|onload|onerror|javascript:|alert\(/i);
  // Only the tags the renderer itself emits.
  for (const [, tag] of svg.matchAll(/<\/?([a-zA-Z]+)/g)) assert.ok(["svg", "defs", "clipPath", "path", "rect", "g", "circle", "ellipse"].includes(tag!), tag);
};

test("hostile options never reach the SVG", () => {
  const hostile = { background: EVIL, skin: EVIL, hair: EVIL, outfit: EVIL, expression: EVIL, glasses: EVIL, facialHair: EVIL, presentation: EVIL };
  clean(createFlatAvatar("x", hostile as unknown as AvatarOptions));
  clean(createFlatAvatar(EVIL));
  clean(createFlatAvatar("x", { size: `1" onload="alert(1)` as unknown as number, shape: EVIL as "circle" }));
});

test("hostile params never reach the SVG", () => {
  const p = generateAvatar("x");
  const bad = JSON.parse(JSON.stringify(p, (_, v) => (typeof v === "string" ? EVIL : typeof v === "number" ? EVIL : v))) as AvatarParams;
  clean(flatAvatarSVG(bad));
  clean(flatAvatarSVG({} as AvatarParams));
});

test("invalid options fall back to the seed", () => {
  const base = generateAvatar("ada");
  assert.deepEqual(generateAvatar("ada", { background: "red", skin: Number.NaN, hair: "mohawk" } as unknown as AvatarOptions), base);
  assert.equal(generateAvatar("ada", { background: "#123ABC" }).background, "#123ABC");
});

test("size is clamped to a sane integer", () => {
  assert.match(createFlatAvatar("x", { size: 1e9 }), /width="4096"/);
  assert.match(createFlatAvatar("x", { size: -5 }), /width="1"/);
  assert.match(createFlatAvatar("x", { size: 99.6 }), /width="100"/);
});
