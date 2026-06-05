class MixerUI {
  constructor(engine, config) {
    this.engine = engine;
    this.config = config;
    this.channelGrid = document.getElementById("channelGrid");
    this.masterVu = document.getElementById("masterVu");
    this.waveCanvas = document.getElementById("waveCanvas");
    this.masterFader = document.getElementById("masterFader");
    this.masterVal = document.getElementById("masterVal");
    this.transportStatus = document.getElementById("transportStatus");
    this.btnPlay = document.getElementById("btnPlay");
    this.btnStop = document.getElementById("btnStop");
    this.btnExport = document.getElementById("btnExport");
    this.animationFrame = null;
  }

  init() {
    this.buildMasterVu();
    this.buildChannels();
    this.bindMasterControls();
    this.drawWaveform(new Uint8Array(0));
    this.setSliderFill(this.masterFader, this.engine.masterVolume);
  }

  buildMasterVu() {
    this.masterVu.innerHTML = "";

    for (let i = 1; i <= 9; i += 1) {
      const bar = document.createElement("div");
      bar.className = "master-vu-bar";
      bar.style.height = `${18 + i * 5}px`;
      bar.style.background = i > 7 ? "#ff5d73" : i > 5 ? "#ffd166" : "#56e39f";
      this.masterVu.appendChild(bar);
    }
  }

  buildChannels() {
    this.channelGrid.innerHTML = "";

    this.engine.channels.forEach((channel, index) => {
      const channelEl = document.createElement("article");
      channelEl.className = `channel${channel.muted ? " is-muted" : ""}`;
      channelEl.id = `channel-${index}`;
      channelEl.style.setProperty("--channel-color", channel.color);
      channelEl.style.setProperty("--channel-color-soft", `${channel.color}33`);
      channelEl.style.setProperty("--channel-glow", `radial-gradient(circle at 50% 0%, ${channel.color}22, transparent 55%)`);

      channelEl.innerHTML = `
        <header class="channel-top">
          <div>
            <p class="channel-index">CH ${String(index + 1).padStart(2, "0")}</p>
            <h2 class="channel-name">${this.escapeHtml(channel.name)}</h2>
          </div>
          <span class="channel-index">${channel.vol}</span>
        </header>

        <div class="file-row">
          <input class="file-input" id="file-${index}" type="file" accept="audio/*" />
          <label class="file-label" for="file-${index}">Importer audio</label>
          <p id="file-name-${index}" class="file-name">aucun fichier</p>
        </div>

        <div class="channel-body">
          <div class="fader-wrap">
            <input class="fader" id="fader-${index}" type="range" min="0" max="100" value="${channel.vol}" />
          </div>
          <div class="mini-vu" id="vu-${index}">
            ${[1, 2, 3, 4, 5, 6].map((barIndex) => `<div class="mini-vu-bar" data-bar="${barIndex}" style="height:${22 + barIndex * 27}px"></div>`).join("")}
          </div>
        </div>

        <div class="channel-value-row">
          <span>volume</span>
          <strong id="vol-val-${index}">${channel.vol}</strong>
        </div>

        <div class="knob-grid">
          <div class="knob-box">
            <canvas id="pan-${index}" width="72" height="72"></canvas>
            <span>pan</span>
          </div>
          ${this.config.eqBands.map((band, bandIndex) => `
            <div class="knob-box">
              <canvas id="eq-${index}-${bandIndex}" width="72" height="72"></canvas>
              <span>${band}</span>
            </div>
          `).join("")}
        </div>

        <button id="mute-${index}" class="mute-btn${channel.muted ? " is-muted" : ""}" type="button">
          ${channel.muted ? "muted" : "mute"}
        </button>
      `;

      this.channelGrid.appendChild(channelEl);
      this.bindChannelControls(index);
      this.refreshChannelVisual(index);
    });
  }

  bindChannelControls(index) {
    const channel = this.engine.channels[index];
    const fileInput = document.getElementById(`file-${index}`);
    const fader = document.getElementById(`fader-${index}`);
    const muteButton = document.getElementById(`mute-${index}`);
    const panCanvas = document.getElementById(`pan-${index}`);

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const result = await this.engine.loadFile(index, file);
        document.getElementById(`file-name-${index}`).textContent = `${result.fileName} • ${this.formatTime(result.duration)}`;
      } catch (error) {
        alert(`Impossible de charger le fichier : ${error.message}`);
      }
    });

    fader.addEventListener("input", (event) => {
      this.engine.setVolume(index, event.target.value);
      this.refreshChannelVisual(index);
    });

    muteButton.addEventListener("click", () => {
      this.engine.toggleMute(index);
      this.refreshChannelVisual(index);
    });

    this.setupKnob(panCanvas, {
      min: -100,
      max: 100,
      getValue: () => channel.pan,
      setValue: (value) => this.engine.setPan(index, value),
      color: channel.color,
      step: 1,
      sensitivity: 1
    });

    this.config.eqBands.forEach((_, bandIndex) => {
      const canvas = document.getElementById(`eq-${index}-${bandIndex}`);
      this.setupKnob(canvas, {
        min: this.config.eqRange.min,
        max: this.config.eqRange.max,
        getValue: () => channel.eq[bandIndex],
        setValue: (value) => this.engine.setEQ(index, bandIndex, value),
        color: channel.color,
        step: 0.1,
        sensitivity: 0.12
      });
    });
  }

  bindMasterControls() {
    this.masterFader.addEventListener("input", (event) => {
      this.engine.setMasterVolume(event.target.value);
      this.masterVal.textContent = this.engine.masterVolume;
      this.setSliderFill(this.masterFader, this.engine.masterVolume);
    });

    this.btnPlay.addEventListener("click", async () => {
      try {
        if (this.engine.isPlaying) {
          this.engine.pause();
          this.setTransport(false, "paused");
        } else {
          await this.engine.play();
          this.setTransport(true, "playing");
          this.animate();
        }
      } catch (error) {
        alert(error.message);
      }
    });

    this.btnStop.addEventListener("click", () => {
      this.engine.stop();
      this.setTransport(false, "stopped");
      this.resetMeters();
      this.drawWaveform(new Uint8Array(0));
    });

    this.btnExport.addEventListener("click", async () => {
      const previousLabel = this.btnExport.textContent;
      this.btnExport.textContent = "Export...";
      this.btnExport.disabled = true;

      try {
        const blob = await this.engine.exportWav();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `mix-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.wav`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        alert(error.message);
      } finally {
        this.btnExport.textContent = previousLabel;
        this.btnExport.disabled = false;
      }
    });
  }

  setupKnob(canvas, options) {
    let dragging = false;
    let startY = 0;
    let startValue = 0;

    const redraw = () => {
      this.drawKnob(canvas, options.getValue(), options.min, options.max, options.color);
    };

    const updateFromDelta = (clientY) => {
      const delta = (startY - clientY) * options.sensitivity;
      const rawValue = startValue + delta;
      const stepped = Math.round(rawValue / options.step) * options.step;
      const value = Math.max(options.min, Math.min(options.max, stepped));
      options.setValue(Number(value.toFixed(2)));
      redraw();
    };

    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      startY = event.clientY;
      startValue = options.getValue();
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      updateFromDelta(event.clientY);
    });

    canvas.addEventListener("pointerup", () => {
      dragging = false;
    });

    canvas.addEventListener("dblclick", () => {
      options.setValue(0);
      redraw();
    });

    redraw();
  }

  refreshChannelVisual(index) {
    const channel = this.engine.channels[index];
    const channelEl = document.getElementById(`channel-${index}`);
    const fader = document.getElementById(`fader-${index}`);
    const value = document.getElementById(`vol-val-${index}`);
    const headerValue = channelEl.querySelector(".channel-top .channel-index:last-child");
    const muteButton = document.getElementById(`mute-${index}`);

    channelEl.classList.toggle("is-muted", channel.muted);
    muteButton.classList.toggle("is-muted", channel.muted);
    muteButton.textContent = channel.muted ? "muted" : "mute";
    fader.value = channel.vol;
    value.textContent = channel.vol;
    headerValue.textContent = channel.vol;
    this.setSliderFill(fader, channel.vol);

    this.drawKnob(document.getElementById(`pan-${index}`), channel.pan, -100, 100, channel.color);
    channel.eq.forEach((eqValue, bandIndex) => {
      this.drawKnob(
        document.getElementById(`eq-${index}-${bandIndex}`),
        eqValue,
        this.config.eqRange.min,
        this.config.eqRange.max,
        channel.color
      );
    });
  }

  setSliderFill(slider, value) {
    slider.style.setProperty("--pct", `${Number(value)}%`);
  }

  setTransport(isPlaying, status) {
    this.btnPlay.classList.toggle("is-playing", isPlaying);
    this.btnPlay.textContent = isPlaying ? "Pause" : "Play";
    this.transportStatus.textContent = status;

    if (!isPlaying && this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  animate() {
    if (!this.engine.isPlaying) return;

    this.updateMeters();
    this.drawWaveform(this.engine.getWaveformData());
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  updateMeters() {
    this.engine.channels.forEach((channel, index) => {
      const level = this.engine.getChannelLevel(index);
      const bars = document.querySelectorAll(`#vu-${index} .mini-vu-bar`);

      bars.forEach((bar, barIndex) => {
        const active = level * bars.length >= barIndex + 1;
        bar.style.background = active ? channel.color : "rgba(255, 255, 255, 0.11)";
        bar.style.opacity = active ? "1" : "0.45";
      });
    });

    const masterLevel = this.engine.getMasterLevel();
    const masterBars = document.querySelectorAll("#masterVu .master-vu-bar");

    masterBars.forEach((bar, index) => {
      const active = masterLevel * masterBars.length >= index + 1;
      bar.style.opacity = active ? "1" : "0.18";
      bar.style.transform = active ? "scaleY(1.04)" : "scaleY(1)";
    });
  }

  resetMeters() {
    document.querySelectorAll(".mini-vu-bar").forEach((bar) => {
      bar.style.background = "rgba(255, 255, 255, 0.11)";
      bar.style.opacity = "0.45";
    });

    document.querySelectorAll(".master-vu-bar").forEach((bar) => {
      bar.style.opacity = "0.18";
      bar.style.transform = "scaleY(1)";
    });
  }

  drawKnob(canvas, value, min, max, color) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 8;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const pct = (value - min) / (max - min);
    const angle = startAngle + pct * (endAngle - startAngle);

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + (radius - 2) * Math.cos(angle), centerY + (radius - 2) * Math.sin(angle));
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  drawWaveform(data) {
    const canvas = this.waveCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const mid = height / 2;

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#56e39f");
    gradient.addColorStop(0.5, "#378add");
    gradient.addColorStop(1, "#d4537e");

    ctx.beginPath();
    ctx.moveTo(0, mid);

    if (!data.length) {
      for (let x = 0; x < width; x += 1) {
        const y = mid + Math.sin(x * 0.08) * 3;
        ctx.lineTo(x, y);
      }
    } else {
      const slice = data.length / width;
      for (let x = 0; x < width; x += 1) {
        const value = data[Math.floor(x * slice)] / 128 - 1;
        const y = mid + value * mid * 0.9;
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
