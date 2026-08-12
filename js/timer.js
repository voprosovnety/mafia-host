function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((milliseconds % 1000) / 10);
  return [minutes, seconds, centiseconds]
    .map((unit) => String(unit).padStart(2, "0"))
    .join(":");
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable;
}

export class TimerController {
  constructor({ output, panel, stateText, resetButton, onChange }) {
    this.output = output;
    this.panel = panel;
    this.stateText = stateText;
    this.onChange = onChange;
    this.elapsedMilliseconds = 0;
    this.startedAt = 0;
    this.animationFrameId = null;
    this.keyboardEnabled = true;

    resetButton.addEventListener("click", () => {
      this.reset();
      this.onChange();
    });
    document.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  render(now = performance.now()) {
    this.output.value = formatTime(this.elapsedMilliseconds + (now - this.startedAt));
    this.animationFrameId = requestAnimationFrame((nextNow) => this.render(nextNow));
  }

  start() {
    if (this.animationFrameId !== null) return;
    this.startedAt = performance.now();
    this.panel.classList.add("is-running");
    this.stateText.textContent = "Идёт";
    this.animationFrameId = requestAnimationFrame((now) => this.render(now));
  }

  reset() {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.elapsedMilliseconds = 0;
    this.startedAt = 0;
    this.animationFrameId = null;
    this.output.value = formatTime(0);
    this.panel.classList.remove("is-running");
    this.stateText.textContent = "Остановлен";
  }

  restart() {
    this.reset();
    this.start();
    this.onChange();
  }

  handleKeydown(event) {
    if (!this.keyboardEnabled || event.code !== "Space" || isTypingTarget(event.target)) return;
    event.preventDefault();
    if (!event.repeat) this.restart();
  }

  setKeyboardEnabled(enabled) {
    this.keyboardEnabled = enabled;
  }

  currentElapsedTime() {
    return this.animationFrameId === null
      ? this.elapsedMilliseconds
      : this.elapsedMilliseconds + (performance.now() - this.startedAt);
  }

  getState() {
    return {
      elapsedMilliseconds: Math.max(0, Math.floor(this.currentElapsedTime())),
      isRunning: this.animationFrameId !== null,
    };
  }

  restore(state) {
    const storedElapsed = Number(state?.elapsedMilliseconds);
    this.elapsedMilliseconds = Number.isFinite(storedElapsed) && storedElapsed >= 0 ? storedElapsed : 0;
    this.output.value = formatTime(this.elapsedMilliseconds);
    if (state?.isRunning) this.start();
  }
}
