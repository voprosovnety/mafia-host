import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen

from backend.database import GamesDatabase
from backend.http import API_VERSION, MafiaServer


class MafiaHttpTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database = GamesDatabase(Path(self.temp_dir.name) / "test.sqlite3")
        self.server = MafiaServer(("127.0.0.1", 0), database, Path.cwd())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp_dir.cleanup()

    def test_health_exposes_api_version(self):
        port = self.server.server_address[1]
        with urlopen(f"http://127.0.0.1:{port}/api/health") as response:
            payload = json.load(response)
        self.assertEqual(payload, {
            "ok": True,
            "storage": "sqlite",
            "apiVersion": API_VERSION,
        })


if __name__ == "__main__":
    unittest.main()
