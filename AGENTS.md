# AGENTS.md

## Project

Mafia Host is a local Russian-language tool for a sports-mafia host. It runs in a browser, uses only native HTML/CSS/JavaScript on the client, and stores completed games in a local SQLite database through a small Python standard-library server.

The interface is intentionally dense and practical. Preserve the dark neutral theme, large timer, ten-player table, large fault targets, and fast keyboard workflow. Do not add decorative dashboards, animation, authentication, cloud services, frameworks, or build tools unless the user explicitly requests them.

## Start and test

- Start: `python3 server.py --no-browser` or double-click `start.command`.
- URL: `http://127.0.0.1:8000`.
- JavaScript tests: `npm test`.
- Python tests: `python3 -m unittest discover -s test -p '*_test.py'`.
- Syntax checks: `node --check app.js`, `python3 -m py_compile server.py`, and `zsh -n start.command`.

Always run the relevant tests after changing behavior. For UI changes, verify all three hash routes and the 10-player table at laptop width when browser tooling is available.

## Architecture

- `index.html`: semantic shell and the three SPA views.
- `styles.css`: shared visual system and responsive layouts.
- `app.js`: composition root only. Do not move feature logic back into this file.
- `js/domain.js`: pure scoring, validation, stable IDs, date filtering, and leaderboard calculations.
- `js/storage.js`: SQLite API repository, current-game browser persistence, and legacy IndexedDB migration.
- `js/timer.js`: timer state and Space keyboard behavior.
- `js/voting.js`: voting rounds and nominations.
- `js/players.js`: the ten editable player rows, faults, roles, scores, and notes.
- `js/history.js`: saved-game cards, deletion, and editing dialog.
- `js/leaderboard.js`: interval filtering and aggregate player table.
- `js/router.js`: hash-based view routing.
- `server.py`: short process entry point only.
- `backend/database.py`: SQLite schema, validation, and transactional CRUD.
- `backend/http.py`: static-file server and JSON API.
- `backend/legacy.py`: one-way import of old CSV exports.
- `legacy-recovery.html` + `legacy-recovery.js`: classic-script `file://` recovery tool for the old file-origin IndexedDB. It must remain usable without ES-module loading.
- `data/mafia-host.sqlite3`: real user data. It is ignored by Git and must never be committed.

Keep modules aligned with these responsibilities. Prefer pure functions in `js/domain.js` for rules that can be tested without a DOM. New views should get their own module and a `data-view` route instead of expanding `app.js`.

## Behavioral invariants

- There are always exactly 10 numbered player positions.
- `Space` resets and starts the timer only on the `Игра` view and never while typing in an input, select, textarea, or editable element.
- The reset timer button resets and stops the timer.
- Each player has 0–4 faults; clicking a filled fault can reduce the count.
- Voting starts at round 0 and can be reset to an empty round 0.
- Roles are selected from `Мирный`, `Шериф`, `Мафия`, and `Дон`.
- Current-game base scores are derived from role team and winning team. Extra scores are entered manually.
- Saved games support create, read, edit, and delete through `/api/games`.
- Duplicate game IDs return HTTP 409 and must not create another record.
- Leaderboard date-time bounds are inclusive; an inverted interval is an error.

## Storage and safety

Completed games live in SQLite. The unfinished current game still lives in browser `localStorage` so rapid input does not generate server traffic. Legacy browser games may be migrated from the current origin by `js/storage.js`. Old `file://` IndexedDB data belongs to a different browser origin and must be recovered through `legacy-recovery.html`; legacy CSV files are imported by `server.py`.

Never delete, overwrite, commit, or recreate `data/mafia-host.sqlite3` during routine development or tests. Tests must use temporary databases. Before changing the SQLite schema, add an explicit migration keyed by `PRAGMA user_version` and test upgrading an existing database.

The HTTP server must bind to loopback by default. Keep the SQLite file inaccessible over HTTP. Do not broaden CORS beyond the `file://` (`Origin: null`) legacy-migration case without a concrete requirement.

## Style

- User-facing copy is Russian.
- Use native browser APIs and standard-library Python.
- Keep controls keyboard-accessible and preserve visible focus states.
- Reuse existing color and typography tokens.
- Avoid global mutable state outside the composition root and controller instances.
- Do not introduce a framework merely to organize code; the ES-module boundaries are the intended extension point.
