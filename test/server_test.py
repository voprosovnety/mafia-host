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
            "total": base,
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
        self.assertEqual(version, 1)


if __name__ == "__main__":
    unittest.main()
