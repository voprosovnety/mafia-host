import test from "node:test";
import assert from "node:assert/strict";

import { scoreBreakdownItems } from "../js/history.js";

test("score breakdown contains only non-zero components", () => {
  assert.deepEqual(scoreBreakdownItems({
    base: 1,
    extra: -0.3,
    technicalFouls: 1,
    lh: 0.5,
    ci: 0.2,
  }), [
    { label: "Победа", value: "+1" },
    { label: "Штраф", value: "−0.3" },
    { label: "Техфол", value: "−0.3" },
    { label: "ЛХ", value: "+0.5" },
    { label: "CI", value: "+0.2" },
  ]);
});

test("zero score has no breakdown rows", () => {
  assert.deepEqual(scoreBreakdownItems({
    base: 0,
    extra: 0,
    technicalFouls: 0,
    lh: 0,
    ci: 0,
  }), []);
});

test("positive manual score is labeled as an extra", () => {
  assert.deepEqual(scoreBreakdownItems({
    base: 0,
    extra: 0.4,
    technicalFouls: 0,
    lh: 0,
    ci: 0,
  }), [
    { label: "Доп", value: "+0.4" },
  ]);
});

test("two technical fouls are grouped into one breakdown row", () => {
  assert.deepEqual(scoreBreakdownItems({
    base: 0,
    extra: 0,
    technicalFouls: 2,
    lh: 0,
    ci: 0,
  }), [
    { label: "Техфол ×2", value: "−0.6" },
  ]);
});
