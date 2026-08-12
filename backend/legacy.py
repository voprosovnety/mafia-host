from __future__ import annotations

import csv
import re
from datetime import datetime, timezone
from pathlib import Path

from .database import DuplicateGameError, GamesDatabase, ValidationError


def js_number(value: float | int) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else format(number, ".15g")


def js_fnv1a(value: str) -> str:
    hash_value = 2166136261
    encoded = value.encode("utf-16-le")
    for index in range(0, len(encoded), 2):
        code_unit = encoded[index] | (encoded[index + 1] << 8)
        hash_value ^= code_unit
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF

    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    digits = "0" if hash_value == 0 else ""
    while hash_value:
        hash_value, remainder = divmod(hash_value, 36)
        digits = alphabet[remainder] + digits
    return digits.rjust(7, "0")


def legacy_game_from_csv(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            rows = list(csv.DictReader(file, delimiter=";"))
    except (OSError, UnicodeError, csv.Error):
        return None
    if len(rows) != 10:
        return None

    winner_label = str(rows[0].get("Победа", "")).strip()
    winner = "red" if winner_label == "Красные" else "black" if winner_label in {"Черные", "Чёрные"} else ""
    try:
        players = [
            {
                "number": int(row["№"]),
                "name": row["Игрок"].strip(),
                "role": row["Роль"].strip(),
                "base": float(row["Балл"].replace(",", ".")),
                "extra": float(row["Доп."].replace(",", ".")),
                "total": float(row["Сумма"].replace(",", ".")),
            }
            for row in rows
        ]
    except (KeyError, TypeError, ValueError):
        return None

    fingerprint = winner + "|" + "|".join(
        f'{player["number"]}:{player["name"]}:{player["role"]}:'
        f'{js_number(player["base"])}:{js_number(player["extra"])}:{js_number(player["total"])}'
        for player in players
    )
    filename_match = re.search(r"game-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})", path.stem)
    if filename_match:
        record_id = f"{filename_match[1]}T{filename_match[2]}:{filename_match[3]}:{filename_match[4]}.000Z"
    else:
        record_id = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "gameId": f"mf-{js_fnv1a(fingerprint)}",
        "id": record_id,
        "date": rows[0].get("Дата", "").strip(),
        "time": rows[0].get("Время", "").strip(),
        "winner": winner,
        "winnerLabel": winner_label,
        "players": players,
    }


def import_legacy_csv_games(database: GamesDatabase, games_directory: Path) -> int:
    imported = 0
    if not games_directory.is_dir():
        return imported
    for path in sorted(games_directory.glob("game-*.csv")):
        game = legacy_game_from_csv(path)
        if game is None:
            continue
        try:
            database.add_game(game)
            imported += 1
        except (DuplicateGameError, ValidationError):
            pass
    return imported
