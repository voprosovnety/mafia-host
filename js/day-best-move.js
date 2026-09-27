import { PLAYER_COUNT } from "./domain.js";

function validPlayerNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= PLAYER_COUNT ? number : null;
}

export function normalizeDayBestMoveState(state) {
  const storedBestMove = Array.isArray(state?.bestMove) ? state.bestMove : [];
  const playerNumber = validPlayerNumber(state?.playerNumber);
  const enabled = playerNumber !== null && (typeof state?.enabled === "boolean"
    ? state.enabled
    : storedBestMove.some((number) => validPlayerNumber(number) !== null));
  return {
    playerNumber,
    enabled,
    bestMove: [0, 1, 2].map((index) => validPlayerNumber(storedBestMove[index]))
      .map((number) => enabled ? number : null),
  };
}

export class DayBestMoveController {
  constructor({ section, playerOutput, bonusOutput, toggleButton, inputsContainer, inputs, onChange }) {
    this.section = section;
    this.playerOutput = playerOutput;
    this.bonusOutput = bonusOutput;
    this.toggleButton = toggleButton;
    this.inputsContainer = inputsContainer;
    this.inputs = [...inputs];
    this.onChange = onChange;
    this.state = normalizeDayBestMoveState(null);

    this.inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        const value = validPlayerNumber(input.value);
        this.state.bestMove[index] = value;
        input.classList.toggle("is-invalid", input.value !== "" && value === null);
        this.onChange();
      });
    });
    this.toggleButton.addEventListener("click", () => {
      this.state.enabled = !this.state.enabled;
      if (!this.state.enabled) this.state.bestMove = [null, null, null];
      this.render();
      this.onChange();
    });
    this.render();
  }

  setEligiblePlayer(playerNumber) {
    const normalizedNumber = validPlayerNumber(playerNumber);
    if (this.state.playerNumber === normalizedNumber) return;
    this.state.bestMove = [null, null, null];
    this.state.playerNumber = normalizedNumber;
    this.state.enabled = false;
    this.render();
  }

  getSelectedPlayerNumber() {
    return this.state.enabled ? this.state.playerNumber : null;
  }

  setBonus(bonus) {
    const normalizedBonus = bonus === 0.5 || bonus === 0.8 ? bonus : 0;
    this.bonusOutput.value = `+${normalizedBonus}`;
    this.bonusOutput.classList.toggle("has-value", normalizedBonus > 0);
  }

  render() {
    const available = this.state.playerNumber !== null;
    this.section.hidden = !available;
    this.playerOutput.textContent = available ? `Игрок ${this.state.playerNumber}` : "Игрок —";
    this.toggleButton.textContent = this.state.enabled ? "Убрать ДЛХ" : "Добавить ДЛХ";
    this.toggleButton.setAttribute("aria-pressed", String(this.state.enabled));
    this.bonusOutput.hidden = !this.state.enabled;
    this.inputsContainer.hidden = !this.state.enabled;
    this.inputs.forEach((input, index) => {
      input.disabled = !this.state.enabled;
      input.value = this.state.bestMove[index] ?? "";
      input.classList.remove("is-invalid");
    });
  }

  getBestMove() {
    return this.state.enabled ? [...this.state.bestMove] : [null, null, null];
  }

  getState() {
    return {
      playerNumber: this.state.playerNumber,
      enabled: this.state.enabled,
      bestMove: [...this.state.bestMove],
    };
  }

  restore(state) {
    this.state = normalizeDayBestMoveState(state);
    this.render();
  }

  reset() {
    this.state = normalizeDayBestMoveState(null);
    this.render();
    this.setBonus(0);
  }
}
