import { PLAYER_COUNT } from "./domain.js";

function validPlayerNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= PLAYER_COUNT ? number : null;
}

export function normalizeNightState(state) {
  const storedShots = Array.isArray(state?.shots) ? state.shots : [];
  const shots = storedShots.map((shot) => {
    const miss = shot?.miss === true;
    return {
      target: miss ? null : validPlayerNumber(shot?.target),
      miss,
    };
  });
  const storedBestMove = Array.isArray(state?.bestMove) ? state.bestMove : [];
  const bestMoveAvailable = shots[0]?.miss !== true;
  return {
    shots: shots.length > 0 ? shots : [{ target: null, miss: false }],
    bestMove: [0, 1, 2].map((index) => (
      bestMoveAvailable ? validPlayerNumber(storedBestMove[index]) : null
    )),
  };
}

export function bestMoveAvailableFromNightState(state) {
  return state?.shots?.[0]?.miss !== true;
}

export function killedPlayersFromNightState(state) {
  return nightKillsFromNightState(state).map(({ playerNumber }) => playerNumber);
}

export function nightKillsFromNightState(state) {
  const shots = Array.isArray(state?.shots) ? state.shots : [];
  const firstKillByPlayer = new Map();
  shots.forEach((shot, index) => {
    const target = shot?.miss === true ? null : validPlayerNumber(shot?.target);
    if (target !== null && !firstKillByPlayer.has(target)) {
      firstKillByPlayer.set(target, index + 1);
    }
  });
  return [...firstKillByPlayer].map(([playerNumber, fromRoundNumber]) => ({
    playerNumber,
    fromRoundNumber,
  }));
}

export function firstKilledPlayerFromNightState(state) {
  const firstNight = Array.isArray(state?.shots) ? state.shots[0] : null;
  return firstNight?.miss === true ? null : validPlayerNumber(firstNight?.target);
}

export class NightController {
  constructor({
    shotsList,
    addNightButton,
    addMissNightButton,
    firstKilledOutput,
    bestMoveBonusOutput,
    bestMoveInputs,
    onChange,
  }) {
    this.shotsList = shotsList;
    this.firstKilledOutput = firstKilledOutput;
    this.bestMoveBonusOutput = bestMoveBonusOutput;
    this.bestMoveInputs = [...bestMoveInputs];
    this.onChange = onChange;
    this.state = normalizeNightState(null);

    addNightButton.addEventListener("click", () => {
      this.addNight({ target: null, miss: false });
      this.shotsList.querySelector(".night-shot-row:last-child .shot-target")?.focus();
    });
    addMissNightButton.addEventListener("click", () => {
      this.addNight({ target: null, miss: true });
    });
    this.bestMoveInputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        const value = validPlayerNumber(input.value);
        this.state.bestMove[index] = value;
        input.classList.toggle("is-invalid", input.value !== "" && value === null);
        this.onChange();
      });
    });
    this.render();
  }

  createShotRow(shot, index) {
    const row = document.createElement("div");
    row.className = "night-shot-row";
    row.classList.toggle("is-miss", shot.miss);

    const target = document.createElement("input");
    target.className = "shot-target";
    target.type = "number";
    target.min = "1";
    target.max = String(PLAYER_COUNT);
    target.step = "1";
    target.inputMode = "numeric";
    target.placeholder = "№";
    target.value = shot.target ?? "";
    target.disabled = shot.miss;
    target.setAttribute("aria-label", `Цель мафии в ночь ${index + 1}`);
    target.addEventListener("input", () => {
      const value = validPlayerNumber(target.value);
      shot.target = value;
      target.classList.toggle("is-invalid", target.value !== "" && value === null);
      this.updateFirstKilledOutput();
      this.onChange();
    });

    const miss = document.createElement("span");
    miss.className = "night-miss-marker";
    miss.textContent = "×";
    miss.setAttribute("aria-label", `Промах в ночь ${index + 1}`);
    miss.hidden = !shot.miss;

    const remove = document.createElement("button");
    remove.className = "remove-night-button";
    remove.type = "button";
    remove.textContent = "−";
    remove.title = `Удалить ночь ${index + 1}`;
    remove.setAttribute("aria-label", `Удалить ночь ${index + 1}`);
    remove.addEventListener("click", () => {
      if (this.state.shots.length === 1) {
        this.state.shots = [{ target: null, miss: false }];
      } else {
        this.state.shots.splice(index, 1);
      }
      this.updateBestMoveAvailability();
      this.renderShots();
      this.updateFirstKilledOutput();
      this.onChange();
    });

    row.append(shot.miss ? miss : target, remove);
    return row;
  }

  addNight(shot) {
    const isInitialBlank = this.state.shots.length === 1
      && this.state.shots[0].target === null
      && this.state.shots[0].miss === false;
    if (shot.miss && isInitialBlank) {
      this.state.shots[0] = shot;
    } else {
      this.state.shots.push(shot);
    }
    this.updateBestMoveAvailability();
    this.renderShots();
    this.updateFirstKilledOutput();
    this.onChange();
  }

  renderShots() {
    this.shotsList.replaceChildren();
    this.state.shots.forEach((shot, index) => {
      this.shotsList.append(this.createShotRow(shot, index));
    });
  }

  getFirstKilledPlayerNumber() {
    return firstKilledPlayerFromNightState(this.state);
  }

  updateFirstKilledOutput() {
    const firstKilledNumber = this.getFirstKilledPlayerNumber();
    if (this.state.shots[0]?.miss === true) {
      this.firstKilledOutput.textContent = "ПУ — · промах Н1";
      return;
    }
    this.firstKilledOutput.textContent = firstKilledNumber === null ? "ПУ —" : `ПУ ${firstKilledNumber}`;
  }

  updateBestMoveAvailability() {
    const available = bestMoveAvailableFromNightState(this.state);
    if (!available) this.state.bestMove = [null, null, null];
    this.bestMoveInputs.forEach((input, index) => {
      input.disabled = !available;
      input.value = this.state.bestMove[index] ?? "";
      input.classList.remove("is-invalid");
      input.title = available ? "" : "ЛХ недоступен при промахе в первую ночь";
    });
  }

  setBestMoveBonus(bonus) {
    const normalizedBonus = bonus === 0.5 || bonus === 0.8 ? bonus : 0;
    this.bestMoveBonusOutput.value = `+${normalizedBonus}`;
    this.bestMoveBonusOutput.classList.toggle("has-value", normalizedBonus > 0);
  }

  render() {
    this.renderShots();
    this.updateBestMoveAvailability();
    this.updateFirstKilledOutput();
  }

  getState() {
    return {
      shots: this.state.shots.map((shot) => ({ ...shot })),
      bestMove: [...this.state.bestMove],
    };
  }

  getKilledPlayerNumbers() {
    return killedPlayersFromNightState(this.state);
  }

  getNightKills() {
    return nightKillsFromNightState(this.state);
  }

  restore(state) {
    this.state = normalizeNightState(state);
    this.render();
  }

  reset() {
    this.state = normalizeNightState(null);
    this.render();
    this.onChange();
  }
}
