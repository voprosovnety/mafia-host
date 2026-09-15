import test from "node:test";
import assert from "node:assert/strict";

import { PlayersController } from "../js/players.js";

test("new game state clears player nicknames", () => {
  const record = {
    number: 1,
    name: { value: "Игрок" },
    role: { value: "Мирный" },
    extra: { value: "0.4" },
    penalty: { value: "0.2" },
    notes: "Заметка",
    notesButton: {
      classList: { remove() {} },
      setAttribute() {},
    },
  };
  let suggestionsHidden = false;
  const controller = {
    records: [record],
    notesText: { value: "Заметка" },
    notesDialog: { open: false },
    hideNicknameSuggestions() {
      suggestionsHidden = true;
    },
    setFirstKilled() {},
    setDayBestMove() {},
    setFaultCount() {},
    setTechnicalFaultCount() {},
    updatePlayerScore() {},
    setSeatingStatus() {},
  };

  PlayersController.prototype.resetGameState.call(controller);

  assert.equal(record.name.value, "");
  assert.equal(suggestionsHidden, true);
});
