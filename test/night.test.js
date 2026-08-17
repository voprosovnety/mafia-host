import test from "node:test";
import assert from "node:assert/strict";

import {
  bestMoveAvailableFromNightState,
  firstKilledPlayerFromNightState,
  killedPlayersFromNightState,
  NightController,
  nightKillsFromNightState,
  normalizeNightState,
} from "../js/night.js";

test("night state restores targets, misses and exactly three best-move slots", () => {
  assert.deepEqual(normalizeNightState({
    shots: [
      { target: 4, miss: false },
      { target: 7, miss: true },
      { target: 12, miss: false },
    ],
    bestMove: [2, 8, 10, 4],
  }), {
    shots: [
      { target: 4, miss: false },
      { target: null, miss: true },
      { target: null, miss: false },
    ],
    bestMove: [2, 8, 10],
  });
});

test("empty night state starts with one blank night", () => {
  assert.deepEqual(normalizeNightState(null), {
    shots: [{ target: null, miss: false }],
    bestMove: [null, null, null],
  });
});

test("a first-night miss clears and disables the best move", () => {
  const state = normalizeNightState({
    shots: [{ target: 4, miss: true }],
    bestMove: [2, 3, 4],
  });
  assert.deepEqual(state.bestMove, [null, null, null]);
  assert.equal(bestMoveAvailableFromNightState(state), false);
  assert.equal(bestMoveAvailableFromNightState(normalizeNightState(null)), true);
});

test("best-move inputs are disabled in the controller after a first-night miss", () => {
  const inputs = [2, 3, 4].map((value) => ({
    disabled: false,
    value: String(value),
    title: "",
    classList: { remove() {} },
  }));
  const controller = Object.create(NightController.prototype);
  controller.state = {
    shots: [{ target: null, miss: true }],
    bestMove: [2, 3, 4],
  };
  controller.bestMoveInputs = inputs;

  controller.updateBestMoveAvailability();

  assert.deepEqual(controller.state.bestMove, [null, null, null]);
  assert.equal(inputs.every((input) => input.disabled && input.value === ""), true);
});

test("only distinct successful night targets are treated as killed", () => {
  assert.deepEqual(killedPlayersFromNightState({
    shots: [
      { target: 4, miss: false },
      { target: 7, miss: true },
      { target: 4, miss: false },
      { target: 11, miss: false },
    ],
  }), [4]);
});

test("each night kill takes effect in the following numbered round", () => {
  assert.deepEqual(nightKillsFromNightState({
    shots: [
      { target: 4, miss: false },
      { target: null, miss: true },
      { target: 7, miss: false },
      { target: 4, miss: false },
    ],
  }), [
    { playerNumber: 4, fromRoundNumber: 1 },
    { playerNumber: 7, fromRoundNumber: 3 },
  ]);
});

test("first killed is derived only from a successful shot on the first night", () => {
  assert.equal(firstKilledPlayerFromNightState({
    shots: [{ target: null, miss: false }],
  }), null);
  assert.equal(firstKilledPlayerFromNightState({
    shots: [{ target: 4, miss: false }, { target: 7, miss: false }],
  }), 4);
  assert.equal(firstKilledPlayerFromNightState({
    shots: [{ target: null, miss: true }, { target: 7, miss: false }],
  }), null);
});
