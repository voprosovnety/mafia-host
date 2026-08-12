import {
  calculateScores,
  formatScore,
  MAX_FAULTS,
  PLAYER_COUNT,
  ROLE_OPTIONS,
} from "./domain.js";

export class PlayersController {
  constructor({ list, notesDialog, notesTitle, notesText, saveNotesButton, onNominate, onChange }) {
    this.list = list;
    this.notesDialog = notesDialog;
    this.notesTitle = notesTitle;
    this.notesText = notesText;
    this.onNominate = onNominate;
    this.onChange = onChange;
    this.records = [];
    this.winner = null;
    this.activeNotesRecord = null;

    notesText.addEventListener("input", () => this.storeActiveNotes());
    saveNotesButton.addEventListener("click", () => this.storeActiveNotes());

    for (let number = 1; number <= PLAYER_COUNT; number += 1) {
      this.list.append(this.createPlayerRow(number));
    }
  }

  setFaultCount(record, count) {
    record.row.dataset.faults = String(count);
    record.faults.querySelectorAll(".fault").forEach((button, index) => {
      const filled = index < count;
      button.classList.toggle("is-filled", filled);
      button.setAttribute("aria-pressed", String(filled));
      button.setAttribute(
        "aria-label",
        `${index + 1}-й фол игрока ${record.number}: ${filled ? "поставлен" : "не поставлен"}`,
      );
    });
  }

  createRoleSelect(playerNumber) {
    const role = document.createElement("select");
    role.className = "player-role";
    role.setAttribute("aria-label", `Роль игрока ${playerNumber}`);
    const emptyRole = document.createElement("option");
    emptyRole.value = "";
    emptyRole.textContent = "Роль";
    role.append(emptyRole);
    ROLE_OPTIONS.forEach((roleName) => {
      const option = document.createElement("option");
      option.value = roleName;
      option.textContent = roleName;
      role.append(option);
    });
    return role;
  }

  createPlayerRow(playerNumber) {
    const row = document.createElement("li");
    row.className = "player-row";
    row.dataset.player = String(playerNumber);
    row.dataset.faults = "0";

    const number = document.createElement("span");
    number.className = "player-number";
    number.textContent = `${playerNumber}.`;
    number.setAttribute("aria-hidden", "true");

    const name = document.createElement("input");
    name.className = "player-name";
    name.type = "text";
    name.placeholder = "Никнейм";
    name.autocomplete = "off";
    name.spellcheck = false;
    name.setAttribute("aria-label", `Никнейм игрока ${playerNumber}`);

    const role = this.createRoleSelect(playerNumber);
    const faults = document.createElement("div");
    faults.className = "faults";
    faults.setAttribute("aria-label", `Фолы игрока ${playerNumber}`);

    const nominate = document.createElement("button");
    nominate.className = "nominate-button";
    nominate.type = "button";
    nominate.textContent = "Выставить";
    nominate.setAttribute("aria-label", `Выставить игрока ${playerNumber}`);
    nominate.setAttribute("aria-pressed", "false");

    const base = document.createElement("output");
    base.className = "base-score";
    base.textContent = "—";
    base.setAttribute("aria-label", `Балл игрока ${playerNumber}`);

    const extra = document.createElement("input");
    extra.className = "extra-score";
    extra.type = "text";
    extra.inputMode = "decimal";
    extra.maxLength = 4;
    extra.placeholder = "0";
    extra.setAttribute("aria-label", `Дополнительный балл игрока ${playerNumber}`);

    const total = document.createElement("output");
    total.className = "total-score";
    total.textContent = "—";
    total.setAttribute("aria-label", `Сумма баллов игрока ${playerNumber}`);

    const notesButton = document.createElement("button");
    notesButton.className = "notes-button";
    notesButton.type = "button";
    notesButton.textContent = "✎";
    notesButton.setAttribute("aria-label", `Открыть заметки игрока ${playerNumber}`);

    const record = {
      number: playerNumber,
      row,
      name,
      role,
      faults,
      nominate,
      base,
      extra,
      total,
      notesButton,
      notes: "",
    };

    for (let faultNumber = 1; faultNumber <= MAX_FAULTS; faultNumber += 1) {
      const fault = document.createElement("button");
      fault.className = "fault";
      fault.type = "button";
      fault.dataset.fault = String(faultNumber);
      fault.addEventListener("click", () => {
        const currentCount = Number(row.dataset.faults);
        const nextCount = faultNumber <= currentCount ? faultNumber - 1 : faultNumber;
        this.setFaultCount(record, nextCount);
        this.onChange();
      });
      faults.append(fault);
    }

    name.addEventListener("input", () => this.onChange());
    role.addEventListener("change", () => {
      this.updatePlayerScore(record);
      this.onChange();
    });
    extra.addEventListener("input", () => {
      this.updatePlayerScore(record);
      this.onChange();
    });
    nominate.addEventListener("click", () => this.onNominate(playerNumber));
    notesButton.addEventListener("click", () => this.openNotes(record));

    this.records.push(record);
    row.append(number, name, role, faults, nominate, base, extra, total, notesButton);
    this.setFaultCount(record, 0);
    this.updatePlayerScore(record);
    return row;
  }

  updatePlayerScore(record) {
    const scores = calculateScores(record.role.value, record.extra.value, this.winner);
    record.role.dataset.role = record.role.value;
    record.extra.classList.toggle("is-invalid", scores.extra === null);
    record.base.textContent = formatScore(scores.base);
    record.total.textContent = formatScore(scores.total);
    record.base.classList.toggle("has-value", scores.base !== null);
    record.base.classList.toggle("is-winner", scores.base === 1);
    record.total.classList.toggle("has-value", scores.total !== null);
  }

  setWinner(winner) {
    this.winner = winner;
    this.records.forEach((record) => this.updatePlayerScore(record));
  }

  openNotes(record) {
    this.activeNotesRecord = record;
    const playerName = record.name.value.trim() || `Игрок ${record.number}`;
    this.notesTitle.textContent = `${record.number}. ${playerName}`;
    this.notesText.value = record.notes;
    if (typeof this.notesDialog.showModal === "function") this.notesDialog.showModal();
    else this.notesDialog.setAttribute("open", "");
    this.notesText.focus();
  }

  storeActiveNotes() {
    const record = this.activeNotesRecord;
    if (!record) return;
    record.notes = this.notesText.value;
    const hasNotes = record.notes.trim() !== "";
    record.notesButton.classList.toggle("has-notes", hasNotes);
    record.notesButton.setAttribute(
      "aria-label",
      `${hasNotes ? "Изменить" : "Открыть"} заметки игрока ${record.number}`,
    );
    this.onChange();
  }

  getState() {
    return this.records.map((record) => ({
      number: record.number,
      name: record.name.value,
      role: record.role.value,
      faults: Number(record.row.dataset.faults),
      extra: record.extra.value,
      notes: record.notes,
    }));
  }

  restore(players) {
    if (!Array.isArray(players)) return;
    this.records.forEach((record, index) => {
      const stored = players[index];
      if (!stored || typeof stored !== "object") return;
      record.name.value = typeof stored.name === "string" ? stored.name : "";
      record.role.value = ROLE_OPTIONS.includes(stored.role) ? stored.role : "";
      record.extra.value = typeof stored.extra === "string" ? stored.extra.slice(0, 4) : "";
      record.notes = typeof stored.notes === "string" ? stored.notes : "";
      const hasNotes = record.notes.trim() !== "";
      record.notesButton.classList.toggle("has-notes", hasNotes);
      record.notesButton.setAttribute(
        "aria-label",
        `${hasNotes ? "Изменить" : "Открыть"} заметки игрока ${record.number}`,
      );
      const faults = Number(stored.faults);
      this.setFaultCount(record, Number.isInteger(faults) ? Math.min(MAX_FAULTS, Math.max(0, faults)) : 0);
      this.updatePlayerScore(record);
    });
  }
}
