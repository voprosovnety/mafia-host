export const PLAYER_COUNT = 10;
export const MAX_FAULTS = 4;
export const ROLE_OPTIONS = ["Мирный", "Шериф", "Мафия", "Дон"];

export function shuffledCopy(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function normalizeRole(role) {
  return String(role).trim().toLowerCase().replaceAll("ё", "е");
}

export function getRoleTeam(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole.includes("маф") || normalizedRole.includes("дон") || normalizedRole.includes("черн")) {
    return "black";
  }

  if (normalizedRole.includes("мир") || normalizedRole.includes("шериф") || normalizedRole.includes("красн")) {
    return "red";
  }

  return null;
}

export function calculateBestMoveBonus(bestMoveNumbers, players) {
  const rolesByNumber = new Map(
    (Array.isArray(players) ? players : [])
      .map((player) => [player.number, player.role]),
  );
  const selectedNumbers = new Set(
    (Array.isArray(bestMoveNumbers) ? bestMoveNumbers : [])
      .filter((number) => Number.isInteger(number) && rolesByNumber.has(number)),
  );
  const blackPlayersCount = [...selectedNumbers]
    .filter((number) => getRoleTeam(rolesByNumber.get(number)) === "black")
    .length;
  if (blackPlayersCount === 3) return 0.8;
  if (blackPlayersCount === 2) return 0.5;
  return 0;
}

export function parseExtraScore(value) {
  const normalizedValue = String(value).trim().replace(",", ".");

  if (normalizedValue === "") {
    return 0;
  }

  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizedValue)) {
    return null;
  }

  const score = Number(normalizedValue);
  return Number.isFinite(score) ? score : null;
}

export function roundScore(score) {
  const rounded = Math.round((score + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatScore(score) {
  return score === null ? "—" : String(roundScore(score));
}

export function calculateScores(role, extraValue, winner, automaticExtra = 0) {
  const team = getRoleTeam(role);
  const base = winner && team ? Number(winner === team) : null;
  const manualExtra = parseExtraScore(extraValue);
  const safeAutomaticExtra = Number.isFinite(Number(automaticExtra)) ? Number(automaticExtra) : 0;
  const extra = manualExtra === null ? null : roundScore(manualExtra + safeAutomaticExtra);
  const total = base === null || extra === null ? null : roundScore(base + extra);
  return { team, base, extra, total };
}

export function winnerLabel(winner) {
  return winner === "red" ? "Красные" : "Чёрные";
}

export function buildGameSnapshot(players, winner, now = new Date()) {
  const game = {
    id: now.toISOString(),
    date: now.toLocaleDateString("ru-RU"),
    time: now.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    winner,
    winnerLabel: winnerLabel(winner),
    players: players.map((player) => {
      const bestMoveBonus = player.isFirstKilled ? player.bestMoveBonus : 0;
      const scores = calculateScores(player.role, player.extra, winner, bestMoveBonus);
      return {
        number: player.number,
        name: player.name.trim() || `Игрок ${player.number}`,
        role: player.role.trim(),
        base: scores.base,
        extra: scores.extra,
        total: scores.total,
        isFirstKilled: player.isFirstKilled === true,
      };
    }),
  };

  game.gameId = getGameId(game);
  return game;
}

export function validateGame(players, winner) {
  if (!winner) {
    return "Выберите победителя: красные или чёрные";
  }

  const unknownRoles = players
    .filter((player) => getRoleTeam(player.role) === null)
    .map((player) => player.number);
  if (unknownRoles.length > 0) {
    return `Укажите роль игроков: ${unknownRoles.join(", ")}`;
  }

  const invalidExtras = players
    .filter((player) => parseExtraScore(player.extra) === null)
    .map((player) => player.number);
  if (invalidExtras.length > 0) {
    return `Проверьте доп. балл игроков: ${invalidExtras.join(", ")}`;
  }

  return null;
}

export function isStoredGame(value) {
  return value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    Array.isArray(value.players);
}

function gameContentFingerprint(game) {
  const players = game.players
    .map((player) => `${player.number}:${player.name}:${player.role}:${player.base}:${player.extra}:${player.total}`)
    .join("|");
  return `${game.winner}|${players}`;
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function getGameId(game) {
  return game.gameId || `mf-${hashString(gameContentFingerprint(game))}`;
}

export function recoverFirstKilledMarker(archivedGame, currentGame) {
  if (
    !archivedGame ||
    !currentGame ||
    !Array.isArray(archivedGame.players) ||
    !Array.isArray(currentGame.players) ||
    getGameId(archivedGame) !== getGameId(currentGame) ||
    archivedGame.players.some((player) => player.isFirstKilled === true)
  ) return null;

  const firstKilledPlayers = currentGame.players
    .filter((player) => player.isFirstKilled === true);
  if (firstKilledPlayers.length !== 1) return null;

  const firstKilledNumber = firstKilledPlayers[0].number;
  if (!archivedGame.players.some((player) => player.number === firstKilledNumber)) return null;
  return {
    ...archivedGame,
    players: archivedGame.players.map((player) => ({
      ...player,
      isFirstKilled: player.number === firstKilledNumber,
    })),
  };
}

export function dateToInputValue(date) {
  const match = String(date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

export function dateFromInputValue(date) {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

export function gameTimestamp(game) {
  const dateMatch = String(game.date).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const timeMatch = String(game.time).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!dateMatch || !timeMatch) {
    return Number.NaN;
  }

  return new Date(
    Number(dateMatch[3]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[1]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] || 0),
  ).getTime();
}

export function compareGamesChronologically(first, second) {
  const firstTimestamp = gameTimestamp(first);
  const secondTimestamp = gameTimestamp(second);
  if (Number.isFinite(firstTimestamp) && Number.isFinite(secondTimestamp) && firstTimestamp !== secondTimestamp) {
    return firstTimestamp - secondTimestamp;
  }
  return String(first.id).localeCompare(String(second.id));
}

export function dateTimeInputTimestamp(value) {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function filterGamesByInterval(games, fromValue, toValue) {
  const from = dateTimeInputTimestamp(fromValue);
  const to = dateTimeInputTimestamp(toValue);
  if (Number.isNaN(from) || Number.isNaN(to) || (from !== null && to !== null && from > to)) {
    return { games: [], invalid: true };
  }

  return {
    games: games.filter((game) => {
      const timestamp = gameTimestamp(game);
      return Number.isFinite(timestamp) &&
        (from === null || timestamp >= from) &&
        (to === null || timestamp <= to);
    }),
    invalid: false,
  };
}

export function gamesCountLabel(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} игр`;
  if (lastDigit === 1) return `${count} игра`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} игры`;
  return `${count} игр`;
}

export function playersCountLabel(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} игроков`;
  if (lastDigit === 1) return `${count} игрок`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} игрока`;
  return `${count} игроков`;
}

function normalizeLeaderboardName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function buildLeaderboard(games) {
  const players = new Map();

  games.forEach((game) => {
    game.players.forEach((player) => {
      const name = String(player.name).trim();
      const key = normalizeLeaderboardName(name);
      if (!key) return;

      if (!players.has(key)) {
        players.set(key, {
          name,
          totalScore: 0,
          netExtra: 0,
          bonuses: 0,
          penalties: 0,
          gamesPlayed: 0,
        });
      }

      const stats = players.get(key);
      const extra = Number(player.extra);
      const total = Number(player.total);
      const safeExtra = Number.isFinite(extra) ? extra : 0;
      const safeTotal = Number.isFinite(total) ? total : 0;
      stats.totalScore += safeTotal;
      stats.netExtra += safeExtra;
      stats.bonuses += Math.max(0, safeExtra);
      stats.penalties += Math.min(0, safeExtra);
      stats.gamesPlayed += 1;
    });
  });

  return [...players.values()]
    .map((stats) => ({
      ...stats,
      totalScore: roundScore(stats.totalScore),
      netExtra: roundScore(stats.netExtra),
      bonuses: roundScore(stats.bonuses),
      penalties: roundScore(stats.penalties),
      average: roundScore(stats.totalScore / stats.gamesPlayed),
    }))
    .sort((first, second) => (
      second.totalScore - first.totalScore ||
      second.average - first.average ||
      second.netExtra - first.netExtra ||
      first.name.localeCompare(second.name, "ru")
    ));
}
