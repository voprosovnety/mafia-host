# AGENTS.md

## Project

Mafia Host is a local Russian-language tool for a sports-mafia host. It runs in a browser, uses only native HTML/CSS/JavaScript on the client, and stores completed games in a local SQLite database through a small Python standard-library server. The live-game screen covers the timer, ten-player seating, roles, faults, nominations, voting and revotes, night shots, first-killed/best-move scoring, notes, and final result. Saved games are shown in history and aggregated in the leaderboard.

The interface is intentionally dense and practical. Preserve the dark neutral theme, large timer, ten-player table, large fault targets, and fast keyboard workflow. Do not add decorative dashboards, animation, authentication, cloud services, frameworks, or build tools unless the user explicitly requests them.

## Start and test

- Start: `python3 server.py --no-browser` or double-click `start.command`.
- URL: `http://127.0.0.1:8000`.
- JavaScript tests: `npm test`.
- Python tests: `python3 -m unittest discover -s test -p '*_test.py'`.
- Syntax checks: `node --check app.js`, `for file in js/*.js; do node --check "$file"; done`, `python3 -m py_compile server.py backend/*.py`, and `zsh -n start.command`.
- GitHub Actions runs the same checks from `.github/workflows/ci.yml` on pushes and pull requests targeting `main`.

Always run the relevant tests after changing behavior. For UI changes, verify all three hash routes and the 10-player table at laptop width when browser tooling is available.

## Architecture

- `index.html`: semantic shell and the three SPA views.
- `styles.css`: shared visual system and responsive layouts.
- `app.js`: composition root only. Do not move feature logic back into this file.
- `js/domain.js`: pure scoring, validation, stable IDs, date filtering, and leaderboard calculations.
- `js/storage.js`: SQLite API repository, current-game browser persistence, and legacy IndexedDB migration.
- `js/timer.js`: timer state and Space keyboard behavior.
- `js/voting.js`: voting rounds, votes, revotes, outcomes, and voter eligibility.
- `js/night.js`: night-shot state, misses, first-killed derivation, best-move availability, and the round in which each kill takes effect.
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
- Each player has 0–1 tracked technical faults. The first deducts 0.3 from the total score, and clicking the filled technical-fault control can clear it. A second technical fault means player removal; it must never be stored as a count of 2 or applied as another −0.3 penalty.
- Voting starts at round 0 and can be reset to an empty round 0.
- A player killed in night N can still vote in round N−1 and becomes ineligible starting with round N; players eliminated by voting cannot vote in later stages.
- When a voting stage leads to a revote, only the final stage in that revote chain exposes and stores the outcome.
- Roles are selected from `Мирный`, `Шериф`, `Мафия`, and `Дон`.
- The successful target of night 1 is the first-killed player; there is no separate manual first-killed control.
- A miss in night 1 clears and disables all three best-move fields.
- A first-killed player gets an automatic best-move bonus of 0.5 for two distinct black-role picks or 0.8 for three; it is stored separately and included in the total score.
- Current-game base scores are derived from role team and winning team. Other extra scores are entered manually.
- Saved games support create, read, edit, and delete through `/api/games`.
- Duplicate game IDs return HTTP 409 and must not create another record.
- Leaderboard date-time bounds are inclusive; an inverted interval is an error.

## Storage and safety

Completed games live in SQLite schema version 4. Player scoring stores the base result, manual extra/penalty, technical-foul state (only 0 or 1), best-move (ЛХ), reserved CI score, and total separately. Saved games also store player notes and the three best-move picks. The unfinished current game still lives in browser `localStorage` so rapid input does not generate server traffic. Legacy browser games may be migrated from the current origin by `js/storage.js`. Old `file://` IndexedDB data belongs to a different browser origin and must be recovered through `legacy-recovery.html`; legacy CSV files are imported by `server.py`.

Never delete, overwrite, commit, or recreate `data/mafia-host.sqlite3` during routine development or tests. Tests must use temporary databases. Before changing the SQLite schema, add an explicit migration keyed by `PRAGMA user_version` and test upgrading an existing database.

The HTTP server must bind to loopback by default. Keep the SQLite file inaccessible over HTTP. Do not broaden CORS beyond the `file://` (`Origin: null`) legacy-migration case without a concrete requirement.

## Git and delivery workflow

- At the beginning of repository work, run `git fetch origin --prune` and inspect the current branch, upstream, and ahead/behind state. Fast-forward a clean branch when possible; never overwrite or discard local changes to force synchronization.
- After every completed code-changing task, run the relevant local checks, commit all in-scope source and test changes, and push the current branch to `origin` unless the user explicitly says not to commit or push.
- Never include `data/mafia-host.sqlite3`, SQLite WAL/SHM files, `.DS_Store`, caches, credentials, or unrelated user changes in a commit.
- Use an `agent/<description>` feature branch when starting from `main` or from an already merged branch. Keep commits focused and use terse imperative commit subjects.
- After pushing a feature branch, create or update its pull request against `main`. Confirm that GitHub Actions CI passes; if CI fails, inspect the logs, fix the failure, recommit, and push the correction.
- A successful local test run does not replace remote synchronization: the task handoff must include the branch name, commit hash, push result, pull-request link, and CI status.

## Style

- User-facing copy is Russian.
- Use native browser APIs and standard-library Python.
- Keep controls keyboard-accessible and preserve visible focus states.
- Reuse existing color and typography tokens.
- Avoid global mutable state outside the composition root and controller instances.
- Do not introduce a framework merely to organize code; the ES-module boundaries are the intended extension point.
