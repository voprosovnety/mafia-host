import {
  buildLeaderboard,
  filterGamesByInterval,
  formatScore,
  gamesCountLabel,
  playersCountLabel,
} from "./domain.js";

function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = String(value);
  return cell;
}

export class LeaderboardView {
  constructor({ body, empty, count, fromInput, toInput, resetButton, filterStatus }) {
    this.body = body;
    this.empty = empty;
    this.count = count;
    this.fromInput = fromInput;
    this.toInput = toInput;
    this.filterStatus = filterStatus;
    this.games = [];

    fromInput.addEventListener("change", () => this.render());
    toInput.addEventListener("change", () => this.render());
    resetButton.addEventListener("click", () => {
      fromInput.value = "";
      toInput.value = "";
      this.render();
    });
  }

  setGames(games) {
    this.games = games;
    this.render();
  }

  render() {
    const filtered = filterGamesByInterval(this.games, this.fromInput.value, this.toInput.value);
    const leaderboard = filtered.invalid ? [] : buildLeaderboard(filtered.games);
    this.body.replaceChildren();

    leaderboard.forEach((player, index) => {
      const row = document.createElement("tr");
      const place = createCell(index + 1);
      place.className = "leaderboard-place";
      const name = createCell(player.name);
      name.className = "leaderboard-name";
      row.append(
        place,
        name,
        createCell(formatScore(player.totalScore)),
        createCell(formatScore(player.netExtra)),
        createCell(formatScore(player.bonuses)),
        createCell(formatScore(player.penalties)),
        createCell(player.gamesPlayed),
        createCell(formatScore(player.average)),
      );
      this.body.append(row);
    });

    if (filtered.invalid) {
      this.filterStatus.textContent = "Начало интервала должно быть раньше его окончания";
      this.filterStatus.classList.add("is-error");
    } else {
      this.filterStatus.textContent = `Учтено: ${gamesCountLabel(filtered.games.length)} из ${this.games.length}`;
      this.filterStatus.classList.remove("is-error");
    }

    this.empty.textContent = this.games.length === 0
      ? "Рейтинг появится после сохранения первой игры"
      : "В выбранном интервале игр нет";
    this.empty.hidden = leaderboard.length > 0;
    this.count.textContent = playersCountLabel(leaderboard.length);
  }
}
