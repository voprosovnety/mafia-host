import {
  dateFromInputValue,
  dateToInputValue,
  formatScore,
  gamesCountLabel,
  getGameId,
  parseExtraScore,
  ROLE_OPTIONS,
  roundScore,
  winnerLabel,
} from "./domain.js";

function createRoleCell(role) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "history-role";
  badge.dataset.role = role;
  badge.textContent = role;
  cell.append(badge);
  return cell;
}

function createPlayerNameCell(player) {
  const cell = document.createElement("td");
  const name = document.createElement("span");
  name.textContent = player.name;
  cell.append(name);
  if (player.isFirstKilled) {
    const badge = document.createElement("span");
    badge.className = "history-first-killed-badge";
    badge.textContent = "ПУ";
    cell.append(badge);
  }
  return cell;
}

function formatSignedScore(score) {
  const value = Number(score);
  if (value > 0) return `+${formatScore(value)}`;
  if (value < 0) return `−${formatScore(Math.abs(value))}`;
  return "0";
}

function createScorePart(value, label, className = "") {
  const part = document.createElement("span");
  part.className = `history-score-part ${className}`.trim();
  const score = document.createElement("strong");
  score.textContent = value;
  const caption = document.createElement("span");
  caption.textContent = label;
  part.append(score, caption);
  return part;
}

function createScoreCell(player) {
  const cell = document.createElement("td");
  cell.className = "history-score-cell";
  const formula = document.createElement("div");
  formula.className = "history-score-formula";
  formula.append(createScorePart(
    formatScore(player.base),
    Number(player.base) === 1 ? "победа" : "поражение",
    "is-base",
  ));

  const extra = Number(player.extra) || 0;
  if (extra !== 0) {
    formula.append(createScorePart(
      formatSignedScore(extra),
      extra > 0 ? "доп" : "штраф",
      extra > 0 ? "is-bonus" : "is-penalty",
    ));
  }

  const lh = Number(player.lh) || 0;
  if (lh !== 0) {
    formula.append(createScorePart(formatSignedScore(lh), "ЛХ", "is-lh"));
  }

  const ci = Number(player.ci) || 0;
  if (ci !== 0) {
    formula.append(createScorePart(formatSignedScore(ci), "CI", "is-ci"));
  }

  const total = document.createElement("span");
  total.className = "history-score-total";
  total.textContent = `= ${formatScore(player.total)}`;
  formula.append(total);
  cell.append(formula);
  return cell;
}

function createEditRoleSelect(roleName) {
  const select = document.createElement("select");
  select.className = "edit-game-role player-role";
  ROLE_OPTIONS.forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = role;
    select.append(option);
  });
  select.value = ROLE_OPTIONS.includes(roleName) ? roleName : ROLE_OPTIONS[0];
  select.dataset.role = select.value;
  select.addEventListener("change", () => { select.dataset.role = select.value; });
  return select;
}

function createEditBaseSelect(baseScore) {
  const select = document.createElement("select");
  select.className = "edit-game-base";
  [0, 1].forEach((score) => {
    const option = document.createElement("option");
    option.value = String(score);
    option.textContent = String(score);
    select.append(option);
  });
  select.value = Number(baseScore) === 1 ? "1" : "0";
  return select;
}

export class HistoryView {
  constructor({ repository, elements, getGames, onGamesChanged, setStatus }) {
    this.repository = repository;
    this.elements = elements;
    this.getGames = getGames;
    this.onGamesChanged = onGamesChanged;
    this.setStatus = setStatus;
    this.activeGame = null;
    this.playerRows = [];

    elements.cancelButton.addEventListener("click", () => this.closeEditor());
    elements.form.addEventListener("submit", (event) => this.saveEditedGame(event));
  }

  render(games) {
    const { list, empty, count } = this.elements;
    list.replaceChildren();

    [...games].reverse().forEach((game) => {
      const details = document.createElement("details");
      details.className = "history-game";
      details.open = true;

      const summary = document.createElement("summary");
      summary.className = "history-game-summary";
      const date = document.createElement("span");
      date.className = "history-game-date";
      date.textContent = game.date;
      const time = document.createElement("span");
      time.className = "history-game-time";
      time.textContent = game.time;
      const winner = document.createElement("span");
      winner.className = `history-winner is-${game.winner}`;
      winner.textContent = `Победа: ${game.winnerLabel}`;

      const actions = document.createElement("div");
      actions.className = "history-actions";
      const editButton = document.createElement("button");
      editButton.className = "edit-game-button";
      editButton.type = "button";
      editButton.textContent = "Изменить";
      editButton.setAttribute("aria-label", `Редактировать игру ${game.date} ${game.time}`);
      editButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openEditor(game);
      });
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-game-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Удалить";
      deleteButton.setAttribute("aria-label", `Удалить игру ${game.date} ${game.time}`);
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.deleteGame(game);
      });
      actions.append(editButton, deleteButton);
      summary.append(date, time, winner, actions);

      const tableWrap = document.createElement("div");
      tableWrap.className = "history-game-table-wrap";
      const table = document.createElement("table");
      table.className = "history-table";
      const tableHead = document.createElement("thead");
      const headingRow = document.createElement("tr");
      ["Ник", "Роль", "Балл"].forEach((heading) => {
        const cell = document.createElement("th");
        cell.textContent = heading;
        headingRow.append(cell);
      });
      tableHead.append(headingRow);
      const tableBody = document.createElement("tbody");
      game.players.forEach((player) => {
        const row = document.createElement("tr");
        row.classList.toggle("is-first-killed", player.isFirstKilled === true);
        row.append(
          createPlayerNameCell(player),
          createRoleCell(player.role),
          createScoreCell(player),
        );
        tableBody.append(row);
      });
      table.append(tableHead, tableBody);
      tableWrap.append(table);
      details.append(summary, tableWrap);
      list.append(details);
    });

    empty.hidden = games.length > 0;
    count.textContent = gamesCountLabel(games.length);
  }

  updateEditedTotal(row) {
    const base = Number(row.base.value);
    const extra = parseExtraScore(row.extra.value);
    const valid = extra !== null && (base === 0 || base === 1);
    row.extra.classList.toggle("is-invalid", extra === null);
    row.total.value = valid ? formatScore(base + extra + row.lh + row.ci) : "—";
    return valid;
  }

  openEditor(game) {
    const { date, time, winner, body, error, dialog } = this.elements;
    this.activeGame = game;
    date.value = dateToInputValue(game.date);
    time.value = game.time;
    winner.value = game.winner;
    error.textContent = "";
    body.replaceChildren();
    this.playerRows = [];

    game.players.forEach((player) => {
      const tableRow = document.createElement("tr");
      tableRow.classList.toggle("is-first-killed", player.isFirstKilled === true);
      const nameCell = document.createElement("td");
      const name = document.createElement("input");
      name.className = "edit-game-name";
      name.type = "text";
      name.value = player.name;
      nameCell.append(name);
      const roleCell = document.createElement("td");
      const role = createEditRoleSelect(player.role);
      roleCell.append(role);
      const scoreCell = document.createElement("td");
      const scoreFields = document.createElement("div");
      scoreFields.className = "edit-game-score-fields";
      const baseLabel = document.createElement("label");
      baseLabel.textContent = "0/1";
      const base = createEditBaseSelect(player.base);
      baseLabel.append(base);
      const extraLabel = document.createElement("label");
      extraLabel.textContent = "Доп./штраф";
      const extra = document.createElement("input");
      extra.className = "edit-game-extra";
      extra.type = "text";
      extra.inputMode = "decimal";
      extra.maxLength = 4;
      extra.value = formatScore(Number(player.extra));
      extraLabel.append(extra);
      const storedComponents = document.createElement("span");
      storedComponents.className = "edit-game-stored-components";
      const storedParts = [];
      if (Number(player.lh)) storedParts.push(`${formatSignedScore(player.lh)} ЛХ`);
      if (Number(player.ci)) storedParts.push(`${formatSignedScore(player.ci)} CI`);
      storedComponents.textContent = storedParts.join(" · ");
      const total = document.createElement("output");
      total.className = "edit-game-total";
      total.setAttribute("aria-label", `Итоговый балл игрока ${player.number}`);
      scoreFields.append(baseLabel, extraLabel, storedComponents, total);
      scoreCell.append(scoreFields);

      const row = {
        playerNumber: player.number,
        isFirstKilled: player.isFirstKilled === true,
        name,
        role,
        base,
        extra,
        lh: Number(player.lh) || 0,
        ci: Number(player.ci) || 0,
        total,
      };
      base.addEventListener("change", () => this.updateEditedTotal(row));
      extra.addEventListener("input", () => this.updateEditedTotal(row));
      this.playerRows.push(row);
      this.updateEditedTotal(row);
      tableRow.append(nameCell, roleCell, scoreCell);
      body.append(tableRow);
    });

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  closeEditor() {
    this.activeGame = null;
    const { dialog } = this.elements;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  async saveEditedGame(event) {
    event.preventDefault();
    if (!this.activeGame) return;

    const { date, time, winner, error } = this.elements;
    const invalidRow = this.playerRows.find((row) => (
      row.name.value.trim() === "" || !this.updateEditedTotal(row)
    ));
    if (!date.value || !time.value || invalidRow) {
      error.textContent = "Заполните дату, время, никнеймы и корректные баллы";
      return;
    }

    const oldGameId = getGameId(this.activeGame);
    const updatedGame = structuredClone(this.activeGame);
    updatedGame.date = dateFromInputValue(date.value);
    updatedGame.time = time.value;
    updatedGame.winner = winner.value;
    updatedGame.winnerLabel = winnerLabel(updatedGame.winner);
    updatedGame.players = this.playerRows.map((row) => {
      const base = Number(row.base.value);
      const extra = parseExtraScore(row.extra.value);
      return {
        number: row.playerNumber,
        name: row.name.value.trim(),
        role: row.role.value,
        base,
        extra,
        lh: row.lh,
        ci: row.ci,
        total: roundScore(base + extra + row.lh + row.ci),
        isFirstKilled: row.isFirstKilled,
      };
    });
    delete updatedGame.gameId;
    updatedGame.gameId = getGameId(updatedGame);

    const duplicate = this.getGames().some((game) => (
      game !== this.activeGame && getGameId(game) === updatedGame.gameId
    ));
    if (duplicate) {
      error.textContent = `Такая игра уже существует — ID ${updatedGame.gameId}`;
      return;
    }

    try {
      const storedGame = await this.repository.replace(oldGameId, updatedGame);
      this.onGamesChanged({ type: "replace", oldGameId, game: storedGame });
      this.setStatus(`Изменения сохранены — ID ${storedGame.gameId}`);
      this.closeEditor();
    } catch (saveError) {
      error.textContent = saveError?.name === "ConstraintError"
        ? "Такая игра уже существует"
        : `Не удалось сохранить изменения: ${saveError.message}`;
    }
  }

  async deleteGame(game) {
    const confirmed = typeof window.confirm !== "function" || window.confirm(
      `Удалить игру ${game.date} ${game.time}?`,
    );
    if (!confirmed) return;

    const gameId = getGameId(game);
    try {
      await this.repository.delete(gameId);
      this.onGamesChanged({ type: "delete", gameId });
      this.setStatus(`Игра удалена из SQLite — ID ${gameId}`);
    } catch (error) {
      this.setStatus(`Не удалось удалить игру: ${error.message}`, true);
    }
  }
}
