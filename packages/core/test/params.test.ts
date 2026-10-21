import { test } from "node:test";
import assert from "node:assert/strict";
import { generateParams, Random } from "../src/index.ts";

const FACE_IDS = ["nose/nose-trans-down|up", "eyes/r-eye-height1-decr|incr", "eyes/l-eye-height1-decr|incr", "head/head-oval"];

test("same seed gives identical parameters", () => {
  assert.deepEqual(generateParams("ama@example.com", {}, FACE_IDS), generateParams("ama@example.com", {}, FACE_IDS));
});

test("different seeds give different people", () => {
  const a = generateParams("user-1", {}, FACE_IDS);
  const b = generateParams("user-2", {}, FACE_IDS);
  assert.notDeepEqual(a, b);
});

test("options constrain the result", () => {
  for (let i = 0; i < 50; i++) {
    const p = generateParams(`s${i}`, { gender: "female", ethnicity: "african", age: [30, 40] });
    assert.ok(p.gender < 0.5);
    assert.ok(p.ethnicity.african >= 0.85);
    assert.ok(p.ageYears >= 30 && p.ageYears <= 40);
  }
});

test("ethnicity weights sum to 1", () => {
  for (let i = 0; i < 50; i++) {
    const e = generateParams(`e${i}`).ethnicity;
    assert.ok(Math.abs(e.african + e.asian + e.caucasian - 1) < 1e-9);
  }
});

test("face is symmetric", () => {
  const p = generateParams("sym", {}, FACE_IDS);
  assert.equal(p.face["eyes/r-eye-height1-decr|incr"], p.face["eyes/l-eye-height1-decr|incr"]);
});

test("adding an option does not reshuffle unrelated traits", () => {
  const a = generateParams("stable", {}, FACE_IDS);
  const b = generateParams("stable", { expression: "smile" }, FACE_IDS);
  assert.deepEqual(a.face, b.face);
  assert.equal(a.hair, b.hair);
});

test("PRNG is stable across releases", () => {
  // Changing these values changes every user's avatar. Don't, unless that's intended.
  const r = new Random("zuri");
  assert.deepEqual([r.next(), r.next()].map((v) => v.toFixed(8)), ["0.45278090", "0.64375985"]);
});
