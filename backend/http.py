from __future__ import annotations

import json
import sqlite3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from .database import DuplicateGameError, GamesDatabase, ValidationError

API_VERSION = 1


class MafiaRequestHandler(SimpleHTTPRequestHandler):
    server_version = "MafiaHost/1.0"
    project_directory: Path

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(self.project_directory), **kwargs)

    @property
    def database(self) -> GamesDatabase:
        return self.server.database  # type: ignore[attr-defined]

    def end_headers(self) -> None:
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
            if self.headers.get("Origin") == "null":
                self.send_header("Access-Control-Allow-Origin", "null")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, status: HTTPStatus, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> object:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValidationError("Некорректный размер запроса") from error
        if length <= 0 or length > 1_000_000:
            raise ValidationError("Некорректный размер запроса")
        try:
            return json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValidationError("Некорректный JSON") from error

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        route = urlparse(self.path).path
        if route == "/api/health":
            self.send_json(
                HTTPStatus.OK,
                {"ok": True, "storage": "sqlite", "apiVersion": API_VERSION},
            )
            return
        if route == "/api/games":
            try:
                games = self.database.list_games()
            except sqlite3.Error:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Не удалось прочитать SQLite"})
                return
            self.send_json(HTTPStatus.OK, {"games": games})
            return
        if route == "/data" or route.startswith("/data/") or route == "/.git" or route.startswith("/.git/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/games":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Маршрут не найден"})
            return
        self.handle_write(lambda payload: self.database.add_game(payload), HTTPStatus.CREATED)

    def do_PUT(self) -> None:
        route = urlparse(self.path).path
        prefix = "/api/games/"
        if not route.startswith(prefix) or not route[len(prefix):]:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Маршрут не найден"})
            return
        old_game_id = unquote(route[len(prefix):])
        self.handle_write(lambda payload: self.database.replace_game(old_game_id, payload), HTTPStatus.OK)

    def do_DELETE(self) -> None:
        route = urlparse(self.path).path
        prefix = "/api/games/"
        if not route.startswith(prefix) or not route[len(prefix):]:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Маршрут не найден"})
            return
        game_id = unquote(route[len(prefix):])
        try:
            deleted = self.database.delete_game(game_id)
        except sqlite3.Error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Не удалось изменить SQLite"})
            return
        if not deleted:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Игра не найдена"})
            return
        self.send_json(HTTPStatus.OK, {"deleted": game_id})

    def handle_write(self, operation, success_status: HTTPStatus) -> None:
        try:
            result = operation(self.read_json())
        except ValidationError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except DuplicateGameError as error:
            self.send_json(HTTPStatus.CONFLICT, {"error": str(error)})
        except KeyError:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Игра не найдена"})
        except sqlite3.Error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Не удалось изменить SQLite"})
        else:
            self.send_json(success_status, {"game": result})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


class MafiaServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], database: GamesDatabase, project_directory: Path):
        handler = type(
            "ProjectRequestHandler",
            (MafiaRequestHandler,),
            {"project_directory": project_directory},
        )
        super().__init__(address, handler)
        self.database = database
