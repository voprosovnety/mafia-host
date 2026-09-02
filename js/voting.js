import { PLAYER_COUNT } from "./domain.js";

function isPlayerNumber(number) {
  return Number.isInteger(number) && number >= 1 && number <= PLAYER_COUNT;
}

function uniquePlayerNumbers(numbers) {
  return [...new Set((Array.isArray(numbers) ? numbers : []).filter(isPlayerNumber))];
}

function samePlayerNumbers(first, second) {
  const firstNumbers = uniquePlayerNumbers(first).sort((left, right) => left - right);
  const secondNumbers = uniquePlayerNumbers(second).sort((left, right) => left - right);
  return firstNumbers.length === secondNumbers.length
    && firstNumbers.every((playerNumber, index) => playerNumber === secondNumbers[index]);
}

function normalizeNominations(value) {
  const nominations = Array.isArray(value) ? value : [];
  const seen = new Set();
  const assignedVoters = new Set();
  return nominations.flatMap((nomination) => {
    const playerNumber = Number.isInteger(nomination) ? nomination : nomination?.playerNumber;
    if (!isPlayerNumber(playerNumber) || seen.has(playerNumber)) return [];
    seen.add(playerNumber);
    const voters = uniquePlayerNumbers(nomination?.voters)
      .filter((number) => !assignedVoters.has(number));
    voters.forEach((number) => assignedVoters.add(number));
    return [{
      playerNumber,
      voters,
    }];
  });
}

function emptyRound(roundNumber) {
  return {
    kind: "round",
    roundNumber,
    revoteNumber: 0,
    nominations: [],
    revoteCandidates: [],
    eliminatedPlayers: [],
    noElimination: false,
    tieBreakChoice: null,
  };
}

export function normalizeVotingStages(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return [emptyRound(0)];

  let nextRegularRound = 0;
  const stages = rounds.map((round) => {
    if (Array.isArray(round)) {
      const normalized = emptyRound(nextRegularRound);
      normalized.nominations = normalizeNominations(round);
      nextRegularRound += 1;
      return normalized;
    }

    const kind = round?.kind === "revote" ? "revote" : "round";
    const storedRoundNumber = Number(round?.roundNumber);
    const roundNumber = Number.isInteger(storedRoundNumber) && storedRoundNumber >= 0
      ? storedRoundNumber
      : nextRegularRound;
    if (kind === "round") nextRegularRound = Math.max(nextRegularRound, roundNumber + 1);

    const nominations = normalizeNominations(round?.nominations ?? round?.nominees);
    const nomineeNumbers = new Set(nominations.map(({ playerNumber }) => playerNumber));
    const storedRevoteNumber = Number(round?.revoteNumber);
    const noElimination = round?.noElimination === true;
    return {
      kind,
      roundNumber,
      revoteNumber: kind === "revote" && Number.isInteger(storedRevoteNumber)
        ? Math.max(1, storedRevoteNumber)
        : 0,
      nominations,
      revoteCandidates: uniquePlayerNumbers(round?.revoteCandidates)
        .filter((number) => nomineeNumbers.has(number)),
      eliminatedPlayers: noElimination
        ? []
        : uniquePlayerNumbers(round?.eliminatedPlayers)
          .filter((number) => nomineeNumbers.has(number)),
      noElimination,
      tieBreakChoice: round?.tieBreakChoice === "lift" || round?.tieBreakChoice === "nobody"
        ? round.tieBreakChoice
        : null,
    };
  });
  stages.forEach((stage, stageIndex) => {
    if (stageHasFollowingRevote(stages, stageIndex)) {
      stage.eliminatedPlayers = [];
      stage.noElimination = false;
      stage.tieBreakChoice = null;
    }
  });
  return stages;
}

export function stageHasFollowingRevote(stages, stageIndex) {
  const stage = stages[stageIndex];
  const nextStage = stages[stageIndex + 1];
  if (!stage || nextStage?.kind !== "revote" || nextStage.roundNumber !== stage.roundNumber) return false;
  const expectedRevoteNumber = stage.kind === "revote" ? stage.revoteNumber + 1 : 1;
  return nextStage.revoteNumber === expectedRevoteNumber;
}

export function stageOutcomeSummary(stage) {
  if (stage.eliminatedPlayers.length === 1) {
    return `Покинул игру: ${stage.eliminatedPlayers[0]}`;
  }
  if (stage.eliminatedPlayers.length > 1) {
    return `Покинули игру: ${stage.eliminatedPlayers.join(", ")}`;
  }
  if (stage.noElimination) return "Никто не покинул";
  return "Исход не указан";
}

export function groupVotingStages(stages) {
  return stages.reduce((groups, stage, stageIndex) => {
    const currentGroup = groups.at(-1);
    if (currentGroup?.roundNumber === stage.roundNumber) {
      currentGroup.stageIndexes.push(stageIndex);
    } else {
      groups.push({ roundNumber: stage.roundNumber, stageIndexes: [stageIndex] });
    }
    return groups;
  }, []);
}

export function analyzeVotingStage(stage, ineligibleVoters = new Set()) {
  const eligibleVoters = new Set();
  for (let playerNumber = 1; playerNumber <= PLAYER_COUNT; playerNumber += 1) {
    if (!ineligibleVoters.has(playerNumber)) eligibleVoters.add(playerNumber);
  }

  const assignedVoters = new Set();
  const counts = stage.nominations.map(({ playerNumber, voters }) => {
    let count = 0;
    voters.forEach((voterNumber) => {
      if (!eligibleVoters.has(voterNumber) || assignedVoters.has(voterNumber)) return;
      assignedVoters.add(voterNumber);
      count += 1;
    });
    return { playerNumber, count };
  });
  const result = {
    status: "incomplete",
    assignedCount: assignedVoters.size,
    eligibleCount: eligibleVoters.size,
    leaders: [],
  };
  if (
    stage.nominations.length === 0 ||
    eligibleVoters.size === 0 ||
    assignedVoters.size !== eligibleVoters.size
  ) return result;

  const highestCount = Math.max(...counts.map(({ count }) => count));
  result.leaders = counts
    .filter(({ count }) => count === highestCount)
    .map(({ playerNumber }) => playerNumber);
  result.status = result.leaders.length === 1 ? "winner" : "tie";
  return result;
}

export function requiresTieBreak(stages, stageIndex, analysis) {
  const stage = stages[stageIndex];
  return analysis?.status === "tie"
    && stage?.kind === "revote"
    && samePlayerNumbers(
      stage.nominations.map(({ playerNumber }) => playerNumber),
      analysis.leaders,
    );
}

export function isThreeWayTieAmongNine(analysis) {
  return analysis?.eligibleCount === 9 && analysis.leaders.length === 3;
}

export function roundOutcomeSummary(stages, stageIndexes) {
  const finalStageIndex = stageIndexes.at(-1);
  if (finalStageIndex === undefined) return "Никто не покинул";
  const finalStage = stages[finalStageIndex];
  return finalStage.eliminatedPlayers.length > 0
    ? stageOutcomeSummary(finalStage)
    : "Никто не покинул";
}

export function ineligibleVotersForStage(stages, stageIndex, killedFromRound = new Map()) {
  const ineligibleVoters = new Set();
  stages.slice(0, stageIndex).forEach((stage) => {
    stage.eliminatedPlayers.forEach((playerNumber) => ineligibleVoters.add(playerNumber));
  });
  const roundNumber = stages[stageIndex]?.roundNumber;
  killedFromRound.forEach((fromRoundNumber, playerNumber) => {
    if (
      isPlayerNumber(playerNumber) &&
      Number.isInteger(roundNumber) &&
      Number.isInteger(fromRoundNumber) &&
      roundNumber >= fromRoundNumber
    ) {
      ineligibleVoters.add(playerNumber);
    }
  });
  return ineligibleVoters;
}

export function removeVoterChoices(stage, voterNumbers) {
  const removedVoters = new Set(voterNumbers);
  return {
    ...stage,
    nominations: stage.nominations.map((nomination) => ({
      ...nomination,
      voters: nomination.voters.filter((number) => !removedVoters.has(number)),
    })),
  };
}

export function setVoterChoice(stage, nomineeNumber, voterNumber, ineligibleVoters = new Set()) {
  if (
    !isPlayerNumber(nomineeNumber) ||
    !isPlayerNumber(voterNumber) ||
    ineligibleVoters.has(voterNumber)
  ) return stage;
  const currentChoice = stage.nominations.find(({ voters }) => voters.includes(voterNumber))?.playerNumber;
  return {
    ...stage,
    nominations: stage.nominations.map((nomination) => ({
      ...nomination,
      voters: nomination.voters.filter((number) => number !== voterNumber).concat(
        currentChoice !== nomineeNumber && nomination.playerNumber === nomineeNumber ? [voterNumber] : [],
      ),
    })),
  };
}

export function parseVoterSequence(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const voters = [];
  for (let index = 0; index < digits.length; index += 1) {
    const playerNumber = digits[index] === "0" ? 10 : Number(digits[index]);
    if (isPlayerNumber(playerNumber) && !voters.includes(playerNumber)) voters.push(playerNumber);
  }
  return voters;
}

export function formatVoterSequence(voterNumbers) {
  return uniquePlayerNumbers(voterNumbers)
    .map((playerNumber) => playerNumber === 10 ? "0" : String(playerNumber))
    .join("");
}

export function setNominationVoters(
  stage,
  nomineeNumber,
  voterNumbers,
  ineligibleVoters = new Set(),
) {
  if (!isPlayerNumber(nomineeNumber)) return stage;
  const selectedVoters = uniquePlayerNumbers(voterNumbers)
    .filter((voterNumber) => !ineligibleVoters.has(voterNumber));
  const selectedSet = new Set(selectedVoters);
  return {
    ...stage,
    nominations: stage.nominations.map((nomination) => ({
      ...nomination,
      voters: nomination.playerNumber === nomineeNumber
        ? selectedVoters
        : nomination.voters.filter((voterNumber) => !selectedSet.has(voterNumber)),
    })),
  };
}

export function buildRevoteStage(sourceStage, candidates = sourceStage.revoteCandidates) {
  const selected = new Set(candidates);
  const previousRevoteNumber = sourceStage.kind === "revote" ? sourceStage.revoteNumber : 0;
  return {
    kind: "revote",
    roundNumber: sourceStage.roundNumber,
    revoteNumber: previousRevoteNumber + 1,
    nominations: sourceStage.nominations
      .filter(({ playerNumber }) => selected.has(playerNumber))
      .map(({ playerNumber }) => ({ playerNumber, voters: [] })),
    revoteCandidates: [],
    eliminatedPlayers: [],
    noElimination: false,
    tieBreakChoice: null,
  };
}

export class VotingController {
  constructor({ roundsElement, nextButton, resetButton, onChange }) {
    this.roundsElement = roundsElement;
    this.nextButton = nextButton;
    this.onChange = onChange;
    this.rounds = [emptyRound(0)];
    this.currentRoundIndex = 0;
    this.roundElements = new Map();
    this.stageElements = [];
    this.collapsedRounds = new Set();
    this.nominationButtons = new Map();
    this.killedFromRound = new Map();
    this.hasAppliedNightKills = false;

    nextButton.addEventListener("click", () => this.startNextRound());
    resetButton.addEventListener("click", () => this.reset());
    this.renderAll();
  }

  registerNominationButton(playerNumber, button) {
    this.nominationButtons.set(playerNumber, button);
    this.updateNominationButtons();
  }

  stageLabel(stage) {
    if (stage.kind !== "revote") return "Голосование";
    return stage.revoteNumber > 1
      ? `Переголосование ${stage.revoteNumber}`
      : "Переголосование";
  }

  createRound(group) {
    const round = document.createElement("section");
    round.className = "voting-round";
    round.classList.toggle("is-current", group.stageIndexes.includes(this.currentRoundIndex));
    round.classList.toggle("is-collapsed", this.collapsedRounds.has(group.roundNumber));
    round.dataset.round = String(group.roundNumber);

    const header = document.createElement("button");
    header.className = "round-header";
    header.type = "button";
    header.setAttribute("aria-expanded", String(!this.collapsedRounds.has(group.roundNumber)));
    const label = document.createElement("span");
    label.className = "round-label";
    label.textContent = `Круг ${group.roundNumber}`;
    const headerMeta = document.createElement("span");
    headerMeta.className = "round-header-meta";
    const voteCount = document.createElement("span");
    voteCount.className = "round-vote-count";
    const compactOutcome = document.createElement("span");
    compactOutcome.className = "round-compact-outcome";
    headerMeta.append(voteCount, compactOutcome);
    header.append(label, headerMeta);

    const stages = document.createElement("div");
    stages.className = "voting-stages";
    stages.id = `voting-round-body-${group.roundNumber}`;
    header.setAttribute("aria-controls", stages.id);
    header.addEventListener("click", () => this.toggleRound(group.roundNumber));
    round.append(header, stages);
    this.roundsElement.append(round);
    this.roundElements.set(group.roundNumber, {
      round,
      header,
      stages,
      voteCount,
      compactOutcome,
      stageIndexes: group.stageIndexes,
    });
    group.stageIndexes.forEach((stageIndex) => this.createStage(stageIndex, stages));
    this.updateRoundHeader(group.roundNumber);
  }

  createStage(stageIndex, stages) {
    const stage = this.rounds[stageIndex];
    const stageElement = document.createElement("section");
    stageElement.className = "voting-stage";
    stageElement.classList.toggle("is-current", stageIndex === this.currentRoundIndex);
    stageElement.classList.toggle("is-revote", stage.kind === "revote");

    const header = document.createElement("div");
    header.className = "voting-stage-header";
    const label = document.createElement("span");
    label.className = "voting-stage-label";
    label.textContent = this.stageLabel(stage);
    const voteCount = document.createElement("span");
    voteCount.className = "voting-stage-vote-count";
    header.append(label, voteCount);

    const nominees = document.createElement("div");
    nominees.className = "nominees";
    const status = document.createElement("p");
    status.className = "voting-stage-status";
    const tieBreak = document.createElement("div");
    tieBreak.className = "voting-tie-break";
    stageElement.append(header, nominees, status, tieBreak);
    stages.append(stageElement);
    this.stageElements[stageIndex] = { stageElement, nominees, voteCount, status, tieBreak };
    this.renderStage(stageIndex);
  }

  toggleRound(roundNumber) {
    const target = this.roundElements.get(roundNumber);
    if (!target) return;
    const isCollapsed = !this.collapsedRounds.has(roundNumber);
    if (isCollapsed) this.collapsedRounds.add(roundNumber);
    else this.collapsedRounds.delete(roundNumber);
    target.round.classList.toggle("is-collapsed", isCollapsed);
    target.header.setAttribute("aria-expanded", String(!isCollapsed));
  }

  createVoterButton(roundIndex, nomination, voterNumber) {
    const button = document.createElement("button");
    const selected = nomination.voters.includes(voterNumber);
    const ineligibleVoters = this.getIneligibleVoters(roundIndex);
    const isIneligible = ineligibleVoters.has(voterNumber);
    const isEditable = this.isStageEditable(roundIndex);
    button.className = "voter-button";
    button.classList.toggle("is-selected", selected);
    button.type = "button";
    button.textContent = String(voterNumber);
    button.disabled = isIneligible || !isEditable;
    button.title = isIneligible
      ? `Игрок ${voterNumber} выбыл`
      : isEditable
        ? `Игрок ${voterNumber}`
        : "Завершённый круг нельзя изменить";
    button.setAttribute(
      "aria-label",
      !isEditable
        ? `Голос игрока ${voterNumber} в завершённом круге`
        : isIneligible
        ? `Игрок ${voterNumber} выбыл и больше не голосует`
        : selected
          ? `Снять голос игрока ${voterNumber} за игрока ${nomination.playerNumber}`
          : `Отметить голос игрока ${voterNumber} за игрока ${nomination.playerNumber}`,
    );
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => {
      this.recordVote(roundIndex, nomination.playerNumber, voterNumber, ineligibleVoters);
    });
    return button;
  }

  createNomination(roundIndex, nomination, isExpanded = false) {
    const card = document.createElement("article");
    card.className = "vote-card";
    const number = document.createElement("span");
    number.className = "nominee-number";
    number.textContent = String(nomination.playerNumber);
    number.setAttribute("aria-label", `Игрок ${nomination.playerNumber} выставлен`);
    const candidateLabel = document.createElement("span");
    candidateLabel.className = "candidate-label";
    candidateLabel.textContent = `Игрок ${nomination.playerNumber}`;
    const voterSequence = this.createVoterSequenceInput(roundIndex, nomination);
    const voterDetails = document.createElement("details");
    voterDetails.className = "vote-voters-details";
    voterDetails.dataset.nominee = String(nomination.playerNumber);
    voterDetails.open = isExpanded;
    const voterSummary = document.createElement("summary");
    voterSummary.textContent = `Голоса · ${nomination.voters.length}`;
    const voters = document.createElement("div");
    voters.className = "voters";
    const votersLabel = document.createElement("span");
    votersLabel.className = "voters-label";
    votersLabel.textContent = "Голосовали";
    voters.append(votersLabel);
    for (let voterNumber = 1; voterNumber <= PLAYER_COUNT; voterNumber += 1) {
      voters.append(this.createVoterButton(roundIndex, nomination, voterNumber));
    }
    voterDetails.append(voterSummary, voters);
    card.append(number, candidateLabel, voterSequence, voterDetails);
    return card;
  }

  createVoterSequenceInput(roundIndex, nomination) {
    const input = document.createElement("input");
    input.className = "voter-sequence-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "1230";
    input.value = formatVoterSequence(nomination.voters);
    input.disabled = !this.isStageEditable(roundIndex);
    input.dataset.nominee = String(nomination.playerNumber);
    input.maxLength = 10;
    input.title = "Введите номера подряд: 0 — игрок 10, поэтому 10 — это игроки 1 и 10";
    input.setAttribute(
      "aria-label",
      `Голосовавшие за игрока ${nomination.playerNumber}, введите номера подряд`,
    );
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });
    let committed = false;
    const commit = (focus = null) => {
      if (committed) return;
      committed = true;
      this.recordVoterSequence(roundIndex, nomination.playerNumber, input.value, focus);
    };
    input.addEventListener("blur", (event) => {
      const relatedInput = event.relatedTarget?.classList?.contains("voter-sequence-input")
        ? event.relatedTarget
        : null;
      commit(relatedInput ? { nomineeNumber: Number(relatedInput.dataset.nominee) } : null);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit({ afterNomineeNumber: nomination.playerNumber });
    });
    return input;
  }

  renderStage(roundIndex) {
    const target = this.stageElements?.[roundIndex];
    if (!target) return;
    const stage = this.rounds[roundIndex];
    const expandedVoters = new Set(
      [...target.nominees.querySelectorAll(".vote-voters-details[open]")]
        .map((details) => Number(details.dataset.nominee)),
    );
    target.nominees.replaceChildren();
    const analysis = analyzeVotingStage(stage, this.getIneligibleVoters(roundIndex));
    target.voteCount.textContent = `${analysis.assignedCount}/${analysis.eligibleCount} голосов`;
    target.status.textContent = this.stageStatusText(roundIndex, analysis);
    target.status.hidden = target.status.textContent.length === 0;
    target.tieBreak.replaceChildren();
    if (
      requiresTieBreak(this.rounds, roundIndex, analysis)
      && !isThreeWayTieAmongNine(analysis)
    ) {
      target.tieBreak.append(this.createTieBreakActions(roundIndex, analysis));
    }

    if (stage.nominations.length === 0) {
      const empty = document.createElement("span");
      empty.className = "no-nominees";
      empty.textContent = "Никто не выставлен";
      target.nominees.append(empty);
      this.updateRoundHeader(stage.roundNumber);
      return;
    }

    stage.nominations.forEach((nomination) => {
      target.nominees.append(this.createNomination(
        roundIndex,
        nomination,
        expandedVoters.has(nomination.playerNumber),
      ));
    });
    this.updateRoundHeader(stage.roundNumber);
  }

  stageStatusText(roundIndex, analysis) {
    const stage = this.rounds[roundIndex];
    if (stageHasFollowingRevote(this.rounds, roundIndex)) {
      return `Равенство голосов: ${stage.revoteCandidates.join(", ")} · назначено переголосование`;
    }
    if (stage.eliminatedPlayers.length === 1) {
      return `Игрок ${stage.eliminatedPlayers[0]} покидает игру`;
    }
    if (stage.eliminatedPlayers.length > 1) {
      return `Игроки ${stage.eliminatedPlayers.join(", ")} покидают игру`;
    }
    if (stage.noElimination) {
      if (requiresTieBreak(this.rounds, roundIndex, analysis) && isThreeWayTieAmongNine(analysis)) {
        return "Попил на троих при 9 голосующих · никто не покинул игру";
      }
      return "Никто не покинул игру";
    }
    if (requiresTieBreak(this.rounds, roundIndex, analysis)) {
      return `Повторный попил: ${analysis.leaders.join(", ")} · выберите исход`;
    }
    if (analysis.status === "tie") {
      return `Равенство голосов: ${analysis.leaders.join(", ")}`;
    }
    return stage.nominations.length > 0 ? "Ожидание всех голосов" : "";
  }

  createTieBreakActions(roundIndex, analysis) {
    const stage = this.rounds[roundIndex];
    const actions = document.createElement("div");
    actions.className = "tie-break-actions";
    const hint = document.createElement("span");
    hint.className = "tie-break-hint";
    hint.textContent = "Подъём: все игроки с равным числом голосов покидают игру.";
    const liftButton = document.createElement("button");
    liftButton.className = "tie-break-button is-lift";
    liftButton.classList.toggle("is-selected", stage.tieBreakChoice === "lift");
    liftButton.type = "button";
    liftButton.textContent = `Подъём · ${analysis.leaders.join(", ")}`;
    liftButton.setAttribute("aria-pressed", String(stage.tieBreakChoice === "lift"));
    liftButton.addEventListener("click", () => this.resolveTieBreak(roundIndex, "lift"));
    const nobodyButton = document.createElement("button");
    nobodyButton.className = "tie-break-button";
    nobodyButton.classList.toggle("is-selected", stage.tieBreakChoice === "nobody");
    nobodyButton.type = "button";
    nobodyButton.textContent = "Никто не покинул";
    nobodyButton.setAttribute("aria-pressed", String(stage.tieBreakChoice === "nobody"));
    nobodyButton.addEventListener("click", () => this.resolveTieBreak(roundIndex, "nobody"));
    actions.append(hint, liftButton, nobodyButton);
    return actions;
  }

  updateRoundHeader(roundNumber) {
    const target = this.roundElements.get(roundNumber);
    if (!target) return;
    const finalStageIndex = target.stageIndexes.at(-1);
    const finalStage = this.rounds[finalStageIndex];
    const analysis = analyzeVotingStage(finalStage, this.getIneligibleVoters(finalStageIndex));
    const stagePrefix = finalStage.kind === "revote" ? `${this.stageLabel(finalStage)} · ` : "";
    target.voteCount.textContent = `${stagePrefix}${analysis.assignedCount}/${analysis.eligibleCount} голосов`;
    target.compactOutcome.textContent = roundOutcomeSummary(this.rounds, target.stageIndexes);
  }

  renderAll() {
    this.roundsElement.replaceChildren();
    this.roundElements = new Map();
    this.stageElements = [];
    const groups = groupVotingStages(this.rounds);
    const availableRoundNumbers = new Set(groups.map(({ roundNumber }) => roundNumber));
    this.collapsedRounds = new Set(
      [...this.collapsedRounds].filter((roundNumber) => availableRoundNumbers.has(roundNumber)),
    );
    groups.forEach((group) => this.createRound(group));
    this.updateNominationButtons();
    this.updateNextButton();
  }

  updateNominationButtons() {
    const nominationStageIndex = this.getCurrentNominationStageIndex();
    const currentNominees = this.rounds[nominationStageIndex].nominations
      .map(({ playerNumber }) => playerNumber);
    const isRevote = this.currentRoundIndex !== nominationStageIndex;
    this.nominationButtons.forEach((button, playerNumber) => {
      const nominated = currentNominees.includes(playerNumber);
      const playerRow = button.closest(".player-row");
      playerRow?.classList.toggle("is-nominated", nominated);
      button.classList.toggle("is-nominated", nominated);
      button.disabled = false;
      button.textContent = isRevote && nominated ? "В круге" : nominated ? "Снять" : "Выставить";
      button.setAttribute("aria-pressed", String(nominated));
      button.title = isRevote ? "Изменение состава перестроит переголосование" : "";
    });
  }

  getCurrentNominationStageIndex() {
    const currentRoundNumber = this.rounds[this.currentRoundIndex].roundNumber;
    const stageIndex = this.rounds.findIndex((stage) => (
      stage.roundNumber === currentRoundNumber && stage.kind === "round"
    ));
    return stageIndex === -1 ? this.currentRoundIndex : stageIndex;
  }

  isStageEditable(roundIndex) {
    return this.rounds[roundIndex].roundNumber === this.rounds[this.currentRoundIndex].roundNumber;
  }

  updateNextButton() {
    const stage = this.rounds[this.currentRoundIndex];
    const canStartNextRound = stage.nominations.length === 0
      || stage.noElimination
      || stage.eliminatedPlayers.length > 0;
    this.nextButton.disabled = !canStartNextRound;
    this.nextButton.title = canStartNextRound ? "" : "Сначала распределите все голоса";
  }

  getIneligibleVoters(roundIndex) {
    return ineligibleVotersForStage(this.rounds, roundIndex, this.killedFromRound);
  }

  reconcileVotingEligibility(
    fromRoundIndex,
    recalculateOutcomes = false,
    previousKilledFromRound = this.killedFromRound,
    completeMissingOutcome = false,
  ) {
    const changedStageIndexes = [];
    for (let roundIndex = fromRoundIndex; roundIndex < this.rounds.length; roundIndex += 1) {
      const ineligibleVoters = this.getIneligibleVoters(roundIndex);
      const previousIneligibleVoters = ineligibleVotersForStage(
        this.rounds,
        roundIndex,
        previousKilledFromRound,
      );
      const eligibilityChanged = ineligibleVoters.size !== previousIneligibleVoters.size
        || [...ineligibleVoters].some((playerNumber) => !previousIneligibleVoters.has(playerNumber));
      const stage = this.rounds[roundIndex];
      const cleanedStage = removeVoterChoices(stage, ineligibleVoters);
      const votesChanged = JSON.stringify(stage.nominations) !== JSON.stringify(cleanedStage.nominations);
      if (
        eligibilityChanged
        || votesChanged
      ) {
        cleanedStage.tieBreakChoice = null;
        changedStageIndexes.push(roundIndex);
      }
      this.rounds[roundIndex] = cleanedStage;
    }
    if (recalculateOutcomes) {
      for (const stageIndex of changedStageIndexes) {
        if (stageIndex >= this.rounds.length) break;
        if (this.synchronizeResolution(stageIndex)) break;
      }
    }
    if (completeMissingOutcome) this.completeRestoredMissingOutcomes();
    this.renderAll();
  }

  completeRestoredMissingOutcomes() {
    for (let stageIndex = 0; stageIndex < this.rounds.length; stageIndex += 1) {
      const stage = this.rounds[stageIndex];
      const ineligibleVoters = this.getIneligibleVoters(stageIndex);
      this.rounds[stageIndex] = removeVoterChoices(stage, ineligibleVoters);
      if (this.resolutionSignature(stageIndex) !== "incomplete") continue;

      const analysis = analyzeVotingStage(this.rounds[stageIndex], ineligibleVoters);
      if (analysis.status === "winner") {
        this.rounds[stageIndex].eliminatedPlayers = [analysis.leaders[0]];
        continue;
      }
      if (analysis.status !== "tie") continue;

      const hasLaterRound = this.rounds
        .slice(stageIndex + 1)
        .some((laterStage) => laterStage.roundNumber !== stage.roundNumber);
      if (hasLaterRound) {
        this.rounds[stageIndex].noElimination = true;
      } else {
        this.synchronizeResolution(stageIndex);
        break;
      }
    }
  }

  setNightKills(kills) {
    const previousKilledFromRound = this.killedFromRound;
    const killedFromRound = new Map();
    (Array.isArray(kills) ? kills : []).forEach((kill) => {
      const playerNumber = kill?.playerNumber;
      const fromRoundNumber = kill?.fromRoundNumber;
      if (
        !isPlayerNumber(playerNumber) ||
        !Number.isInteger(fromRoundNumber) ||
        fromRoundNumber < 1
      ) return;
      const existingRound = killedFromRound.get(playerNumber);
      if (existingRound === undefined || fromRoundNumber < existingRound) {
        killedFromRound.set(playerNumber, fromRoundNumber);
      }
    });
    this.killedFromRound = killedFromRound;
    const completeMissingOutcome = !this.hasAppliedNightKills;
    const recalculateOutcomes = this.hasAppliedNightKills;
    this.hasAppliedNightKills = true;
    this.reconcileVotingEligibility(
      0,
      recalculateOutcomes,
      previousKilledFromRound,
      completeMissingOutcome,
    );
  }

  toggleNomination(playerNumber) {
    const nominationStageIndex = this.getCurrentNominationStageIndex();
    const stage = this.rounds[nominationStageIndex];
    const index = stage.nominations.findIndex((nomination) => nomination.playerNumber === playerNumber);
    if (index === -1) {
      stage.nominations.push({ playerNumber, voters: [] });
    } else {
      stage.nominations.splice(index, 1);
      stage.revoteCandidates = stage.revoteCandidates.filter((number) => number !== playerNumber);
      stage.eliminatedPlayers = stage.eliminatedPlayers.filter((number) => number !== playerNumber);
    }
    const structureChanged = this.synchronizeResolution(nominationStageIndex);
    if (structureChanged) this.renderAll();
    else {
      this.renderStage(nominationStageIndex);
      this.updateNominationButtons();
      this.updateNextButton();
    }
    this.onChange();
  }

  recordVote(roundIndex, nomineeNumber, voterNumber, ineligibleVoters) {
    this.rounds[roundIndex] = setVoterChoice(
      this.rounds[roundIndex],
      nomineeNumber,
      voterNumber,
      ineligibleVoters,
    );
    this.rounds[roundIndex].tieBreakChoice = null;
    const structureChanged = this.synchronizeResolution(roundIndex);
    if (structureChanged) this.renderAll();
    else {
      this.renderStage(roundIndex);
      this.updateNextButton();
    }
    if (structureChanged) this.roundsElement.scrollTop = this.roundsElement.scrollHeight;
    this.onChange();
  }

  recordVoterSequence(roundIndex, nomineeNumber, value, focus = null) {
    this.rounds[roundIndex] = setNominationVoters(
      this.rounds[roundIndex],
      nomineeNumber,
      parseVoterSequence(value),
      this.getIneligibleVoters(roundIndex),
    );
    this.rounds[roundIndex].tieBreakChoice = null;
    const structureChanged = this.synchronizeResolution(roundIndex);
    if (structureChanged) this.renderAll();
    else {
      this.renderStage(roundIndex);
      this.updateNextButton();
    }
    if (structureChanged) this.roundsElement.scrollTop = this.roundsElement.scrollHeight;
    if (structureChanged) this.focusVoterSequence(this.currentRoundIndex);
    else if (focus) this.focusVoterSequence(roundIndex, focus);
    this.onChange();
  }

  focusVoterSequence(roundIndex, { nomineeNumber, afterNomineeNumber } = {}) {
    const target = this.stageElements?.[roundIndex];
    if (!target) return;
    const inputs = [...target.nominees.querySelectorAll(".voter-sequence-input:not(:disabled)")];
    let input = Number.isInteger(nomineeNumber)
      ? inputs.find((candidate) => Number(candidate.dataset.nominee) === nomineeNumber)
      : null;
    if (!input && Number.isInteger(afterNomineeNumber)) {
      const currentIndex = inputs.findIndex(
        (candidate) => Number(candidate.dataset.nominee) === afterNomineeNumber,
      );
      input = inputs[currentIndex + 1];
    }
    if (!input && !Number.isInteger(afterNomineeNumber)) input = inputs[0];
    input?.focus({ preventScroll: true });
  }

  resolutionSignature(stageIndex) {
    const stage = this.rounds[stageIndex];
    const analysis = analyzeVotingStage(stage, this.getIneligibleVoters(stageIndex));
    if (stageHasFollowingRevote(this.rounds, stageIndex)) {
      return `tie:${stage.revoteCandidates.join(",")}`;
    }
    if (stage.eliminatedPlayers.length === 1) return `winner:${stage.eliminatedPlayers[0]}`;
    if (
      stage.tieBreakChoice === "lift"
      && requiresTieBreak(this.rounds, stageIndex, analysis)
      && samePlayerNumbers(stage.eliminatedPlayers, analysis.leaders)
    ) return `lift:${analysis.leaders.join(",")}`;
    if (
      stage.tieBreakChoice === "nobody"
      && stage.noElimination
      && requiresTieBreak(this.rounds, stageIndex, analysis)
    ) return "tie-break-nobody";
    if (stage.noElimination) return "nobody";
    return "incomplete";
  }

  synchronizeResolution(stageIndex) {
    const stage = this.rounds[stageIndex];
    const analysis = analyzeVotingStage(stage, this.getIneligibleVoters(stageIndex));
    const tieBreakRequired = requiresTieBreak(this.rounds, stageIndex, analysis);
    const automaticNoElimination = tieBreakRequired && isThreeWayTieAmongNine(analysis);
    const desiredSignature = analysis.status === "winner"
      ? `winner:${analysis.leaders[0]}`
      : analysis.status === "tie"
        ? automaticNoElimination
          ? "nobody"
          : tieBreakRequired
            ? stage.tieBreakChoice === "lift" && samePlayerNumbers(stage.eliminatedPlayers, analysis.leaders)
              ? `lift:${analysis.leaders.join(",")}`
              : stage.tieBreakChoice === "nobody" && stage.noElimination
                ? "tie-break-nobody"
                : `tie-break:${analysis.leaders.join(",")}`
            : `tie:${analysis.leaders.join(",")}`
        : "incomplete";
    if (this.resolutionSignature(stageIndex) === desiredSignature) return false;

    const hadFollowingStages = stageIndex < this.rounds.length - 1;
    this.rounds.splice(stageIndex + 1);
    this.currentRoundIndex = stageIndex;
    stage.revoteCandidates = [];
    stage.eliminatedPlayers = [];
    stage.noElimination = false;
    stage.tieBreakChoice = null;

    if (analysis.status === "winner") {
      stage.eliminatedPlayers = [analysis.leaders[0]];
    } else if (analysis.status === "tie") {
      stage.revoteCandidates = [...analysis.leaders];
      if (automaticNoElimination) {
        stage.noElimination = true;
      } else if (!tieBreakRequired) {
        this.rounds.push(buildRevoteStage(stage, analysis.leaders));
        this.currentRoundIndex = stageIndex + 1;
      }
    }
    return hadFollowingStages || (analysis.status === "tie" && !tieBreakRequired);
  }

  resolveTieBreak(roundIndex, choice) {
    const stage = this.rounds[roundIndex];
    const analysis = analyzeVotingStage(stage, this.getIneligibleVoters(roundIndex));
    if (
      !["lift", "nobody"].includes(choice)
      || !requiresTieBreak(this.rounds, roundIndex, analysis)
      || isThreeWayTieAmongNine(analysis)
    ) return;

    stage.revoteCandidates = [...analysis.leaders];
    stage.tieBreakChoice = choice;
    stage.eliminatedPlayers = choice === "lift" ? [...analysis.leaders] : [];
    stage.noElimination = choice === "nobody";
    this.renderStage(roundIndex);
    this.updateNextButton();
    this.onChange();
  }

  startNextRound() {
    const currentStage = this.rounds[this.currentRoundIndex];
    if (
      currentStage.nominations.length > 0
      && currentStage.eliminatedPlayers.length === 0
      && !currentStage.noElimination
    ) return;
    if (currentStage.nominations.length === 0) currentStage.noElimination = true;
    const nextRoundNumber = this.rounds.reduce(
      (maximum, stage) => stage.kind === "round" ? Math.max(maximum, stage.roundNumber + 1) : maximum,
      0,
    );
    this.currentRoundIndex = this.rounds.length;
    this.rounds.push(emptyRound(nextRoundNumber));
    this.renderAll();
    this.roundsElement.scrollTop = this.roundsElement.scrollHeight;
    this.onChange();
  }

  reset() {
    this.currentRoundIndex = 0;
    this.rounds = [emptyRound(0)];
    this.collapsedRounds.clear();
    this.renderAll();
    this.roundsElement.scrollTop = 0;
    this.onChange();
  }

  getState() {
    return {
      currentRoundIndex: this.currentRoundIndex,
      votingRounds: this.rounds.map((stage) => ({
        ...stage,
        nominations: stage.nominations.map((nomination) => ({
          ...nomination,
          voters: [...nomination.voters],
        })),
        revoteCandidates: [...stage.revoteCandidates],
        eliminatedPlayers: [...stage.eliminatedPlayers],
        noElimination: stage.noElimination,
        tieBreakChoice: stage.tieBreakChoice,
      })),
    };
  }

  restore(rounds, currentRoundIndex) {
    this.rounds = normalizeVotingStages(rounds);
    this.collapsedRounds.clear();
    this.hasAppliedNightKills = false;
    const storedIndex = Number(currentRoundIndex);
    this.currentRoundIndex = Number.isInteger(storedIndex)
      ? Math.min(Math.max(0, storedIndex), this.rounds.length - 1)
      : this.rounds.length - 1;
    this.renderAll();
  }
}
