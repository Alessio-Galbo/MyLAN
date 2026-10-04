function formatTime(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function createStatusCard() {
  const box = document.createElement("div");
  box.className = "status-box";
  box.style.display = "none";
  let timerInterval = null;

  const clearTimer = () => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  };

  const update = (message, state = "info") => {
    if (!message) {
      clearTimer();
      box.style.display = "none";
      box.replaceChildren();
      return;
    }
    box.style.display = "flex";
    box.className = `status-box is-${state}`;
    box.replaceChildren();

    if (state === "loading") {
      const wrap = document.createElement("div");
      wrap.className = "spinner-wrapper";
      const pulse = document.createElement("div");
      pulse.className = "spinner-pulse";
      const sp = document.createElement("div");
      sp.className = "spinner";
      wrap.append(pulse, sp);
      box.appendChild(wrap);
    }

    const text = document.createElement("span");
    text.className = "status-text";
    text.textContent = message;
    box.appendChild(text);

    if (state === "loading") {
      const timerSpan = document.createElement("span");
      timerSpan.className = "status-timer";
      timerSpan.textContent = "00:00";
      box.appendChild(timerSpan);

      clearTimer();
      const start = Date.now();
      timerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - start) / 1000);
        timerSpan.textContent = formatTime(sec);
      }, 1000);
    } else {
      clearTimer();
    }
  };

  return { el: box, update };
}
