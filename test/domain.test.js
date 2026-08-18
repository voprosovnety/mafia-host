import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateBestMoveBonus,
  buildLeaderboard,
  buildGameSnapshot,
  calculateScores,
  calculateTechnicalFoulPenalty,
  compareGamesChronologically,
  filterGamesByInterval,
  getGameId,
  parseExtraScore,
  recoverFirstKilledMarker,
  shuffledCopy,
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

test("random seating shuffles a copy without losing players", () => {
  const players = ["А", "Б", "В", "Г"];
  const randomValues = [0.2, 0.8, 0.1];
  const shuffled = shuffledCopy(players, () => randomValues.shift());
  assert.deepEqual(shuffled, ["Б", "Г", "В", "А"]);
  assert.deepEqual(players, ["А", "Б", "В", "Г"]);
});

test("base score follows the role team and winner", () => {
  assert.deepEqual(calculateScores("Мирный", "0.6", "red"), {
    team: "red", base: 1, extra: 0.6, lh: 0, ci: 0,
    technicalFouls: 0, technicalPenalty: 0, total: 1.6,
  });
  assert.deepEqual(calculateScores("Дон", "-0.4", "red"), {
    team: "black", base: 0, extra: -0.4, lh: 0, ci: 0,
    technicalFouls: 0, technicalPenalty: 0, total: -0.4,
  });
});

test("each technical foul deducts 0.3 up to a maximum of two", () => {
  assert.equal(calculateTechnicalFoulPenalty(0), 0);
  assert.equal(calculateTechnicalFoulPenalty(1), -0.3);
  assert.equal(calculateTechnicalFoulPenalty(2), -0.6);
  assert.equal(calculateTechnicalFoulPenalty(3), -0.6);
});

test("best move awards 0.5 for two black roles and 0.8 for three", () => {
  const players = [
    { number: 1, role: "Мирный" },
    { number: 2, role: "Мафия" },
    { number: 3, role: "Дон" },
    { number: 4, role: "Мафия" },
  ];
  assert.equal(calculateBestMoveBonus([1, 2, null], players), 0);
  assert.equal(calculateBestMoveBonus([1, 2, 3], players), 0.5);
  assert.equal(calculateBestMoveBonus([2, 3, 4], players), 0.8);
  assert.equal(calculateBestMoveBonus([2, 2, 3], players), 0.5);
  assert.equal(calculateBestMoveBonus([2, 3, 4], null), 0);
});

test("manual extra, technical fouls, best move and CI are separate score components", () => {
  assert.deepEqual(calculateScores("Мирный", "0.2", "red", 0.5, 0.3, 2), {
    team: "red", base: 1, extra: 0.2, lh: 0.5, ci: 0.3,
    technicalFouls: 2, technicalPenalty: -0.6, total: 1.4,
  });
  const snapshot = buildGameSnapshot([
    {
      number: 1,
      name: "ПУ",
      role: "Мирный",
      extra: "-0.2",
      isFirstKilled: true,
      bestMoveBonus: 0.8,
      technicalFouls: 1,
      notes: "Проверить речь",
    },
  ], "red", {
    now: new Date("2026-08-17T12:00:00Z"),
    bestMove: [2, 8, 10],
  });
  assert.equal(snapshot.players[0].extra, -0.2);
  assert.equal(snapshot.players[0].lh, 0.8);
  assert.equal(snapshot.players[0].ci, 0);
  assert.equal(snapshot.players[0].technicalFouls, 1);
  assert.equal(snapshot.players[0].total, 1.3);
  assert.equal(snapshot.players[0].notes, "Проверить речь");
  assert.equal(snapshot.players[0].isFirstKilled, true);
  assert.deepEqual(snapshot.bestMove, [2, 8, 10]);
});

test("a matching archived game recovers the first-killed marker from the current game", () => {
  const archived = {
    gameId: "mf-matching-game",
    winner: "red",
    players: [
      { number: 1, name: "Один", role: "Мирный", base: 1, extra: 0, total: 1, isFirstKilled: false },
      { number: 2, name: "Два", role: "Мафия", base: 0, extra: 0, total: 0, isFirstKilled: false },
    ],
  };
  const current = structuredClone(archived);
  current.players[0].isFirstKilled = true;

  const recovered = recoverFirstKilledMarker(archived, current);

  assert.equal(recovered.players[0].isFirstKilled, true);
  assert.equal(recovered.players[1].isFirstKilled, false);
  assert.equal(archived.players[0].isFirstKilled, false);
  assert.equal(recoverFirstKilledMarker(archived, { ...current, gameId: "mf-other" }), null);
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
  assert.notEqual(getGameId(baseGame), getGameId({
    ...baseGame,
    players: [{ ...baseGame.players[0], technicalFouls: 1, total: 0.7 }],
  }));
  assert.notEqual(getGameId(baseGame), getGameId({
    ...baseGame,
    players: [{ ...baseGame.players[0], lh: 0.5, total: 1.5 }],
  }));
  assert.notEqual(getGameId(baseGame), getGameId({
    ...baseGame,
    players: [{ ...baseGame.players[0], ci: 0.2, total: 1.2 }],
  }));
});

test("leaderboard combines bonuses and penalties by normalized nickname", () => {
  const games = [
    game({ date: "01.08.2026", time: "10:00:00", players: [
      { name: "Шляпа", extra: 0.6, total: 1.6 },
    ] }),
    game({ date: "02.08.2026", time: "10:00:00", players: [
      { name: "  шляпа ", extra: -0.4, technicalFouls: 1, total: 0.3 },
    ] }),
  ];
  assert.deepEqual(buildLeaderboard(games)[0], {
    name: "Шляпа",
    totalScore: 1.9,
    netExtra: -0.1,
    bonuses: 0.6,
    penalties: -0.7,
    gamesPlayed: 2,
    average: 0.95,
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
