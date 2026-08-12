import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeaderboard,
  calculateScores,
  compareGamesChronologically,
  filterGamesByInterval,
  getGameId,
  parseExtraScore,
} from "../js/domain.js";

function game({ date, time, players }) {
  return { date, time, players };
}

test("additional scores accept commas, negatives and empty values", () => {
  assert.equal(parseExtraScore("0,6"), 0.6);
  assert.equal(parseExtraScore("-0.4"), -0.4);
  assert.equal(parseExtraScore(""), 0);
  assert.equal(parseExtraScore("abc"), null);
});

test("base score follows the role team and winner", () => {
  assert.deepEqual(calculateScores("Мирный", "0.6", "red"), {
    team: "red", base: 1, extra: 0.6, total: 1.6,
  });
  assert.deepEqual(calculateScores("Дон", "-0.4", "red"), {
    team: "black", base: 0, extra: -0.4, total: -0.4,
  });
});

test("stable game id ignores metadata but changes with results", () => {
  const baseGame = {
    winner: "red",
    players: [{ number: 1, name: "Игрок", role: "Мирный", base: 1, extra: 0, total: 1 }],
  };
  assert.equal(getGameId(baseGame), getGameId({ ...baseGame, date: "01.01.2099" }));
  assert.notEqual(getGameId(baseGame), getGameId({
    ...baseGame,
    players: [{ ...baseGame.players[0], extra: 0.2, total: 1.2 }],
  }));
});

test("leaderboard combines bonuses and penalties by normalized nickname", () => {
  const games = [
    game({ date: "01.08.2026", time: "10:00:00", players: [
      { name: "Шляпа", extra: 0.6, total: 1.6 },
    ] }),
    game({ date: "02.08.2026", time: "10:00:00", players: [
      { name: "  шляпа ", extra: -0.4, total: 0.6 },
    ] }),
  ];
  assert.deepEqual(buildLeaderboard(games)[0], {
    name: "Шляпа",
    totalScore: 2.2,
    netExtra: 0.2,
    bonuses: 0.6,
    penalties: -0.4,
    gamesPlayed: 2,
    average: 1.1,
  });
});

test("date-time interval is inclusive and detects reversed bounds", () => {
  const games = [
    game({ date: "01.08.2026", time: "10:00:00", players: [] }),
    game({ date: "02.08.2026", time: "12:30:00", players: [] }),
    game({ date: "03.08.2026", time: "18:00:00", players: [] }),
  ];
  const result = filterGamesByInterval(games, "2026-08-02T12:30:00", "2026-08-03T18:00:00");
  assert.equal(result.invalid, false);
  assert.deepEqual(result.games, games.slice(1));
  assert.equal(filterGamesByInterval(games, "2026-08-03T00:00", "2026-08-02T00:00").invalid, true);
});

test("games are ordered by their editable game date and time", () => {
  const later = { id: "first-saved", date: "14.08.2026", time: "09:00:00" };
  const earlier = { id: "last-saved", date: "13.08.2026", time: "22:00:00" };
  assert.deepEqual([later, earlier].sort(compareGamesChronologically), [earlier, later]);
});
