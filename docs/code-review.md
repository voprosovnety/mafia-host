# Code review — 2026-08-13

## Scope

Reviewed the browser application, SQLite persistence, HTTP boundary, data validation, testability, and extension path for additional screens.

## Resolved findings

1. **The 1,300-line client entry point mixed unrelated responsibilities.** The client is now split into domain, storage, timer, voting, players, history, leaderboard, and router modules. `app.js` is only the composition root.
2. **History and leaderboard were coupled to the live-game layout.** They are now independent hash-routed views. A future standalone page can reuse the same view and domain modules.
3. **Leaderboard calculations had no time scope.** Inclusive date-time interval filtering is implemented as a pure tested function and exposed in the UI.
4. **The Python entry point mixed persistence, CSV migration, HTTP, and process startup.** These responsibilities now live in `backend/database.py`, `backend/legacy.py`, `backend/http.py`, and the short `server.py` entry point.
5. **SQLite schema changes had no version guard.** The database now uses `PRAGMA user_version`; databases created by a newer application version are rejected instead of being modified blindly.
6. **Date and time validation only checked text shape.** The API now rejects impossible calendar dates and times as well as malformed creation timestamps.
7. **CORS allowed every website to call the local write API.** Cross-origin access is now limited to `Origin: null`, which is required only for one-time migration from the old `file://` application.
8. **The database directory could be enumerated through the static server.** `/data` and its contents are explicitly blocked.
9. **The storage badge implied success before SQLite was contacted.** It now changes to connected or error state after repository initialization.
10. **Edited game dates did not affect history order.** History is now sorted by the editable game date and time.
11. **Regression coverage was absent.** Pure domain tests cover scores, stable IDs, aggregation, interval boundaries, and chronology; Python tests cover SQLite CRUD, duplicate rejection, validation, and rollback behavior.
12. **Real game data could be published accidentally.** SQLite files, WAL files, legacy game exports, and macOS metadata are excluded from Git.

## Intentional boundaries

- The unfinished live game remains in browser `localStorage`; completed games live in SQLite. This avoids an HTTP write for every keystroke while protecting the important archive from browser cleanup.
- Routing remains hash-based and dependency-free. The current views can later become separate HTML entry points without moving business rules.
- Stable IDs are content-derived to satisfy duplicate prevention. Consequently, two games with exactly the same winner, lineup, roles, and scores are treated as one result; changing this requires an explicit “new game/session” identity in the product flow.
- The project deliberately has no package dependencies or build step. `package.json` exists only to run native Node tests.
