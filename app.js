import {
  calculateBestMoveBonus,
  buildGameSnapshot,
  compareGamesChronologically,
  getGameId,
  recoverFirstKilledMarker,
  validateGame,
} from "./js/domain.js";
import { HistoryView } from "./js/history.js";
import { LeaderboardView } from "./js/leaderboard.js";
import { NightController } from "./js/night.js";
import { PlayersController } from "./js/players.js";
import { SpaRouter } from "./js/router.js";
import { CurrentGameStore, GamesRepository } from "./js/storage.js";
import { TimerController } from "./js/timer.js";
import { VotingController } from "./js/voting.js";

const repository = new GamesRepository();
const currentGameStore = new CurrentGameStore();
const savedGames = [];
let currentWinner = null;
let initialized = false;
let timer = null;
let night = null;

const saveStatus = document.querySelector("#save-status");
const historyStatus = document.querySelector("#history-status");
const storageIndicator = document.querySelector("#storage-indicator");
const saveGameButton = document.querySelector("#save-game");
const newGameButton = document.querySelector("#new-game");
const winnerButtons = document.querySelectorAll(".winner-button");

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function persistCurrentGame() {
  if (!initialized) return;
  const votingState = voting.getState();
  currentGameStore.save({
    winner: currentWinner,
    currentRoundIndex: votingState.currentRoundIndex,
    votingRounds: votingState.votingRounds,
    night: night.getState(),
    timer: timer.getState(),
    players: players.getState(),
  });
}

function syncFirstKilledAndBestMoveBonus() {
  const firstKilledPlayerNumber = night.getFirstKilledPlayerNumber();
  players.setFirstKilled(firstKilledPlayerNumber, false);
  const bonus = firstKilledPlayerNumber === null
    ? 0
    : calculateBestMoveBonus(night.getState().bestMove, players.getState());
  players.setBestMoveBonus(bonus);
  night.setBestMoveBonus(bonus);
}

function handleNightChange() {
  syncFirstKilledAndBestMoveBonus();
  voting.setNightKills(night.getNightKills());
  persistCurrentGame();
}

function handlePlayersChange() {
  syncFirstKilledAndBestMoveBonus();
  persistCurrentGame();
}

const voting = new VotingController({
  roundsElement: document.querySelector("#voting-rounds"),
  nextButton: document.querySelector("#next-round"),
  resetButton: document.querySelector("#reset-rounds"),
  onChange: persistCurrentGame,
});

const players = new PlayersController({
  list: document.querySelector("#players-list"),
  notesDialog: document.querySelector("#notes-dialog"),
  notesTitle: document.querySelector("#notes-title"),
  notesText: document.querySelector("#notes-text"),
  saveNotesButton: document.querySelector("#save-notes"),
  randomizeButton: document.querySelector("#randomize-seating"),
  seatingStatus: document.querySelector("#seating-status"),
  onNominate: (playerNumber) => voting.toggleNomination(playerNumber),
  onChange: handlePlayersChange,
});

players.records.forEach((record) => voting.registerNominationButton(record.number, record.nominate));

night = new NightController({
  shotsList: document.querySelector("#night-shots-list"),
  addNightButton: document.querySelector("#add-night"),
  summary: document.querySelector("#night-summary"),
  firstKilledOutput: document.querySelector("#first-killed-output"),
  bestMoveBonusOutput: document.querySelector("#best-move-bonus"),
  bestMoveInputs: document.querySelectorAll(".best-move-input"),
  onChange: handleNightChange,
});

timer = new TimerController({
  output: document.querySelector("#timer"),
  panel: document.querySelector(".timer-panel"),
  stateText: document.querySelector("#timer-state-text"),
  resetButton: document.querySelector("#reset-timer"),
  onChange: persistCurrentGame,
});

const leaderboard = new LeaderboardView({
  body: document.querySelector("#leaderboard-body"),
  empty: document.querySelector("#leaderboard-empty"),
  count: document.querySelector("#leaderboard-count"),
  fromInput: document.querySelector("#leaderboard-from"),
  toInput: document.querySelector("#leaderboard-to"),
  resetButton: document.querySelector("#reset-leaderboard-filter"),
  filterStatus: document.querySelector("#leaderboard-filter-status"),
});

function refreshSavedViews() {
  savedGames.sort(compareGamesChronologically);
  history.render(savedGames);
  leaderboard.setGames(savedGames);
}

function applySavedGamesChange(change) {
  if (change.type === "delete") {
    const index = savedGames.findIndex((game) => getGameId(game) === change.gameId);
    if (index !== -1) savedGames.splice(index, 1);
  }

  if (change.type === "replace") {
    const index = savedGames.findIndex((game) => getGameId(game) === change.oldGameId);
    if (index !== -1) savedGames[index] = change.game;
  }
  refreshSavedViews();
}

async function recoverCurrentGameFirstKilledMarker() {
  const playerState = players.getState();
  if (validateGame(playerState, currentWinner)) return false;

  const currentSnapshot = buildGameSnapshot(playerState, currentWinner, {
    bestMove: night.getState().bestMove,
  });
  const savedIndex = savedGames.findIndex((game) => (
    getGameId(game) === getGameId(currentSnapshot)
  ));
  if (savedIndex === -1) return false;

  const recoveredGame = recoverFirstKilledMarker(savedGames[savedIndex], currentSnapshot);
  if (!recoveredGame) return false;
  savedGames[savedIndex] = await repository.replace(
    savedGames[savedIndex].gameId,
    recoveredGame,
  );
  return true;
}

const history = new HistoryView({
  repository,
  elements: {
    list: document.querySelector("#history-list"),
    empty: document.querySelector("#history-empty"),
    count: document.querySelector("#history-count"),
    dialog: document.querySelector("#edit-game-dialog"),
    form: document.querySelector("#edit-game-form"),
    date: document.querySelector("#edit-game-date"),
    time: document.querySelector("#edit-game-time"),
    winner: document.querySelector("#edit-game-winner"),
    bestMove: document.querySelector("#edit-game-best-move"),
    body: document.querySelector("#edit-game-body"),
    error: document.querySelector("#edit-game-error"),
    cancelButton: document.querySelector("#cancel-edit-game"),
  },
  getGames: () => savedGames,
  onGamesChanged: applySavedGamesChange,
  setStatus: (message, isError) => setStatus(historyStatus, message, isError),
});

function selectWinner(winner, shouldPersist = true) {
  currentWinner = winner === "red" || winner === "black" ? winner : null;
  winnerButtons.forEach((button) => {
    const selected = button.dataset.winner === currentWinner;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  setStatus(saveStatus, "");
  players.setWinner(currentWinner);
  if (shouldPersist) persistCurrentGame();
}

winnerButtons.forEach((button) => {
  button.addEventListener("click", () => selectWinner(button.dataset.winner));
});

newGameButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Начать новую игру? Роли, фолы, техфолы, допы, заметки, таймер, ночи и голосования будут сброшены. Ники останутся на своих местах.",
  );
  if (!confirmed) return;

  selectWinner(null, false);
  players.resetGameState();
  voting.reset();
  timer.reset();
  night.reset();
  setStatus(saveStatus, "Новая игра начата — рассадка сохранена");
  persistCurrentGame();
});

saveGameButton.addEventListener("click", async () => {
  const playerState = players.getState();
  const validationError = validateGame(playerState, currentWinner);
  if (validationError) {
    setStatus(saveStatus, validationError, true);
    return;
  }

  const game = buildGameSnapshot(playerState, currentWinner, {
    bestMove: night.getState().bestMove,
  });
  if (savedGames.some((savedGame) => getGameId(savedGame) === game.gameId)) {
    setStatus(saveStatus, `Эта игра уже сохранена — ID ${game.gameId}`, true);
    return;
  }

  saveGameButton.disabled = true;
  setStatus(saveStatus, "Сохраняю игру…");
  try {
    const storedGame = await repository.add(game);
    savedGames.push(storedGame);
    refreshSavedViews();
    setStatus(saveStatus, `Игра сохранена в SQLite — ID ${storedGame.gameId}`);
  } catch (error) {
    setStatus(saveStatus, `Не удалось сохранить игру: ${error.message}`, true);
  } finally {
    saveGameButton.disabled = false;
  }
});

new SpaRouter({
  links: document.querySelectorAll("[data-route-link]"),
  views: document.querySelectorAll("[data-view]"),
  onRouteChange: (route) => timer.setKeyboardEnabled(route === "game"),
});

const storedCurrentGame = currentGameStore.load();
players.restore(storedCurrentGame?.players);
voting.restore(storedCurrentGame?.votingRounds, storedCurrentGame?.currentRoundIndex);
night.restore(storedCurrentGame?.night);
syncFirstKilledAndBestMoveBonus();
voting.setNightKills(night.getNightKills());
selectWinner(storedCurrentGame?.winner, false);
timer.restore(storedCurrentGame?.timer);
initialized = true;

try {
  const games = await repository.initialize();
  savedGames.splice(0, savedGames.length, ...games);
  let recoveredFirstKilled = false;
  try {
    recoveredFirstKilled = await recoverCurrentGameFirstKilledMarker();
  } catch (recoveryError) {
    setStatus(historyStatus, `Не удалось восстановить ПУ: ${recoveryError.message}`, true);
  }
  refreshSavedViews();
  storageIndicator.classList.add("is-online");
  storageIndicator.title = "SQLite подключена";
  if (recoveredFirstKilled) {
    setStatus(historyStatus, "ПУ восстановлен из текущей игры");
  }
} catch (error) {
  storageIndicator.classList.add("is-error");
  storageIndicator.title = "SQLite недоступна";
  setStatus(saveStatus, `Не удалось открыть SQLite: ${error.message}`, true);
  setStatus(historyStatus, `Не удалось открыть SQLite: ${error.message}`, true);
}

window.addEventListener("pagehide", persistCurrentGame);
