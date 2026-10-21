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

test("toon style: sculpted brows, finite meshes, same person", () => {
  const p = generateAvatar("toon-check", { hair: "afro", facialHair: "beard", presentation: "masculine" });
  const toon = meshAvatar(p, 0.6, "toon");
  assert.equal(toon.style, "toon");
  for (const part of [toon.body, toon.hair!, toon.facialHair!, toon.outfit, toon.brows!]) {
    assert.ok(part.indices.length > 300);
    assert.ok(part.positions.every(Number.isFinite));
  }
  // The soft style paints its brows instead.
  assert.equal(meshAvatar(p, 0.6).brows, null);
  // Same seed, same toon mesh.
  assert.deepEqual(meshAvatar(p, 0.6, "toon").hair!.positions, toon.hair!.positions);
});

test("wardrobe: every garment and accessory builds, colors and opt-in rules hold", async () => {
  const { OUTFIT_LIST, ACCESSORY_LIST, WARDROBE } = await import("../src/params.ts");
  for (const outfit of OUTFIT_LIST) {
    const m = meshAvatar(generateAvatar(`wear-${outfit}`, { outfit }), 0.4);
    assert.ok(m.outfit.indices.length > 300, outfit);
    assert.ok(m.outfit.positions.every(Number.isFinite), outfit);
  }
  const acc = (accessory: (typeof ACCESSORY_LIST)[number]) => meshAvatar(generateAvatar("acc", { accessory }), 0.4);
  assert.ok(acc("necklace").jewelry!.indices.length > 100);
  assert.ok(acc("headtie").headwear!.indices.length > 100);
  assert.equal(acc("headtie").hair, null); // the gele covers the hair
  // Explicit colors win; garments with their own color use it; invalid colors are ignored.
  assert.equal(generateAvatar("c", { outfit: "labcoat" }).outfit.color, "#f6f6f3");
  assert.equal(generateAvatar("c", { outfit: "labcoat", outfitColor: "#123456" }).outfit.color, "#123456");
  assert.equal(generateAvatar("c", { outfitColor: "red" } as never).outfit.color, generateAvatar("c").outfit.color);
  // New garments are opt-in: never chosen for generated faces.
  const random = new Set(WARDROBE.filter((g) => "random" in g && g.random).map((g) => g.id as string));
  for (let i = 0; i < 300; i++) assert.ok(random.has(generateAvatar(`r${i}`).outfit.style));
});

test("face shapes: varied by seed, settable, and actually different geometry", async () => {
  const { FACE_SHAPE_LIST } = await import("../src/params.ts");
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(generateAvatar(`shape-${i}`).face.shape);
  assert.equal(seen.size, FACE_SHAPE_LIST.length);
  const width = (faceShape: (typeof FACE_SHAPE_LIST)[number]) => {
    const m = meshAvatar(generateAvatar("same", { faceShape, hair: "none" }), 0.4);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m.body.positions.length; i += 3) if (m.body.positions[i + 1]! > -0.6 && m.body.positions[i + 1]! < -0.4) { lo = Math.min(lo, m.body.positions[i]!); hi = Math.max(hi, m.body.positions[i]!); }
    return hi - lo;
  };
  // A round face is clearly wider at the mouth than a long one.
  assert.ok(width("round") > width("long") * 1.12, `${width("round")} vs ${width("long")}`);
});
