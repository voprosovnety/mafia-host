#!/usr/bin/env python3
"""Start the local Mafia Host web application."""

from __future__ import annotations

import argparse
import threading
import webbrowser
from pathlib import Path

from backend.database import GamesDatabase
from backend.http import MafiaServer
from backend.legacy import import_legacy_csv_games


PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE_PATH = PROJECT_DIR / "data" / "mafia-host.sqlite3"
LEGACY_GAMES_DIR = PROJECT_DIR / "games"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Локальный сервер Mafia Host")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE_PATH)
    parser.add_argument("--no-browser", action="store_true")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    database = GamesDatabase(arguments.database.resolve())
    imported = import_legacy_csv_games(database, LEGACY_GAMES_DIR)
    server = MafiaServer((arguments.host, arguments.port), database, PROJECT_DIR)
    url = f"http://{arguments.host}:{arguments.port}"

    print(f"Mafia Host запущен: {url}")
    print(f"База данных: {database.path}")
    if imported:
        print(f"Перенесено старых CSV-игр: {imported}")
    print("Для остановки нажмите Ctrl+C")

    if not arguments.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
