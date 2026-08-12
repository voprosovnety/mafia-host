import { PLAYER_COUNT } from "./domain.js";

function validVotingRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return [[]];
  return rounds.map((round) => {
    if (!Array.isArray(round)) return [];
    return [...new Set(round.filter((number) => (
      Number.isInteger(number) && number >= 1 && number <= PLAYER_COUNT
    )))];
  });
}

export class VotingController {
  constructor({ roundsElement, nextButton, resetButton, onChange }) {
    this.roundsElement = roundsElement;
    this.onChange = onChange;
    this.rounds = [[]];
    this.currentRoundIndex = 0;
    this.roundElements = [];
    this.nominationButtons = new Map();

    nextButton.addEventListener("click", () => this.startNextRound());
    resetButton.addEventListener("click", () => this.reset());
    this.renderAll();
  }

  registerNominationButton(playerNumber, button) {
    this.nominationButtons.set(playerNumber, button);
    this.updateNominationButtons();
  }

  createRound(roundNumber) {
    const round = document.createElement("div");
    round.className = "voting-round";
    round.classList.toggle("is-current", roundNumber === this.currentRoundIndex);
    round.dataset.round = String(roundNumber);

    const label = document.createElement("span");
    label.className = "round-label";
    label.textContent = `Круг ${roundNumber}`;
    const nominees = document.createElement("div");
    nominees.className = "nominees";
    round.append(label, nominees);
    this.roundsElement.append(round);
    this.roundElements.push({ round, nominees });
    this.renderRound(roundNumber);
  }

  renderRound(roundNumber) {
    const target = this.roundElements[roundNumber];
    if (!target) return;
    target.nominees.replaceChildren();
    const nomineeNumbers = this.rounds[roundNumber];

    if (nomineeNumbers.length === 0) {
      const empty = document.createElement("span");
      empty.className = "no-nominees";
      empty.textContent = "Никто не выставлен";
      target.nominees.append(empty);
      return;
    }

    nomineeNumbers.forEach((playerNumber) => {
      const nominee = document.createElement("span");
      nominee.className = "nominee-number";
      nominee.textContent = String(playerNumber);
      nominee.setAttribute("aria-label", `Игрок ${playerNumber} выставлен`);
      target.nominees.append(nominee);
    });
  }

  renderAll() {
    this.roundsElement.replaceChildren();
    this.roundElements = [];
    this.rounds.forEach((_, roundNumber) => this.createRound(roundNumber));
    this.updateNominationButtons();
  }

  updateNominationButtons() {
    const currentNominees = this.rounds[this.currentRoundIndex];
    this.nominationButtons.forEach((button, playerNumber) => {
      const nominated = currentNominees.includes(playerNumber);
      button.classList.toggle("is-nominated", nominated);
      button.textContent = nominated ? "Снять" : "Выставить";
      button.setAttribute("aria-pressed", String(nominated));
    });
  }

  toggleNomination(playerNumber) {
    const currentNominees = this.rounds[this.currentRoundIndex];
    const index = currentNominees.indexOf(playerNumber);
    if (index === -1) currentNominees.push(playerNumber);
    else currentNominees.splice(index, 1);
    this.renderRound(this.currentRoundIndex);
    this.updateNominationButtons();
    this.onChange();
  }

  startNextRound() {
    this.roundElements[this.currentRoundIndex].round.classList.remove("is-current");
    this.currentRoundIndex += 1;
    this.rounds.push([]);
    this.createRound(this.currentRoundIndex);
    this.updateNominationButtons();
    this.roundsElement.scrollTop = this.roundsElement.scrollHeight;
    this.onChange();
  }

  reset() {
    this.currentRoundIndex = 0;
    this.rounds = [[]];
    this.renderAll();
    this.roundsElement.scrollTop = 0;
    this.onChange();
  }

  getState() {
    return {
      currentRoundIndex: this.currentRoundIndex,
      votingRounds: this.rounds.map((round) => [...round]),
    };
  }

  restore(rounds, currentRoundIndex) {
    this.rounds = validVotingRounds(rounds);
    const storedIndex = Number(currentRoundIndex);
    this.currentRoundIndex = Number.isInteger(storedIndex)
      ? Math.min(Math.max(0, storedIndex), this.rounds.length - 1)
      : this.rounds.length - 1;
    this.renderAll();
  }
}
