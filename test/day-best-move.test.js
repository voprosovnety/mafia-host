import test from "node:test";
import assert from "node:assert/strict";

import { DayBestMoveController, normalizeDayBestMoveState } from "../js/day-best-move.js";

test("day best move restores one recipient and exactly three valid picks", () => {
  assert.deepEqual(normalizeDayBestMoveState({
    playerNumber: 1,
    bestMove: [2, 8, 10, 4],
  }), {
    playerNumber: 1,
    enabled: true,
    bestMove: [2, 8, 10],
  });
  assert.deepEqual(normalizeDayBestMoveState({
    playerNumber: 11,
    bestMove: [0, 2, "нет"],
  }), {
    playerNumber: null,
    enabled: false,
    bestMove: [null, null, null],
  });
  assert.deepEqual(normalizeDayBestMoveState({
    playerNumber: 1,
    enabled: false,
    bestMove: [2, 8, 10],
  }), {
    playerNumber: 1,
    enabled: false,
    bestMove: [null, null, null],
  });
  assert.equal(normalizeDayBestMoveState({ playerNumber: 1 }).enabled, false);
});

test("day best move section stays hidden until a player becomes eligible", () => {
  const controller = Object.create(DayBestMoveController.prototype);
  controller.section = { hidden: false };
  controller.playerOutput = { textContent: "" };
  controller.bonusOutput = { hidden: false };
  controller.toggleButton = { setAttribute() {} };
  controller.inputsContainer = { hidden: false };
  controller.inputs = [0, 1, 2].map(() => ({
    classList: { remove() {} },
    disabled: false,
    value: "",
    title: "",
  }));
  controller.state = normalizeDayBestMoveState(null);

  controller.render();
  assert.equal(controller.section.hidden, true);

  controller.state = normalizeDayBestMoveState({ playerNumber: 1, enabled: false });
  controller.render();
  assert.equal(controller.section.hidden, false);
  assert.equal(controller.inputsContainer.hidden, true);
  assert.equal(controller.getSelectedPlayerNumber(), null);
});

test("day best move requires a button press and can be removed", () => {
  const listeners = {};
  const button = {
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute(name, value) { this[name] = value; },
  };
  const inputs = [0, 1, 2].map(() => ({
    addEventListener() {},
    classList: { remove() {} },
    value: "",
  }));
  let changes = 0;
  const controller = new DayBestMoveController({
    section: { hidden: true },
    playerOutput: { textContent: "" },
    bonusOutput: { hidden: true },
    toggleButton: button,
    inputsContainer: { hidden: true },
    inputs,
    onChange: () => { changes += 1; },
  });

  controller.setEligiblePlayer(1);
  assert.equal(controller.getSelectedPlayerNumber(), null);
  listeners.click();
  assert.equal(controller.getSelectedPlayerNumber(), 1);
  assert.equal(button["aria-pressed"], "true");
  assert.equal(controller.inputsContainer.hidden, false);
  controller.state.bestMove = [2, 3, 4];
  listeners.click();
  assert.equal(controller.getSelectedPlayerNumber(), null);
  assert.deepEqual(controller.getBestMove(), [null, null, null]);
  assert.equal(controller.inputsContainer.hidden, true);
  assert.equal(changes, 2);
});
