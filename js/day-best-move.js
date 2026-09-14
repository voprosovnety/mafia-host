import { PLAYER_COUNT } from "./domain.js";

function validPlayerNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= PLAYER_COUNT ? number : null;
}

export function normalizeDayBestMoveState(state) {
  const storedBestMove = Array.isArray(state?.bestMove) ? state.bestMove : [];
  const playerNumber = validPlayerNumber(state?.playerNumber);
  return {
    playerNumber,
    bestMove: [0, 1, 2].map((index) => validPlayerNumber(storedBestMove[index]))
      .map((number) => playerNumber === null ? null : number),
  };
}

export class DayBestMoveController {
  constructor({ playerOutput, bonusOutput, inputs, onChange }) {
    this.playerOutput = playerOutput;
    this.bonusOutput = bonusOutput;
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
    this.render();
  }

  setEligiblePlayer(playerNumber) {
    const normalizedNumber = validPlayerNumber(playerNumber);
    if (this.state.playerNumber === normalizedNumber) return;
    this.state.bestMove = [null, null, null];
    this.state.playerNumber = normalizedNumber;
    this.render();
  }

  setBonus(bonus) {
    const normalizedBonus = bonus === 0.5 || bonus === 0.8 ? bonus : 0;
    this.bonusOutput.value = `+${normalizedBonus}`;
    this.bonusOutput.classList.toggle("has-value", normalizedBonus > 0);
  }

  render() {
    const available = this.state.playerNumber !== null;
    this.playerOutput.textContent = available ? `Игрок ${this.state.playerNumber}` : "Игрок —";
    this.inputs.forEach((input, index) => {
      input.disabled = !available;
      input.value = this.state.bestMove[index] ?? "";
      input.classList.remove("is-invalid");
      input.title = available
        ? ""
        : "ДЛХ доступен игроку, явно проголосовавшему не в себя перед выходом в круге 0";
    });
  }

  getBestMove() {
    return [...this.state.bestMove];
  }

  getState() {
    return {
      playerNumber: this.state.playerNumber,
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
