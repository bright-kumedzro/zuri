import { test } from "node:test";
import assert from "node:assert/strict";
import { createFlatAvatar } from "../src/flat.ts";
import { EXPRESSION_LIST, HAIR_STYLE_LIST, OUTFIT_LIST } from "../src/params.ts";

test("same seed, same flat avatar", () => {
  assert.equal(createFlatAvatar("ada@example.com"), createFlatAvatar("ada@example.com"));
  assert.notEqual(createFlatAvatar("ada@example.com"), createFlatAvatar("ada@example.co"));
});

test("every trait draws a clean SVG", () => {
  const cases = [
    ...HAIR_STYLE_LIST.map((hair) => ({ hair })),
    ...EXPRESSION_LIST.map((expression) => ({ expression })),
    ...OUTFIT_LIST.map((outfit) => ({ outfit })),
    ...(["stubble", "mustache", "goatee", "beard"] as const).map((facialHair) => ({ facialHair })),
    { glasses: "round" as const }, { glasses: "square" as const },
  ];
  for (const options of cases) {
    const svg = createFlatAvatar("trait-check", { ...options, shape: "circle" });
    assert.match(svg, /^<svg [^>]+>.*<\/svg>$/s);
    assert.doesNotMatch(svg, /NaN|undefined|\{\{id\}\}/, JSON.stringify(options));
  }
});

test("options control size, background and shape", () => {
  const svg = createFlatAvatar("x", { size: 64, transparent: true, shape: "rounded", background: "#123456" });
  assert.match(svg, /width="64" height="64"/);
  assert.doesNotMatch(svg, /#123456/);
  assert.match(svg, /rx="112"/);
});

test("different drawings get different clip-path ids", () => {
  const id = (svg: string) => svg.match(/clipPath id="(z[0-9a-z]+)h"/)![1];
  assert.notEqual(id(createFlatAvatar("a")), id(createFlatAvatar("b")));
});
