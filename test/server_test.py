import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.database import DuplicateGameError, GamesDatabase, ValidationError


def sample_game(game_id="mf-test-game"):
    roles = ["Мирный"] * 6 + ["Шериф", "Мафия", "Мафия", "Дон"]
    players = []
    for index, role in enumerate(roles, start=1):
        base = 0 if role in {"Мафия", "Дон"} else 1
        players.append({
            "number": index,
            "name": f"Игрок {index}",
            "role": role,
            "base": base,
            "extra": 0,
            "lh": 0.5 if index == 1 else 0,
            "ci": 0.25 if index == 1 else 0,
            "total": base + (0.75 if index == 1 else 0),
            "isFirstKilled": index == 1,
        })
    return {
        "gameId": game_id,
        "id": "2026-08-13T00:00:00.000Z",
        "date": "13.08.2026",
        "time": "07:00:00",
        "winner": "red",
        "winnerLabel": "Красные",
        "players": players,
    }


class GamesDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.database = GamesDatabase(Path(self.temp_dir.name) / "test.sqlite3")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_crud_and_duplicate_protection(self):
        original = self.database.add_game(sample_game())
        self.assertEqual(len(self.database.list_games()), 1)
        stored_player = self.database.list_games()[0]["players"][0]
        self.assertTrue(stored_player["isFirstKilled"])
        self.assertEqual(stored_player["lh"], 0.5)
        self.assertEqual(stored_player["ci"], 0.25)
        with self.assertRaises(DuplicateGameError):
            self.database.add_game(sample_game())

        updated = sample_game("mf-updated-game")
        updated["date"] = "14.08.2026"
        self.database.replace_game(original["gameId"], updated)
        self.assertEqual(self.database.list_games()[0]["date"], "14.08.2026")
        self.assertTrue(self.database.delete_game("mf-updated-game"))
        self.assertEqual(self.database.list_games(), [])

    def test_total_is_validated(self):
        invalid = sample_game()
        invalid["players"][0]["total"] = 99
        with self.assertRaises(ValidationError):
            self.database.add_game(invalid)

    def test_impossible_date_is_rejected(self):
        invalid = sample_game()
        invalid["date"] = "31.02.2026"
        with self.assertRaises(ValidationError):
            self.database.add_game(invalid)

    def test_failed_replace_rolls_back_original_game(self):
        self.database.add_game(sample_game("mf-original"))
        self.database.add_game(sample_game("mf-existing"))
        with self.assertRaises(DuplicateGameError):
            self.database.replace_game("mf-original", sample_game("mf-existing"))
        ids = {game["gameId"] for game in self.database.list_games()}
        self.assertEqual(ids, {"mf-original", "mf-existing"})

    def test_schema_version_is_recorded(self):
        with self.database.connect() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
        self.assertEqual(version, 3)

    def test_schema_version_one_is_migrated_without_losing_players(self):
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite3"
        with sqlite3.connect(legacy_path) as connection:
            connection.executescript(
                """
                CREATE TABLE games (
                    game_id TEXT PRIMARY KEY,
                    record_id TEXT NOT NULL,
                    game_date TEXT NOT NULL,
                    game_time TEXT NOT NULL,
                    winner TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE players (
                    game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                    player_number INTEGER NOT NULL,
                    nickname TEXT NOT NULL,
                    role TEXT NOT NULL,
                    base_score REAL NOT NULL,
                    extra_score REAL NOT NULL,
                    total_score REAL NOT NULL,
                    PRIMARY KEY (game_id, player_number)
                );
                INSERT INTO games (game_id, record_id, game_date, game_time, winner)
                VALUES ('mf-legacy', '2026-08-13T00:00:00Z', '13.08.2026', '07:00:00', 'red');
                INSERT INTO players (
                    game_id, player_number, nickname, role, base_score, extra_score, total_score
                ) VALUES ('mf-legacy', 1, 'Игрок 1', 'Мирный', 1, 0, 1);
                PRAGMA user_version = 1;
                """
            )

        migrated = GamesDatabase(legacy_path)
        with migrated.connect() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            first_killed = connection.execute(
                "SELECT is_first_killed FROM players WHERE game_id = 'mf-legacy'"
            ).fetchone()[0]
        self.assertEqual(version, 3)
        self.assertEqual(first_killed, 0)
        with migrated.connect() as connection:
            breakdown = connection.execute(
                "SELECT lh_score, ci_score, total_score FROM players WHERE game_id = 'mf-legacy'"
            ).fetchone()
        self.assertEqual(tuple(breakdown), (0, 0, 1))

    def test_schema_version_two_adds_score_components_without_changing_total(self):
        legacy_path = Path(self.temp_dir.name) / "schema-two.sqlite3"
        with sqlite3.connect(legacy_path) as connection:
            connection.executescript(
                """
                CREATE TABLE games (
                    game_id TEXT PRIMARY KEY,
                    record_id TEXT NOT NULL,
                    game_date TEXT NOT NULL,
                    game_time TEXT NOT NULL,
                    winner TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE players (
                    game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
                    player_number INTEGER NOT NULL,
                    nickname TEXT NOT NULL,
                    role TEXT NOT NULL,
                    base_score REAL NOT NULL,
                    extra_score REAL NOT NULL,
                    total_score REAL NOT NULL,
                    is_first_killed INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (game_id, player_number)
                );
                INSERT INTO games (game_id, record_id, game_date, game_time, winner)
                VALUES ('mf-v2', '2026-08-13T00:00:00Z', '13.08.2026', '07:00:00', 'red');
                INSERT INTO players (
                    game_id, player_number, nickname, role, base_score, extra_score,
                    total_score, is_first_killed
                ) VALUES ('mf-v2', 1, 'Игрок 1', 'Мирный', 1, 0.5, 1.5, 1);
                PRAGMA user_version = 2;
                """
            )

        migrated = GamesDatabase(legacy_path)
        with migrated.connect() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            player = connection.execute(
                """
                SELECT extra_score, lh_score, ci_score, total_score
                FROM players WHERE game_id = 'mf-v2'
                """
            ).fetchone()
        self.assertEqual(version, 3)
        self.assertEqual(tuple(player), (0.5, 0, 0, 1.5))

    def test_only_one_first_killed_player_is_allowed(self):
        invalid = sample_game()
        invalid["players"][1]["isFirstKilled"] = True
        with self.assertRaises(ValidationError):
            self.database.add_game(invalid)

    def test_legacy_payload_without_first_killed_flag_stays_compatible(self):
        legacy = sample_game("mf-legacy-payload")
        for player in legacy["players"]:
            player.pop("isFirstKilled")
            player.pop("lh")
            player.pop("ci")
            player["total"] = player["base"] + player["extra"]
        self.database.add_game(legacy)
        players = self.database.list_games()[0]["players"]
        self.assertFalse(any(player["isFirstKilled"] for player in players))
        self.assertTrue(all(player["lh"] == 0 and player["ci"] == 0 for player in players))


if __name__ == "__main__":
    unittest.main()
