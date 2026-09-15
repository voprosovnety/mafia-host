import test from "node:test";
import assert from "node:assert/strict";

import { DayBestMoveController, normalizeDayBestMoveState } from "../js/day-best-move.js";

test("day best move restores one recipient and exactly three valid picks", () => {
  assert.deepEqual(normalizeDayBestMoveState({
    playerNumber: 1,
    bestMove: [2, 8, 10, 4],
  }), {
    playerNumber: 1,
    bestMove: [2, 8, 10],
  });
  assert.deepEqual(normalizeDayBestMoveState({
    playerNumber: 11,
    bestMove: [0, 2, "нет"],
  }), {
    playerNumber: null,
    bestMove: [null, null, null],
  });
});

test("day best move section stays hidden until a player becomes eligible", () => {
  const controller = Object.create(DayBestMoveController.prototype);
  controller.section = { hidden: false };
  controller.playerOutput = { textContent: "" };
  controller.inputs = [0, 1, 2].map(() => ({
    classList: { remove() {} },
    disabled: false,
    value: "",
    title: "",
  }));
  controller.state = normalizeDayBestMoveState(null);

  controller.render();
  assert.equal(controller.section.hidden, true);

  controller.state = normalizeDayBestMoveState({ playerNumber: 1 });
  controller.render();
  assert.equal(controller.section.hidden, false);
});
