from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path


ALLOWED_ROLES = {"Мирный", "Шериф", "Мафия", "Дон"}
MAX_TECHNICAL_FAULTS = 1
TECHNICAL_FAULT_PENALTY = -0.3
SCHEMA_VERSION = 4


class ValidationError(ValueError):
    pass


class DuplicateGameError(ValueError):
    pass


def score_number(value: object, field: str) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"Поле «{field}» должно быть числом")
    number = float(value)
    if not (-1000 < number < 1000):
        raise ValidationError(f"Некорректное значение поля «{field}»")
    return int(number) if number.is_integer() else round(number, 2)


def normalize_best_move(value: object) -> list[int | None]:
    if value is None:
        return [None, None, None]
    if not isinstance(value, list) or len(value) > 3:
        raise ValidationError("ЛХ должен содержать не более трёх номеров")

    normalized: list[int | None] = []
    for number in value:
        if number is None:
            normalized.append(None)
        elif isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= 10:
            raise ValidationError("Номер игрока в ЛХ должен быть от 1 до 10")
        else:
            normalized.append(number)
    return (normalized + [None, None, None])[:3]


def normalize_game(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValidationError("Ожидались данные игры")

    game_id = str(value.get("gameId", "")).strip()
    record_id = str(value.get("id", "")).strip()
    game_date = str(value.get("date", "")).strip()
    game_time = str(value.get("time", "")).strip()
    winner = str(value.get("winner", "")).strip()
    best_move = normalize_best_move(value.get("bestMove"))
    players = value.get("players")

    if not re.fullmatch(r"[a-zA-Z0-9_-]{3,100}", game_id):
        raise ValidationError("Некорректный ID игры")
    if not record_id or len(record_id) > 100:
        raise ValidationError("Некорректная дата создания игры")
    try:
        datetime.fromisoformat(record_id.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError("Некорректная дата создания игры") from error
    if not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", game_date):
        raise ValidationError("Дата должна быть в формате ДД.ММ.ГГГГ")
    if not re.fullmatch(r"\d{2}:\d{2}(?::\d{2})?", game_time):
        raise ValidationError("Время должно быть в формате ЧЧ:ММ:СС")
    try:
        datetime.strptime(
            f"{game_date} {game_time}",
            "%d.%m.%Y %H:%M:%S" if len(game_time) == 8 else "%d.%m.%Y %H:%M",
        )
    except ValueError as error:
        raise ValidationError("Дата или время не существуют") from error
    if winner not in {"red", "black"}:
        raise ValidationError("Победитель должен быть красным или чёрным")
    if not isinstance(players, list) or len(players) != 10:
        raise ValidationError("В игре должно быть ровно 10 игроков")

    normalized_players = []
    seen_numbers = set()
    first_killed_count = 0
    for player in players:
        if not isinstance(player, dict):
            raise ValidationError("Некорректные данные игрока")

        number = player.get("number")
        name = str(player.get("name", "")).strip()
        role = str(player.get("role", "")).strip()
        base = score_number(player.get("base"), "Балл")
        extra = score_number(player.get("extra"), "Доп.")
        lh = score_number(player.get("lh", 0), "ЛХ")
        ci = score_number(player.get("ci", 0), "CI")
        technical_fouls = player.get("technicalFouls", 0)
        total = score_number(player.get("total"), "Сумма")
        notes = player.get("notes", "")
        is_first_killed = player.get("isFirstKilled", False)

        if isinstance(number, bool) or not isinstance(number, int) or not 1 <= number <= 10:
            raise ValidationError("Номер игрока должен быть от 1 до 10")
        if number in seen_numbers:
            raise ValidationError("Номера игроков не должны повторяться")
        if not name or len(name) > 200:
            raise ValidationError(f"Некорректный никнейм игрока {number}")
        if role not in ALLOWED_ROLES:
            raise ValidationError(f"Некорректная роль игрока {number}")
        if base not in {0, 1}:
            raise ValidationError(f"Балл игрока {number} должен быть 0 или 1")
        if (
            isinstance(technical_fouls, bool)
            or not isinstance(technical_fouls, int)
            or not 0 <= technical_fouls <= MAX_TECHNICAL_FAULTS
        ):
            raise ValidationError(f"У игрока {number} может быть только один техфол")
        if not isinstance(notes, str) or len(notes) > 10000:
            raise ValidationError(f"Некорректные заметки игрока {number}")
        technical_penalty = round(technical_fouls * TECHNICAL_FAULT_PENALTY, 2)
        expected_total = round(
            float(base) + float(extra) + float(lh) + float(ci) + technical_penalty,
            2,
        )
        if expected_total != round(float(total), 2):
            raise ValidationError(f"Неверная сумма баллов игрока {number}")
        if not isinstance(is_first_killed, bool):
            raise ValidationError(f"Некорректная отметка ПУ игрока {number}")

        seen_numbers.add(number)
        first_killed_count += int(is_first_killed)
        normalized_players.append({
            "number": number,
            "name": name,
            "role": role,
            "base": base,
            "extra": extra,
            "lh": lh,
            "ci": ci,
            "technicalFouls": technical_fouls,
            "total": total,
            "notes": notes,
            "isFirstKilled": is_first_killed,
        })

    if seen_numbers != set(range(1, 11)):
        raise ValidationError("В игре должны быть номера игроков от 1 до 10")
    if first_killed_count > 1:
        raise ValidationError("В игре может быть только один первый убиенный")

    normalized_players.sort(key=lambda player: player["number"])
    return {
        "gameId": game_id,
        "id": record_id,
        "date": game_date,
        "time": game_time,
        "winner": winner,
        "winnerLabel": "Красные" if winner == "red" else "Чёрные",
        "bestMove": best_move,
        "players": normalized_players,
    }


class GamesDatabase:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def initialize(self) -> None:
        with self.connect() as connection:
            schema_version = connection.execute("PRAGMA user_version").fetchone()[0]
            if schema_version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"База создана более новой версией приложения (схема {schema_version})"
                )
            connection.executescript(
                """
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS games (
                    game_id TEXT PRIMARY KEY,
                    record_id TEXT NOT NULL,
                    game_date TEXT NOT NULL,
                    game_time TEXT NOT NULL,
                    winner TEXT NOT NULL CHECK (winner IN ('red', 'black')),
                    best_move_1 INTEGER CHECK (best_move_1 BETWEEN 1 AND 10),
                    best_move_2 INTEGER CHECK (best_move_2 BETWEEN 1 AND 10),
                    best_move_3 INTEGER CHECK (best_move_3 BETWEEN 1 AND 10),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS players (
                    game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                    player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 10),
                    nickname TEXT NOT NULL,
                    role TEXT NOT NULL,
                    base_score REAL NOT NULL CHECK (base_score IN (0, 1)),
                    extra_score REAL NOT NULL,
                    lh_score REAL NOT NULL DEFAULT 0,
                    ci_score REAL NOT NULL DEFAULT 0,
                    technical_fouls INTEGER NOT NULL DEFAULT 0
                        CHECK (technical_fouls BETWEEN 0 AND 2),
                    total_score REAL NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    is_first_killed INTEGER NOT NULL DEFAULT 0 CHECK (is_first_killed IN (0, 1)),
                    PRIMARY KEY (game_id, player_number)
                );

                CREATE INDEX IF NOT EXISTS games_record_id_index ON games(record_id);
                CREATE INDEX IF NOT EXISTS players_nickname_index ON players(nickname COLLATE NOCASE);
                """
            )
            player_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(players)").fetchall()
            }
            game_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(games)").fetchall()
            }
            if schema_version < 2 and "is_first_killed" not in player_columns:
                connection.execute(
                    """
                    ALTER TABLE players ADD COLUMN is_first_killed INTEGER NOT NULL DEFAULT 0
                    CHECK (is_first_killed IN (0, 1))
                    """
                )
            if schema_version < 3 and "lh_score" not in player_columns:
                connection.execute(
                    "ALTER TABLE players ADD COLUMN lh_score REAL NOT NULL DEFAULT 0"
                )
            if schema_version < 3 and "ci_score" not in player_columns:
                connection.execute(
                    "ALTER TABLE players ADD COLUMN ci_score REAL NOT NULL DEFAULT 0"
                )
            if schema_version < 4 and "technical_fouls" not in player_columns:
                connection.execute(
                    """
                    ALTER TABLE players ADD COLUMN technical_fouls INTEGER NOT NULL DEFAULT 0
                    CHECK (technical_fouls BETWEEN 0 AND 2)
                    """
                )
            if schema_version < 4 and "notes" not in player_columns:
                connection.execute(
                    "ALTER TABLE players ADD COLUMN notes TEXT NOT NULL DEFAULT ''"
                )
            for column in ("best_move_1", "best_move_2", "best_move_3"):
                if schema_version < 4 and column not in game_columns:
                    connection.execute(
                        f"""
                        ALTER TABLE games ADD COLUMN {column} INTEGER
                        CHECK ({column} BETWEEN 1 AND 10)
                        """
                    )
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    @staticmethod
    def insert_rows(connection: sqlite3.Connection, game: dict) -> None:
        connection.execute(
            """
            INSERT INTO games (
                game_id, record_id, game_date, game_time, winner,
                best_move_1, best_move_2, best_move_3
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                game["gameId"], game["id"], game["date"], game["time"], game["winner"],
                *game["bestMove"],
            ),
        )
        connection.executemany(
            """
            INSERT INTO players (
                game_id, player_number, nickname, role, base_score, extra_score, lh_score,
                ci_score, technical_fouls, total_score, notes, is_first_killed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    game["gameId"], player["number"], player["name"], player["role"],
                    player["base"], player["extra"], player["lh"], player["ci"],
                    player["technicalFouls"], player["total"], player["notes"],
                    player["isFirstKilled"],
                )
                for player in game["players"]
            ],
        )

    def list_games(self) -> list[dict]:
        with self.connect() as connection:
            game_rows = connection.execute(
                """
                SELECT game_id, record_id, game_date, game_time, winner,
                       best_move_1, best_move_2, best_move_3
                FROM games ORDER BY record_id
                """
            ).fetchall()
            player_rows = connection.execute(
                """
                SELECT game_id, player_number, nickname, role, base_score, extra_score, lh_score,
                       ci_score, technical_fouls, total_score, notes, is_first_killed
                FROM players ORDER BY game_id, player_number
                """
            ).fetchall()

        players_by_game: dict[str, list[dict]] = {}
        for row in player_rows:
            players_by_game.setdefault(row["game_id"], []).append({
                "number": row["player_number"],
                "name": row["nickname"],
                "role": row["role"],
                "base": row["base_score"],
                "extra": row["extra_score"],
                "lh": row["lh_score"],
                "ci": row["ci_score"],
                "technicalFouls": row["technical_fouls"],
                "total": row["total_score"],
                "notes": row["notes"],
                "isFirstKilled": bool(row["is_first_killed"]),
            })

        return [
            {
                "gameId": row["game_id"],
                "id": row["record_id"],
                "date": row["game_date"],
                "time": row["game_time"],
                "winner": row["winner"],
                "winnerLabel": "Красные" if row["winner"] == "red" else "Чёрные",
                "bestMove": [row["best_move_1"], row["best_move_2"], row["best_move_3"]],
                "players": players_by_game.get(row["game_id"], []),
            }
            for row in game_rows
        ]

    def add_game(self, value: object) -> dict:
        game = normalize_game(value)
        try:
            with self.connect() as connection:
                self.insert_rows(connection, game)
        except sqlite3.IntegrityError as error:
            raise DuplicateGameError("Такая игра уже сохранена") from error
        return game

    def replace_game(self, old_game_id: str, value: object) -> dict:
        game = normalize_game(value)
        try:
            with self.connect() as connection:
                exists = connection.execute(
                    "SELECT 1 FROM games WHERE game_id = ?", (old_game_id,)
                ).fetchone()
                if not exists:
                    raise KeyError(old_game_id)
                connection.execute("DELETE FROM games WHERE game_id = ?", (old_game_id,))
                self.insert_rows(connection, game)
        except sqlite3.IntegrityError as error:
            raise DuplicateGameError("Такая игра уже сохранена") from error
        return game

    def delete_game(self, game_id: str) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM games WHERE game_id = ?", (game_id,))
        return cursor.rowcount > 0
