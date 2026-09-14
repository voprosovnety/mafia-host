import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDayBestMoveState } from "../js/day-best-move.js";

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
