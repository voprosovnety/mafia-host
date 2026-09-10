import {
  autoFillCivilianRoles,
  calculateScores,
  CIVILIAN_ROLE,
  EXTRA_SCORE_OPTIONS,
  filterNicknameSuggestions,
  formatScore,
  MAX_FAULTS,
  MAX_TECHNICAL_FAULTS,
  normalizeTechnicalFouls,
  PLAYER_COUNT,
  PENALTY_SCORE_OPTIONS,
  ROLE_OPTIONS,
  shuffledCopy,
} from "./domain.js";

function createScoreSelect(playerNumber, className, label, values) {
  const select = document.createElement("select");
  select.className = className;
  select.setAttribute("aria-label", `${label} игрока ${playerNumber}`);
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "—";
  select.append(empty);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  });
  return select;
}

function restoreScoreSelect(select, value) {
  const numericValue = Number(value);
  const normalized = Number.isFinite(numericValue) && numericValue > 0
    ? String(Math.abs(numericValue))
    : "";
  select.value = [...select.options].some((option) => option.value === normalized)
    ? normalized
    : "";
}

function createNominationIcon() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const head = document.createElementNS(svgNamespace, "path");
  head.setAttribute("d", "M13.7 2.8 21.2 10.3 18.4 13.1 10.9 5.6Z");
  const handle = document.createElementNS(svgNamespace, "path");
  handle.setAttribute("d", "M10.7 7.1 13.6 10 6.5 17.1 3.6 14.2Z");
  const base = document.createElementNS(svgNamespace, "path");
  base.setAttribute("d", "M3 19.3h11v2.2H3Z");
  icon.append(head, handle, base);
  return icon;
}

export class PlayersController {
  constructor({
    list,
    notesDialog,
    notesTitle,
    notesText,
    saveNotesButton,
    randomizeButton,
    seatingStatus,
    onNominate,
    onChange,
  }) {
    this.list = list;
    this.notesDialog = notesDialog;
    this.notesTitle = notesTitle;
    this.notesText = notesText;
    this.onNominate = onNominate;
    this.onChange = onChange;
    this.randomizeButton = randomizeButton;
    this.seatingStatus = seatingStatus;
    this.records = [];
    this.nicknameSuggestions = [];
    this.activeNicknameRecord = null;
    this.activeNicknameSuggestionIndex = -1;
    this.winner = null;
    this.bestMoveBonus = 0;
    this.activeNotesRecord = null;

    notesText.addEventListener("input", () => this.storeActiveNotes());
    saveNotesButton.addEventListener("click", () => this.storeActiveNotes());
    randomizeButton.addEventListener("click", () => this.randomizeSeating());

    this.nicknameSuggestionsList = document.createElement("ul");
    this.nicknameSuggestionsList.className = "nickname-suggestions";
    this.nicknameSuggestionsList.id = "nickname-suggestions";
    this.nicknameSuggestionsList.setAttribute("role", "listbox");
    this.nicknameSuggestionsList.hidden = true;
    document.body.append(this.nicknameSuggestionsList);

    document.addEventListener("pointerdown", (event) => {
      if (
        this.activeNicknameRecord &&
        event.target !== this.activeNicknameRecord.name &&
        !this.nicknameSuggestionsList.contains(event.target)
      ) {
        this.hideNicknameSuggestions();
      }
    });
    window.addEventListener("scroll", () => this.positionNicknameSuggestions(), true);
    window.addEventListener("resize", () => this.positionNicknameSuggestions());

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

  setTechnicalFaultCount(record, count) {
    const normalizedCount = normalizeTechnicalFouls(count);
    record.row.dataset.technicalFaults = String(normalizedCount);
    record.technicalFaults.querySelectorAll(".technical-fault").forEach((button, index) => {
      const filled = index < normalizedCount;
      button.classList.toggle("is-filled", filled);
      button.setAttribute("aria-pressed", String(filled));
      button.setAttribute(
        "aria-label",
        `${index + 1}-й технический фол игрока ${record.number}: ${filled ? "поставлен" : "не поставлен"}`,
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

  fillRemainingCivilianRoles() {
    const roles = autoFillCivilianRoles(this.records.map((record) => record.role.value));
    this.records.forEach((record, index) => {
      record.role.value = roles[index];
    });
  }

  createPlayerRow(playerNumber) {
    const row = document.createElement("li");
    row.className = "player-row";
    row.dataset.player = String(playerNumber);
    row.dataset.faults = "0";
    row.dataset.technicalFaults = "0";

    const number = document.createElement("span");
    number.className = "player-number";
    number.setAttribute("aria-hidden", "true");
    const numberValue = document.createElement("span");
    numberValue.textContent = String(playerNumber).padStart(2, "0");
    const firstKilledBadge = document.createElement("span");
    firstKilledBadge.className = "first-killed-badge";
    firstKilledBadge.textContent = "ПУ";
    firstKilledBadge.hidden = true;
    number.append(numberValue, firstKilledBadge);

    const name = document.createElement("input");
    name.className = "player-name";
    name.type = "text";
    name.placeholder = "Никнейм";
    name.autocomplete = "off";
    name.spellcheck = false;
    name.setAttribute("aria-label", `Никнейм игрока ${playerNumber}`);
    name.setAttribute("role", "combobox");
    name.setAttribute("aria-autocomplete", "list");
    name.setAttribute("aria-controls", this.nicknameSuggestionsList.id);
    name.setAttribute("aria-expanded", "false");

    const nameField = document.createElement("div");
    nameField.className = "player-name-field";
    nameField.append(name);

    const role = this.createRoleSelect(playerNumber);
    const faults = document.createElement("div");
    faults.className = "faults";
    faults.setAttribute("aria-label", `Фолы игрока ${playerNumber}`);

    const technicalFaults = document.createElement("div");
    technicalFaults.className = "technical-faults";
    technicalFaults.setAttribute("aria-label", `Технические фолы игрока ${playerNumber}`);

    const nominate = document.createElement("button");
    nominate.className = "nominate-button";
    nominate.type = "button";
    nominate.append(createNominationIcon());
    nominate.title = `Выставить игрока ${playerNumber} на голосование`;
    nominate.setAttribute("aria-label", `Выставить игрока ${playerNumber} на голосование`);
    nominate.setAttribute("aria-pressed", "false");

    const base = document.createElement("output");
    base.className = "base-score";
    base.textContent = "—";
    base.setAttribute("aria-label", `Балл игрока ${playerNumber}`);

    const extra = createScoreSelect(
      playerNumber,
      "extra-score",
      "Дополнительный балл",
      EXTRA_SCORE_OPTIONS,
    );
    const penalty = createScoreSelect(
      playerNumber,
      "penalty-score",
      "Штраф",
      PENALTY_SCORE_OPTIONS,
    );

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
      technicalFaults,
      nominate,
      firstKilledBadge,
      base,
      extra,
      penalty,
      total,
      notesButton,
      notes: "",
      isFirstKilled: false,
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

    for (let faultNumber = 1; faultNumber <= MAX_TECHNICAL_FAULTS; faultNumber += 1) {
      const technicalFault = document.createElement("button");
      technicalFault.className = "technical-fault";
      technicalFault.type = "button";
      technicalFault.textContent = "Т";
      technicalFault.dataset.technicalFault = String(faultNumber);
      technicalFault.title = "Техфол: штраф −0.3";
      technicalFault.addEventListener("click", () => {
        const currentCount = Number(row.dataset.technicalFaults);
        const nextCount = faultNumber <= currentCount ? faultNumber - 1 : faultNumber;
        this.setTechnicalFaultCount(record, nextCount);
        this.updatePlayerScore(record);
        this.onChange();
      });
      technicalFaults.append(technicalFault);
    }

    name.addEventListener("input", () => {
      this.setSeatingStatus("");
      this.showNicknameSuggestions(record);
      this.onChange();
    });
    name.addEventListener("focus", () => this.showNicknameSuggestions(record));
    name.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (document.activeElement !== name) this.hideNicknameSuggestions(record);
      }, 0);
    });
    name.addEventListener("keydown", (event) => this.handleNicknameKeydown(event, record));
    role.addEventListener("change", () => {
      this.fillRemainingCivilianRoles();
      this.records.forEach((playerRecord) => this.updatePlayerScore(playerRecord));
      this.onChange();
    });
    extra.addEventListener("change", () => {
      this.updatePlayerScore(record);
      this.onChange();
    });
    penalty.addEventListener("change", () => {
      this.updatePlayerScore(record);
      this.onChange();
    });
    nominate.addEventListener("click", () => this.onNominate(playerNumber));
    notesButton.addEventListener("click", () => this.openNotes(record));

    this.records.push(record);
    row.append(
      number,
      nameField,
      role,
      faults,
      technicalFaults,
      nominate,
      base,
      extra,
      penalty,
      total,
      notesButton,
    );
    this.setFaultCount(record, 0);
    this.setTechnicalFaultCount(record, 0);
    this.updatePlayerScore(record);
    return row;
  }

  setNicknameSuggestions(suggestions) {
    this.nicknameSuggestions = Array.isArray(suggestions)
      ? suggestions.filter((name) => typeof name === "string" && name.trim() !== "")
      : [];
    if (this.activeNicknameRecord) this.showNicknameSuggestions(this.activeNicknameRecord);
  }

  showNicknameSuggestions(record) {
    const suggestions = filterNicknameSuggestions(
      this.nicknameSuggestions,
      record.name.value,
    ).filter((name) => name !== record.name.value);

    this.nicknameSuggestionsList.replaceChildren();
    this.activeNicknameRecord = record;
    this.activeNicknameSuggestionIndex = -1;
    record.name.removeAttribute("aria-activedescendant");

    suggestions.forEach((suggestion, index) => {
      const option = document.createElement("li");
      option.id = `nickname-suggestion-${record.number}-${index}`;
      option.className = "nickname-suggestion";
      option.setAttribute("role", "option");
      option.textContent = suggestion;
      option.setAttribute("aria-selected", "false");
      option.addEventListener("pointermove", () => this.setActiveNicknameSuggestion(index));
      option.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.selectNicknameSuggestion(record, suggestion);
      });
      this.nicknameSuggestionsList.append(option);
    });

    const hasSuggestions = suggestions.length > 0;
    this.nicknameSuggestionsList.hidden = !hasSuggestions;
    record.name.setAttribute("aria-expanded", String(hasSuggestions));
    if (hasSuggestions) this.positionNicknameSuggestions();
  }

  hideNicknameSuggestions(record = this.activeNicknameRecord) {
    if (record && this.activeNicknameRecord !== record) return;
    if (this.activeNicknameRecord) {
      this.activeNicknameRecord.name.setAttribute("aria-expanded", "false");
      this.activeNicknameRecord.name.removeAttribute("aria-activedescendant");
    }
    this.nicknameSuggestionsList.hidden = true;
    this.nicknameSuggestionsList.replaceChildren();
    this.activeNicknameRecord = null;
    this.activeNicknameSuggestionIndex = -1;
  }

  positionNicknameSuggestions() {
    if (this.nicknameSuggestionsList.hidden || !this.activeNicknameRecord) return;
    const inputRect = this.activeNicknameRecord.name.getBoundingClientRect();
    if (inputRect.bottom < 0 || inputRect.top > window.innerHeight) {
      this.hideNicknameSuggestions();
      return;
    }

    const viewportMargin = 8;
    const gap = 2;
    const spaceBelow = window.innerHeight - inputRect.bottom - viewportMargin;
    const spaceAbove = inputRect.top - viewportMargin;
    const availableHeight = Math.max(72, Math.min(240, Math.max(spaceBelow, spaceAbove)));
    this.nicknameSuggestionsList.style.width = `${inputRect.width}px`;
    this.nicknameSuggestionsList.style.maxHeight = `${availableHeight}px`;
    this.nicknameSuggestionsList.style.left = `${Math.max(
      viewportMargin,
      Math.min(inputRect.left, window.innerWidth - inputRect.width - viewportMargin),
    )}px`;

    const popupHeight = Math.min(this.nicknameSuggestionsList.scrollHeight, availableHeight);
    const opensAbove = spaceBelow < Math.min(popupHeight, 120) && spaceAbove > spaceBelow;
    this.nicknameSuggestionsList.style.top = `${opensAbove
      ? Math.max(viewportMargin, inputRect.top - popupHeight - gap)
      : inputRect.bottom + gap}px`;
  }

  setActiveNicknameSuggestion(index) {
    const options = [...this.nicknameSuggestionsList.children];
    if (options.length === 0) return;
    this.activeNicknameSuggestionIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      option.setAttribute(
        "aria-selected",
        String(optionIndex === this.activeNicknameSuggestionIndex),
      );
    });
    const activeOption = options[this.activeNicknameSuggestionIndex];
    this.activeNicknameRecord.name.setAttribute("aria-activedescendant", activeOption.id);
    activeOption.scrollIntoView({ block: "nearest" });
  }

  handleNicknameKeydown(event, record) {
    if (event.key === "Escape") {
      this.hideNicknameSuggestions(record);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    if (this.activeNicknameRecord !== record || this.nicknameSuggestionsList.hidden) {
      this.showNicknameSuggestions(record);
    }

    const options = [...this.nicknameSuggestionsList.children];
    if (options.length === 0) return;
    if (event.key === "Enter") {
      if (this.activeNicknameSuggestionIndex < 0) return;
      event.preventDefault();
      this.selectNicknameSuggestion(
        record,
        options[this.activeNicknameSuggestionIndex].textContent,
      );
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = this.activeNicknameSuggestionIndex < 0
      ? (direction === 1 ? 0 : options.length - 1)
      : this.activeNicknameSuggestionIndex + direction;
    this.setActiveNicknameSuggestion(nextIndex);
  }

  selectNicknameSuggestion(record, suggestion) {
    record.name.value = suggestion;
    this.setSeatingStatus("");
    this.hideNicknameSuggestions(record);
    record.name.focus();
    this.onChange();
  }

  updatePlayerScore(record) {
    const lh = record.isFirstKilled ? this.bestMoveBonus : 0;
    const technicalFouls = Number(record.row.dataset.technicalFaults);
    const scores = calculateScores(
      record.role.value,
      record.extra.value,
      record.penalty.value,
      this.winner,
      lh,
      0,
      technicalFouls,
    );
    record.role.dataset.role = record.role.value;
    record.base.textContent = formatScore(scores.base);
    record.total.textContent = formatScore(scores.total);
    record.base.classList.toggle("has-value", scores.base !== null);
    record.base.classList.toggle("is-winner", scores.base === 1);
    record.total.classList.toggle("has-value", scores.total !== null);
    record.extra.title = lh > 0 ? `Допы; бонус ЛХ +${lh}` : "Допы";
    record.penalty.title = "Штрафы";
  }

  setWinner(winner) {
    this.winner = winner;
    this.records.forEach((record) => this.updatePlayerScore(record));
  }

  setFirstKilled(playerNumber, shouldNotify = true) {
    const selectedNumber = Number.isInteger(playerNumber) ? playerNumber : null;
    this.records.forEach((record) => {
      const selected = record.number === selectedNumber;
      record.isFirstKilled = selected;
      record.row.classList.toggle("is-first-killed", selected);
      record.firstKilledBadge.hidden = !selected;
      record.name.setAttribute(
        "aria-label",
        `${selected ? "Первый убиенный. " : ""}Никнейм игрока ${record.number}`,
      );
      this.updatePlayerScore(record);
    });
    if (shouldNotify) this.onChange();
  }

  setBestMoveBonus(bonus) {
    this.bestMoveBonus = bonus === 0.5 || bonus === 0.8 ? bonus : 0;
    this.records.forEach((record) => this.updatePlayerScore(record));
  }

  resetGameState() {
    this.bestMoveBonus = 0;
    this.setFirstKilled(null, false);
    this.records.forEach((record) => {
      record.role.value = "";
      record.extra.value = "";
      record.penalty.value = "";
      record.notes = "";
      record.notesButton.classList.remove("has-notes");
      record.notesButton.setAttribute("aria-label", `Открыть заметки игрока ${record.number}`);
      this.setFaultCount(record, 0);
      this.setTechnicalFaultCount(record, 0);
      this.updatePlayerScore(record);
    });
    this.activeNotesRecord = null;
    this.notesText.value = "";
    if (this.notesDialog.open) this.notesDialog.close();
    this.setSeatingStatus("");
  }

  setSeatingStatus(message, isError = false) {
    this.seatingStatus.textContent = message;
    this.seatingStatus.classList.toggle("is-error", isError);
  }

  randomizeSeating(random = Math.random) {
    const names = this.records.map((record) => record.name.value.trim());
    const firstEmptyIndex = names.findIndex((name) => name === "");
    if (firstEmptyIndex !== -1) {
      const emptyCount = names.filter((name) => name === "").length;
      this.setSeatingStatus(`Осталось заполнить: ${emptyCount}`, true);
      this.records[firstEmptyIndex].name.focus();
      return false;
    }

    const shuffledNames = shuffledCopy(names, random);
    this.records.forEach((record, index) => {
      record.name.value = shuffledNames[index];
    });
    this.setSeatingStatus("Игроки рассажены случайно");
    this.onChange();
    return true;
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
      technicalFouls: Number(record.row.dataset.technicalFaults),
      extra: record.extra.value,
      penalty: record.penalty.value,
      notes: record.notes,
      isFirstKilled: record.isFirstKilled,
      bestMoveBonus: record.isFirstKilled ? this.bestMoveBonus : 0,
    }));
  }

  restore(players) {
    if (!Array.isArray(players)) return;
    this.records.forEach((record, index) => {
      const stored = players[index];
      if (!stored || typeof stored !== "object") return;
      record.name.value = typeof stored.name === "string" ? stored.name : "";
      record.role.value = ROLE_OPTIONS.includes(stored.role) ? stored.role : "";
      const legacyExtra = Number(stored.extra);
      const storedPenalty = stored.penalty === undefined && legacyExtra < 0
        ? Math.abs(legacyExtra)
        : stored.penalty;
      restoreScoreSelect(record.extra, legacyExtra > 0 ? legacyExtra : 0);
      restoreScoreSelect(record.penalty, storedPenalty);
      record.notes = typeof stored.notes === "string" ? stored.notes : "";
      const hasNotes = record.notes.trim() !== "";
      record.notesButton.classList.toggle("has-notes", hasNotes);
      record.notesButton.setAttribute(
        "aria-label",
        `${hasNotes ? "Изменить" : "Открыть"} заметки игрока ${record.number}`,
      );
      const faults = Number(stored.faults);
      this.setFaultCount(record, Number.isInteger(faults) ? Math.min(MAX_FAULTS, Math.max(0, faults)) : 0);
      const technicalFouls = Number(stored.technicalFouls);
      this.setTechnicalFaultCount(
        record,
        Number.isInteger(technicalFouls)
          ? Math.min(MAX_TECHNICAL_FAULTS, Math.max(0, technicalFouls))
          : 0,
      );
      this.updatePlayerScore(record);
    });
    this.fillRemainingCivilianRoles();
    this.setFirstKilled(null, false);
  }
}
