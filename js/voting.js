import { PLAYER_COUNT } from "./domain.js";

function isPlayerNumber(number) {
  return Number.isInteger(number) && number >= 1 && number <= PLAYER_COUNT;
}

function uniquePlayerNumbers(numbers) {
  return [...new Set((Array.isArray(numbers) ? numbers : []).filter(isPlayerNumber))];
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
    };
  });
  stages.forEach((stage, stageIndex) => {
    if (stageHasFollowingRevote(stages, stageIndex)) {
      stage.eliminatedPlayers = [];
      stage.noElimination = false;
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

export function buildRevoteStage(sourceStage) {
  const selected = new Set(sourceStage.revoteCandidates);
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
  };
}

export class VotingController {
  constructor({ roundsElement, nextButton, resetButton, onChange }) {
    this.roundsElement = roundsElement;
    this.onChange = onChange;
    this.rounds = [emptyRound(0)];
    this.currentRoundIndex = 0;
    this.roundElements = [];
    this.nominationButtons = new Map();
    this.killedFromRound = new Map();

    nextButton.addEventListener("click", () => this.startNextRound());
    resetButton.addEventListener("click", () => this.reset());
    this.renderAll();
  }

  registerNominationButton(playerNumber, button) {
    this.nominationButtons.set(playerNumber, button);
    this.updateNominationButtons();
  }

  stageLabel(stage) {
    if (stage.kind !== "revote") return `Круг ${stage.roundNumber}`;
    return stage.revoteNumber > 1
      ? `Переголос. ${stage.revoteNumber} · круг ${stage.roundNumber}`
      : `Переголосование · круг ${stage.roundNumber}`;
  }

  createRound(roundIndex) {
    const stage = this.rounds[roundIndex];
    const round = document.createElement("section");
    round.className = "voting-round";
    round.classList.toggle("is-current", roundIndex === this.currentRoundIndex);
    round.classList.toggle("is-revote", stage.kind === "revote");
    round.dataset.round = String(roundIndex);

    const header = document.createElement("div");
    header.className = "round-header";
    const label = document.createElement("span");
    label.className = "round-label";
    label.textContent = this.stageLabel(stage);
    const voteCount = document.createElement("span");
    voteCount.className = "round-vote-count";
    header.append(label, voteCount);

    const nominees = document.createElement("div");
    nominees.className = "nominees";
    round.append(header, nominees);
    this.roundsElement.append(round);
    this.roundElements.push({ round, nominees, voteCount });
    this.renderRound(roundIndex);
  }

  createVoterButton(roundIndex, nomination, voterNumber) {
    const button = document.createElement("button");
    const selected = nomination.voters.includes(voterNumber);
    const ineligibleVoters = this.getIneligibleVoters(roundIndex);
    const isIneligible = ineligibleVoters.has(voterNumber);
    button.className = "voter-button";
    button.classList.toggle("is-selected", selected);
    button.type = "button";
    button.textContent = String(voterNumber);
    button.disabled = isIneligible;
    button.title = isIneligible ? `Игрок ${voterNumber} выбыл` : `Игрок ${voterNumber}`;
    button.setAttribute(
      "aria-label",
      isIneligible
        ? `Игрок ${voterNumber} выбыл и больше не голосует`
        : selected
          ? `Снять голос игрока ${voterNumber} за игрока ${nomination.playerNumber}`
          : `Отметить голос игрока ${voterNumber} за игрока ${nomination.playerNumber}`,
    );
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => {
      this.rounds[roundIndex] = setVoterChoice(
        this.rounds[roundIndex],
        nomination.playerNumber,
        voterNumber,
        ineligibleVoters,
      );
      this.renderRound(roundIndex);
      this.onChange();
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
    card.append(number, candidateLabel, voterDetails);
    return card;
  }

  createSelectionButton({ playerNumber, selected, label, onClick }) {
    const button = document.createElement("button");
    button.className = "voting-selection-button";
    button.classList.toggle("is-selected", selected);
    button.type = "button";
    button.textContent = String(playerNumber);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", label);
    button.addEventListener("click", onClick);
    return button;
  }

  createRoundTool(summaryText, className, wasOpen = false) {
    const details = document.createElement("details");
    details.className = `round-tool ${className}`;
    details.open = wasOpen;
    const summary = document.createElement("summary");
    summary.textContent = summaryText;
    const body = document.createElement("div");
    body.className = "round-tool-body";
    details.append(summary, body);
    return { details, body };
  }

  createRevoteTool(roundIndex, wasOpen) {
    const stage = this.rounds[roundIndex];
    const count = stage.revoteCandidates.length;
    const tool = this.createRoundTool(
      count ? `Переголосование · ${count}` : "Переголосование",
      "revote-tool",
      wasOpen,
    );
    const hint = document.createElement("span");
    hint.className = "round-tool-hint";
    hint.textContent = "Кто проходит дальше";
    const choices = document.createElement("div");
    choices.className = "voting-selection-buttons";
    stage.nominations.forEach(({ playerNumber }) => {
      const selected = stage.revoteCandidates.includes(playerNumber);
      choices.append(this.createSelectionButton({
        playerNumber,
        selected,
        label: `${selected ? "Убрать игрока" : "Добавить игрока"} ${playerNumber} ${selected ? "из" : "в"} переголосование`,
        onClick: () => this.toggleRevoteCandidate(playerNumber),
      }));
    });
    const action = document.createElement("button");
    action.className = "create-revote-button";
    action.type = "button";
    action.disabled = count < 2;
    action.textContent = count < 2 ? "Выберите минимум двух" : `Создать · ${count}`;
    action.addEventListener("click", () => this.startRevote());
    tool.body.append(hint, choices, action);
    return tool.details;
  }

  createOutcomeTool(roundIndex, wasOpen) {
    const stage = this.rounds[roundIndex];
    const selected = stage.eliminatedPlayers;
    const summary = stage.noElimination
      ? "Исход · никто не ушёл"
      : selected.length
        ? `Исход · покинули: ${selected.join(", ")}`
        : "Исход голосования";
    const tool = this.createRoundTool(summary, "outcome-tool", wasOpen);
    const hint = document.createElement("span");
    hint.className = "round-tool-hint";
    hint.textContent = "Кто покинул стол";
    const choices = document.createElement("div");
    choices.className = "voting-selection-buttons";
    const noElimination = document.createElement("button");
    noElimination.className = "voting-selection-button outcome-none-button";
    noElimination.classList.toggle("is-selected", stage.noElimination);
    noElimination.type = "button";
    noElimination.textContent = "× Никто";
    noElimination.setAttribute("aria-pressed", String(stage.noElimination));
    noElimination.setAttribute(
      "aria-label",
      stage.noElimination
        ? "Снять отметку: никто не ушёл"
        : "Отметить: никто не ушёл после голосования",
    );
    noElimination.addEventListener("click", () => this.toggleNoElimination(roundIndex));
    choices.append(noElimination);
    stage.nominations.forEach(({ playerNumber }) => {
      const isSelected = selected.includes(playerNumber);
      choices.append(this.createSelectionButton({
        playerNumber,
        selected: isSelected,
        label: `${isSelected ? "Убрать игрока" : "Отметить игрока"} ${playerNumber} ${isSelected ? "из исхода" : "покинувшим стол"}`,
        onClick: () => this.toggleEliminatedPlayer(roundIndex, playerNumber),
      }));
    });
    tool.body.append(hint, choices);
    return tool.details;
  }

  renderRound(roundIndex) {
    const target = this.roundElements[roundIndex];
    if (!target) return;
    const stage = this.rounds[roundIndex];
    const expandedVoters = new Set(
      [...target.nominees.querySelectorAll(".vote-voters-details[open]")]
        .map((details) => Number(details.dataset.nominee)),
    );
    const revoteOpen = Boolean(target.nominees.querySelector(".revote-tool[open]"));
    const outcomeOpen = Boolean(target.nominees.querySelector(".outcome-tool[open]"));
    target.nominees.replaceChildren();
    const assignedVotes = new Set(stage.nominations.flatMap(({ voters }) => voters)).size;
    const eligibleVoterCount = PLAYER_COUNT - this.getIneligibleVoters(roundIndex).size;
    target.voteCount.textContent = `${assignedVotes}/${eligibleVoterCount} голосов`;

    if (stage.nominations.length === 0) {
      const empty = document.createElement("span");
      empty.className = "no-nominees";
      empty.textContent = "Никто не выставлен";
      target.nominees.append(empty);
      return;
    }

    stage.nominations.forEach((nomination) => {
      target.nominees.append(this.createNomination(
        roundIndex,
        nomination,
        expandedVoters.has(nomination.playerNumber),
      ));
    });

    const tools = document.createElement("div");
    tools.className = "round-tools";
    if (roundIndex === this.currentRoundIndex) {
      tools.append(this.createRevoteTool(roundIndex, revoteOpen));
    }
    if (!stageHasFollowingRevote(this.rounds, roundIndex)) {
      tools.append(this.createOutcomeTool(roundIndex, outcomeOpen));
    }
    if (tools.childElementCount > 0) target.nominees.append(tools);
  }

  renderAll() {
    this.roundsElement.replaceChildren();
    this.roundElements = [];
    this.rounds.forEach((_, roundIndex) => this.createRound(roundIndex));
    this.updateNominationButtons();
  }

  updateNominationButtons() {
    const currentNominees = this.rounds[this.currentRoundIndex].nominations
      .map(({ playerNumber }) => playerNumber);
    this.nominationButtons.forEach((button, playerNumber) => {
      const nominated = currentNominees.includes(playerNumber);
      button.classList.toggle("is-nominated", nominated);
      button.textContent = nominated ? "Снять" : "Выставить";
      button.setAttribute("aria-pressed", String(nominated));
    });
  }

  getIneligibleVoters(roundIndex) {
    return ineligibleVotersForStage(this.rounds, roundIndex, this.killedFromRound);
  }

  reconcileVotingEligibility(fromRoundIndex) {
    for (let roundIndex = fromRoundIndex; roundIndex < this.rounds.length; roundIndex += 1) {
      const ineligibleVoters = this.getIneligibleVoters(roundIndex);
      this.rounds[roundIndex] = removeVoterChoices(this.rounds[roundIndex], ineligibleVoters);
      this.renderRound(roundIndex);
    }
  }

  setNightKills(kills) {
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
    this.reconcileVotingEligibility(0);
  }

  toggleNomination(playerNumber) {
    const stage = this.rounds[this.currentRoundIndex];
    const index = stage.nominations.findIndex((nomination) => nomination.playerNumber === playerNumber);
    if (index === -1) {
      stage.nominations.push({ playerNumber, voters: [] });
    } else {
      stage.nominations.splice(index, 1);
      stage.revoteCandidates = stage.revoteCandidates.filter((number) => number !== playerNumber);
      stage.eliminatedPlayers = stage.eliminatedPlayers.filter((number) => number !== playerNumber);
    }
    this.renderRound(this.currentRoundIndex);
    this.updateNominationButtons();
    this.onChange();
  }

  toggleRevoteCandidate(playerNumber) {
    const stage = this.rounds[this.currentRoundIndex];
    const index = stage.revoteCandidates.indexOf(playerNumber);
    if (index === -1) stage.revoteCandidates.push(playerNumber);
    else stage.revoteCandidates.splice(index, 1);
    this.renderRound(this.currentRoundIndex);
    this.onChange();
  }

  toggleEliminatedPlayer(roundIndex, playerNumber) {
    const stage = this.rounds[roundIndex];
    const index = stage.eliminatedPlayers.indexOf(playerNumber);
    if (index === -1) {
      stage.eliminatedPlayers.push(playerNumber);
      stage.noElimination = false;
    }
    else stage.eliminatedPlayers.splice(index, 1);
    this.renderRound(roundIndex);
    this.reconcileVotingEligibility(roundIndex + 1);
    this.onChange();
  }

  toggleNoElimination(roundIndex) {
    const stage = this.rounds[roundIndex];
    stage.noElimination = !stage.noElimination;
    if (stage.noElimination) stage.eliminatedPlayers = [];
    this.renderRound(roundIndex);
    this.reconcileVotingEligibility(roundIndex + 1);
    this.onChange();
  }

  setCurrentRound(roundIndex) {
    const previousRoundIndex = this.currentRoundIndex;
    this.roundElements[previousRoundIndex]?.round.classList.remove("is-current");
    this.currentRoundIndex = roundIndex;
    this.renderRound(previousRoundIndex);
  }

  startNextRound() {
    const nextRoundNumber = this.rounds.reduce(
      (maximum, stage) => stage.kind === "round" ? Math.max(maximum, stage.roundNumber + 1) : maximum,
      0,
    );
    this.setCurrentRound(this.rounds.length);
    this.rounds.push(emptyRound(nextRoundNumber));
    this.createRound(this.currentRoundIndex);
    this.updateNominationButtons();
    this.roundsElement.scrollTop = this.roundsElement.scrollHeight;
    this.onChange();
  }

  startRevote() {
    const sourceStage = this.rounds[this.currentRoundIndex];
    if (sourceStage.revoteCandidates.length < 2) return;
    const sourceRoundIndex = this.currentRoundIndex;
    sourceStage.eliminatedPlayers = [];
    sourceStage.noElimination = false;
    this.setCurrentRound(this.rounds.length);
    this.rounds.push(buildRevoteStage(sourceStage));
    this.renderRound(sourceRoundIndex);
    this.createRound(this.currentRoundIndex);
    this.updateNominationButtons();
    this.roundsElement.scrollTop = this.roundsElement.scrollHeight;
    this.onChange();
  }

  reset() {
    this.currentRoundIndex = 0;
    this.rounds = [emptyRound(0)];
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
      })),
    };
  }

  restore(rounds, currentRoundIndex) {
    this.rounds = normalizeVotingStages(rounds);
    const storedIndex = Number(currentRoundIndex);
    this.currentRoundIndex = Number.isInteger(storedIndex)
      ? Math.min(Math.max(0, storedIndex), this.rounds.length - 1)
      : this.rounds.length - 1;
    this.renderAll();
  }
}
