import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAvatar, HAIR_STYLE_LIST, SKIN_TONES } from "../src/params.ts";
import { meshAvatar } from "../src/mesh.ts";

test("same seed, same avatar", () => {
  assert.deepEqual(generateAvatar("ada@example.com"), generateAvatar("ada@example.com"));
  assert.notDeepEqual(generateAvatar("ada@example.com"), generateAvatar("ada@example.co"));
});

test("options override the seed", () => {
  const p = generateAvatar("x", { presentation: "masculine", hair: "locs", expression: "wink", skin: 0 });
  assert.equal(p.presentation, "masculine");
  assert.equal(p.hair.style, "locs");
  assert.equal(p.expression, "wink");
  assert.equal(p.skin, SKIN_TONES[0]);
});

test("traits are spread across many seeds", () => {
  const styles = new Set<string>(), tones = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const p = generateAvatar(`user-${i}`);
    styles.add(p.hair.style);
    tones.add(p.skin);
  }
  assert.ok(styles.size >= HAIR_STYLE_LIST.length - 2, `only ${styles.size} hairstyles`);
  assert.equal(tones.size, SKIN_TONES.length);
});

test("meshes are finite and non-empty", () => {
  const m = meshAvatar(generateAvatar("mesh-check", { hair: "afro", facialHair: "beard", presentation: "masculine" }), 0.6);
  for (const part of [m.body, m.hair!, m.facialHair!, m.outfit]) {
    assert.ok(part.indices.length > 300);
    assert.ok(part.positions.every(Number.isFinite));
  }
});
