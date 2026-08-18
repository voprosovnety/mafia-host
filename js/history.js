import {
  calculateTechnicalFoulPenalty,
  dateFromInputValue,
  dateToInputValue,
  formatScore,
  gamesCountLabel,
  getGameId,
  MAX_TECHNICAL_FAULTS,
  normalizeTechnicalFouls,
  parseExtraScore,
  ROLE_OPTIONS,
  roundScore,
  winnerLabel,
} from "./domain.js";

let nextScorePopoverId = 0;

function createRoleCell(role) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "history-role";
  badge.dataset.role = role;
  badge.textContent = role;
  cell.append(badge);
  return cell;
}

function createPlayerNumberCell(playerNumber) {
  const cell = document.createElement("td");
  cell.className = "history-player-number";
  cell.textContent = String(playerNumber);
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

export function scoreBreakdownItems(player) {
  const items = [];
  const base = Number(player.base) || 0;
  const extra = Number(player.extra) || 0;
  const lh = Number(player.lh) || 0;
  const ci = Number(player.ci) || 0;
  const technicalFouls = normalizeTechnicalFouls(player.technicalFouls);
  const technicalPenalty = calculateTechnicalFoulPenalty(technicalFouls);

  if (base !== 0) items.push({ label: "Победа", value: formatSignedScore(base) });
  if (extra > 0) items.push({ label: "Доп", value: formatSignedScore(extra) });
  if (extra < 0) items.push({ label: "Штраф", value: formatSignedScore(extra) });
  if (technicalPenalty !== 0) {
    const label = technicalFouls === 1 ? "Техфол" : `Техфол ×${technicalFouls}`;
    items.push({ label, value: formatSignedScore(technicalPenalty) });
  }
  if (lh !== 0) items.push({ label: "ЛХ", value: formatSignedScore(lh) });
  if (ci !== 0) items.push({ label: "CI", value: formatSignedScore(ci) });
  return items;
}

function createScoreCell(player) {
  const cell = document.createElement("td");
  cell.className = "history-score-cell";
  const trigger = document.createElement("button");
  trigger.className = "history-score-trigger";
  trigger.type = "button";
  trigger.textContent = formatScore(player.total);
  trigger.setAttribute("aria-label", `Общий балл ${formatScore(player.total)}. Показать состав`);
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-haspopup", "true");

  const popover = document.createElement("div");
  nextScorePopoverId += 1;
  popover.id = `history-score-popover-${nextScorePopoverId}`;
  popover.className = "history-score-popover";
  popover.setAttribute("role", "tooltip");
  trigger.setAttribute("aria-describedby", popover.id);
  const items = scoreBreakdownItems(player);
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-score-empty";
    empty.textContent = "Нет начислений";
    popover.append(empty);
  } else {
    const breakdown = document.createElement("dl");
    breakdown.className = "history-score-breakdown";
    items.forEach((item) => {
      const row = document.createElement("div");
      const label = document.createElement("dt");
      label.textContent = item.label;
      const value = document.createElement("dd");
      value.textContent = item.value;
      row.append(label, value);
      breakdown.append(row);
    });
    popover.append(breakdown);
  }

  cell.append(trigger, popover);
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

function createEditTechnicalFoulsSelect(technicalFouls) {
  const select = document.createElement("select");
  select.className = "edit-game-technical-fouls";
  for (let count = 0; count <= MAX_TECHNICAL_FAULTS; count += 1) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = String(count);
    select.append(option);
  }
  select.value = String(Math.min(MAX_TECHNICAL_FAULTS, Math.max(0, Number(technicalFouls) || 0)));
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
    this.activeScoreTrigger = null;
    this.playerRows = [];

    elements.cancelButton.addEventListener("click", () => this.closeEditor());
    elements.form.addEventListener("submit", (event) => this.saveEditedGame(event));
    elements.list.addEventListener("click", (event) => this.handleScorePopoverClick(event));
    document.addEventListener("click", (event) => {
      if (!elements.list.contains(event.target)) this.closeScorePopover();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.closeScorePopover(true);
    });
  }

  closeScorePopover(restoreFocus = false) {
    if (!this.activeScoreTrigger) return;
    const trigger = this.activeScoreTrigger;
    trigger.closest(".history-score-cell")?.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    this.activeScoreTrigger = null;
    if (restoreFocus) trigger.focus();
  }

  handleScorePopoverClick(event) {
    const trigger = event.target.closest(".history-score-trigger");
    if (!trigger) {
      this.closeScorePopover();
      return;
    }

    const shouldOpen = trigger !== this.activeScoreTrigger;
    this.closeScorePopover();
    if (!shouldOpen) {
      trigger.blur();
      return;
    }

    trigger.closest(".history-score-cell")?.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    this.activeScoreTrigger = trigger;
  }

  render(games) {
    const { list, empty, count } = this.elements;
    this.closeScorePopover();
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
      ["№", "Ник", "Роль", "Балл"].forEach((heading) => {
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
          createPlayerNumberCell(player.number),
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
    const technicalPenalty = calculateTechnicalFoulPenalty(row.technicalFouls.value);
    row.total.value = valid
      ? formatScore(base + extra + row.lh + row.ci + technicalPenalty)
      : "—";
    return valid;
  }

  openEditor(game) {
    const { date, time, winner, bestMove, body, error, dialog } = this.elements;
    this.activeGame = game;
    date.value = dateToInputValue(game.date);
    time.value = game.time;
    winner.value = game.winner;
    const firstKilledPlayer = game.players.find((player) => player.isFirstKilled === true);
    const bestMoveNumbers = (Array.isArray(game.bestMove) ? game.bestMove : [])
      .filter((number) => Number.isInteger(number));
    if (firstKilledPlayer) {
      const numbersLabel = bestMoveNumbers.length > 0
        ? bestMoveNumbers.join(" · ")
        : "номера не сохранены";
      const bonusLabel = Number(firstKilledPlayer.lh)
        ? ` · бонус ${formatSignedScore(firstKilledPlayer.lh)}`
        : "";
      bestMove.textContent = `ЛХ первого убиенного №${firstKilledPlayer.number}: ${numbersLabel}${bonusLabel}`;
      bestMove.hidden = false;
    } else {
      bestMove.textContent = "";
      bestMove.hidden = true;
    }
    error.textContent = "";
    body.replaceChildren();
    this.playerRows = [];

    game.players.forEach((player) => {
      const tableRow = document.createElement("tr");
      tableRow.classList.toggle("is-first-killed", player.isFirstKilled === true);
      const numberCell = createPlayerNumberCell(player.number);
      numberCell.classList.add("edit-game-player-number");
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
      const technicalFoulsLabel = document.createElement("label");
      technicalFoulsLabel.textContent = "Техфолы";
      const technicalFouls = createEditTechnicalFoulsSelect(player.technicalFouls);
      technicalFoulsLabel.append(technicalFouls);
      const storedComponents = document.createElement("span");
      storedComponents.className = "edit-game-stored-components";
      const storedParts = [];
      if (Number(player.lh)) storedParts.push(`${formatSignedScore(player.lh)} ЛХ`);
      if (Number(player.ci)) storedParts.push(`${formatSignedScore(player.ci)} CI`);
      storedComponents.textContent = storedParts.join(" · ");
      const total = document.createElement("output");
      total.className = "edit-game-total";
      total.setAttribute("aria-label", `Итоговый балл игрока ${player.number}`);
      scoreFields.append(baseLabel, extraLabel, technicalFoulsLabel, storedComponents, total);
      scoreCell.append(scoreFields);

      const notesCell = document.createElement("td");
      const notes = document.createElement("textarea");
      notes.className = "edit-game-notes";
      notes.rows = 2;
      notes.maxLength = 10000;
      notes.value = typeof player.notes === "string" ? player.notes : "";
      notes.placeholder = "Заметок нет";
      notes.setAttribute("aria-label", `Заметки игрока ${player.number}`);
      notesCell.append(notes);

      const row = {
        playerNumber: player.number,
        isFirstKilled: player.isFirstKilled === true,
        name,
        role,
        base,
        extra,
        technicalFouls,
        lh: Number(player.lh) || 0,
        ci: Number(player.ci) || 0,
        notes,
        total,
      };
      base.addEventListener("change", () => this.updateEditedTotal(row));
      extra.addEventListener("input", () => this.updateEditedTotal(row));
      technicalFouls.addEventListener("change", () => this.updateEditedTotal(row));
      this.playerRows.push(row);
      this.updateEditedTotal(row);
      tableRow.append(numberCell, nameCell, roleCell, scoreCell, notesCell);
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
      const technicalFouls = Number(row.technicalFouls.value);
      const technicalPenalty = calculateTechnicalFoulPenalty(technicalFouls);
      return {
        number: row.playerNumber,
        name: row.name.value.trim(),
        role: row.role.value,
        base,
        extra,
        technicalFouls,
        lh: row.lh,
        ci: row.ci,
        total: roundScore(base + extra + row.lh + row.ci + technicalPenalty),
        notes: row.notes.value,
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
