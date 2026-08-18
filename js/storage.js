import { getGameId, isStoredGame } from "./domain.js";

const LEGACY_GAMES_STORAGE_KEY = "mafia-host-games-v1";
const CURRENT_GAME_STORAGE_KEY = "mafia-host-current-game-v1";
const LEGACY_DATABASE_NAME = "mafia-host";
const LEGACY_DATABASE_VERSION = 1;
const LEGACY_STORE_NAME = "games";
const REQUIRED_API_VERSION = 1;

function apiBase() {
  return window.location.protocol === "file:"
    ? "http://127.0.0.1:8000/api"
    : "/api";
}

async function requestApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("SQLite-сервер не запущен. Откройте сайт через start.command");
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The response status below still identifies the failure.
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Ошибка сервера: ${response.status}`);
    error.name = response.status === 409 ? "ConstraintError" : "DatabaseError";
    throw error;
  }
  return payload;
}

function requestGamesApi(path = "", options = {}) {
  return requestApi(`/games${path}`, options);
}

export function assertCompatibleServer(health) {
  const apiVersion = Number(health?.apiVersion);
  if (Number.isInteger(apiVersion) && apiVersion >= REQUIRED_API_VERSION) return;
  throw new Error(
    "Сервер приложения устарел. Закройте его окно и снова запустите start.command",
  );
}

function loadLegacyLocalStorageGames() {
  try {
    const storedGames = JSON.parse(localStorage.getItem(LEGACY_GAMES_STORAGE_KEY) || "[]");
    return Array.isArray(storedGames) ? storedGames : [];
  } catch {
    return [];
  }
}

function openLegacyDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME, LEGACY_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        database.createObjectStore(LEGACY_STORE_NAME, { keyPath: "gameId" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readLegacyIndexedDatabaseGames() {
  const database = await openLegacyDatabase();
  if (!database) return [];

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LEGACY_STORE_NAME, "readonly");
    const request = transaction.objectStore(LEGACY_STORE_NAME).getAll();
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

export class GamesRepository {
  async list() {
    const payload = await requestGamesApi();
    return Array.isArray(payload.games) ? payload.games : [];
  }

  async add(game) {
    const payload = await requestGamesApi("", {
      method: "POST",
      body: JSON.stringify(game),
    });
    return payload.game;
  }

  async delete(gameId) {
    await requestGamesApi(`/${encodeURIComponent(gameId)}`, { method: "DELETE" });
  }

  async replace(oldGameId, game) {
    const payload = await requestGamesApi(`/${encodeURIComponent(oldGameId)}`, {
      method: "PUT",
      body: JSON.stringify(game),
    });
    return payload.game;
  }

  async migrateBrowserGames() {
    let indexedGames = [];
    try {
      indexedGames = await readLegacyIndexedDatabaseGames();
    } catch {
      // SQLite remains usable if the obsolete browser database is unavailable.
    }

    const candidates = [...loadLegacyLocalStorageGames(), ...indexedGames];
    const attemptedIds = new Set();
    let imported = 0;

    for (const game of candidates) {
      if (!isStoredGame(game)) continue;
      game.gameId = getGameId(game);
      if (attemptedIds.has(game.gameId)) continue;
      attemptedIds.add(game.gameId);

      try {
        await this.add(game);
        imported += 1;
      } catch (error) {
        if (error?.name !== "ConstraintError") throw error;
      }
    }
    return imported;
  }

  async initialize() {
    const health = await requestApi("/health");
    assertCompatibleServer(health);
    await this.migrateBrowserGames();
    return this.list();
  }
}

export class CurrentGameStore {
  load() {
    try {
      const storedGame = JSON.parse(localStorage.getItem(CURRENT_GAME_STORAGE_KEY) || "null");
      return storedGame && typeof storedGame === "object" ? storedGame : null;
    } catch {
      return null;
    }
  }

  save(game) {
    try {
      localStorage.setItem(CURRENT_GAME_STORAGE_KEY, JSON.stringify(game));
    } catch {
      // A live game remains usable when browser storage is disabled.
    }
  }
}
