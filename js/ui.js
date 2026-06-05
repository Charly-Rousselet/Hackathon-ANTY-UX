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
    this.lastTimestamp = 0; 
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
      const isKick = index === 0;
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
          <span class="channel-index" id="header-vol-${index}">${Math.round(channel.vol)}</span>
        </header>

        <div class="file-row">
          <input class="file-input" id="file-${index}" type="file" accept="audio/*" />
          <label class="file-label" for="file-${index}">Importer audio</label>
          <p id="file-name-${index}" class="file-name">aucun fichier</p>
        </div>

        <div class="channel-body ${isKick ? 'is-pump-mode' : ''}">
          <div class="fader-wrap">
            ${isKick ? '<button id="pump-kick" class="pump-btn">⚡</button>' : ''}
            <input class="fader" id="fader-${index}" type="range" min="0" max="100" value="${channel.vol}" />
          </div>
          <div class="mini-vu" id="vu-${index}">
            ${[1, 2, 3, 4, 5, 6].map((barIndex) => `<div class="mini-vu-bar" data-bar="${barIndex}" style="height:${22 + barIndex * 27}px"></div>`).join("")}
          </div>
        </div>

        <div class="channel-value-row">
          <span>volume</span>
          <strong id="vol-val-${index}">${Math.round(channel.vol)}</strong>
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

    // LOGIQUE DE LA POMPE (KICK) : +1 PAR CLIC
    if (index === 0) {
      const pumpBtn = document.getElementById('pump-kick');
      pumpBtn.addEventListener('click', () => {
        // Start the kick countdown
        this.engine.startKickCountdown();
        let currentVol = this.engine.channels[0].vol;
        let newVol = Math.min(100, currentVol + 1); // +1 exactement
        this.engine.setVolume(0, newVol);
        this.refreshChannelVisual(0);
        
        // Start updating kick value display
        this.startKickValueUpdate();
      });
    }

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const res = await this.engine.loadFile(index, file);
      document.getElementById(`file-name-${index}`).textContent = `${res.fileName} • ${this.formatTime(res.duration)}`;
    });

    fader.addEventListener("input", (e) => {
      let value = Number(e.target.value);
      
      // SNARE: random value around fader position
      if (index === 1) {
        const range = 15; // ±15% around fader position
        const randomOffset = (Math.random() - 0.5) * (range * 2);
        value = Math.max(0, Math.min(100, value + randomOffset));
        this.engine.setVolume(index, value);
      }
      // BASS: rotation animation + normal volume control
      else if (index === 2) {
        // Add rotation animation
        fader.classList.add('fader-rotating');
        setTimeout(() => {
          fader.classList.remove('fader-rotating');
        }, 600);
        
        // Control volume normally
        this.engine.setVolume(index, value);
      }
      else {
        this.engine.setVolume(index, value);
      }
      
      this.refreshChannelVisual(index);
    });

    muteButton.addEventListener("click", () => {
      this.engine.toggleMute(index);
      this.refreshChannelVisual(index);
    });

    this.setupKnob(document.getElementById(`pan-${index}`), {
      min: -100, max: 100, getValue: () => channel.pan,
      setValue: (v) => this.engine.setPan(index, v),
      color: channel.color, step: 1, sensitivity: 1
    });

    this.config.eqBands.forEach((_, bIdx) => {
      this.setupKnob(document.getElementById(`eq-${index}-${bIdx}`), {
        min: this.config.eqRange.min, max: this.config.eqRange.max,
        getValue: () => channel.eq[bIdx],
        setValue: (v) => this.engine.setEQ(index, bIdx, v),
        color: channel.color, step: 0.1, sensitivity: 0.12
      });
    });
  }

  bindMasterControls() {
    this.masterFader.addEventListener("input", (e) => {
      this.engine.setMasterVolume(e.target.value);
      this.masterVal.textContent = this.engine.masterVolume;
      this.setSliderFill(this.masterFader, this.engine.masterVolume);
    });

    this.btnPlay.addEventListener("click", async () => {
      if (this.engine.isPlaying) {
        this.engine.pause();
        this.engine.stopKickCountdown(); // Stop kick countdown on pause
        this.stopKickValueUpdate();
        this.setTransport(false, "paused");
      } else {
        await this.engine.play();
        this.engine.startKickCountdown(); // Start kick countdown on play
        this.setTransport(true, "playing");
        this.lastTimestamp = performance.now();
        this.animate(performance.now());
      }
    });

    this.btnStop.addEventListener("click", () => {
      this.engine.stop();
      this.engine.stopKickCountdown(); // Stop kick countdown on stop
      this.stopKickValueUpdate();
      this.setTransport(false, "stopped");
      this.resetMeters();
    });
  }

  animate(now) {
    if (!this.engine.isPlaying) return;

    // --- DESCENTE DE 1 UNITÉ PAR SECONDE RÉELLE ---
    const deltaTime = (now - this.lastTimestamp) / 1000; 
    this.lastTimestamp = now;

    const kickCh = this.engine.channels[0];
    if (kickCh.vol > 0) {
      let newVol = Math.max(0, kickCh.vol - (1 * deltaTime)); 
      this.engine.setVolume(0, newVol);
      this.refreshChannelVisual(0);
    }

    this.updateMeters();
    this.drawWaveform(this.engine.getWaveformData());
    this.animationFrame = requestAnimationFrame((timestamp) => this.animate(timestamp));
  }

  refreshChannelVisual(index) {
    const channel = this.engine.channels[index];
    const fader = document.getElementById(`fader-${index}`);
    const valText = document.getElementById(`vol-val-${index}`);
    const headerVal = document.getElementById(`header-vol-${index}`);

    if (fader) {
      fader.value = channel.vol;
      this.setSliderFill(fader, channel.vol);  // Update visual fill
    }
    const rounded = Math.round(channel.vol);
    if (valText) valText.textContent = rounded;
    if (headerVal) headerVal.textContent = rounded;
    
    this.setSliderFill(fader, channel.vol);
  }

  setupKnob(canvas, options) {
    let dragging = false, startY = 0, startVal = 0;
    const redraw = () => this.drawKnob(canvas, options.getValue(), options.min, options.max, options.color);
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true; startY = e.clientY; startVal = options.getValue();
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const delta = (startY - e.clientY) * options.sensitivity;
      const val = Math.max(options.min, Math.min(options.max, startVal + delta));
      options.setValue(Number(val.toFixed(2)));
      redraw();
    });
    canvas.addEventListener("pointerup", () => dragging = false);
    redraw();
  }

  setSliderFill(slider, value) {
    if (slider) slider.style.setProperty("--pct", `${value}%`);
  }

  setTransport(isPlaying, status) {
    this.btnPlay.textContent = isPlaying ? "Pause" : "Play";
    this.transportStatus.textContent = status;
  }

  updateMeters() {
    this.engine.channels.forEach((ch, index) => {
      const level = this.engine.getChannelLevel(index);
      const bars = document.querySelectorAll(`#vu-${index} .mini-vu-bar`);
      bars.forEach((bar, bIdx) => {
        const active = level * bars.length >= bIdx + 1;
        bar.style.background = active ? ch.color : "rgba(255, 255, 255, 0.11)";
        bar.style.opacity = active ? "1" : "0.45";
      });
    });
    const mLevel = this.engine.getMasterLevel();
    document.querySelectorAll("#masterVu .master-vu-bar").forEach((bar, i) => {
      const active = mLevel * 9 >= i + 1;
      bar.style.opacity = active ? "1" : "0.18";
    });
  }

  resetMeters() {
    document.querySelectorAll(".mini-vu-bar").forEach(b => b.style.opacity = "0.45");
    document.querySelectorAll(".master-vu-bar").forEach(b => b.style.opacity = "0.18");
  }

  drawKnob(canvas, value, min, max, color) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, cx = w/2, r = w/2 - 8;
    const start = Math.PI * 0.75, end = Math.PI * 2.25;
    const pct = (value - min) / (max - min);
    const angle = start + pct * (end - start);
    ctx.clearRect(0, 0, w, w);
    ctx.beginPath();
    ctx.arc(cx, cx, r, start, end);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cx, r, start, angle);
    ctx.strokeStyle = color; ctx.stroke();
  }

  drawWaveform(data) {
    const ctx = this.waveCanvas.getContext("2d");
    const w = this.waveCanvas.width, h = this.waveCanvas.height, mid = h/2;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath(); ctx.moveTo(0, mid);
    if (data.length) {
      const step = data.length / w;
      for (let x = 0; x < w; x++) {
        const v = data[Math.floor(x * step)] / 128 - 1;
        ctx.lineTo(x, mid + v * mid * 0.9);
      }
    }
    ctx.strokeStyle = "#56e39f"; ctx.lineWidth = 2; ctx.stroke();
  }

  formatTime(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2, "0")}`; }
  
  cleanup() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.kickValueUpdateInterval) {
      clearInterval(this.kickValueUpdateInterval);
    }
  }

  startKickValueUpdate() {
    if (this.kickValueUpdateInterval) {
      clearInterval(this.kickValueUpdateInterval);
    }
    this.kickValueUpdateInterval = setInterval(() => {
      this.refreshChannelVisual(0);
      
      // Stop update if volume reaches 0
      if (this.engine.channels[0].vol <= 0) {
        this.stopKickValueUpdate();
      }
    }, 100);
  }

  stopKickValueUpdate() {
    if (this.kickValueUpdateInterval) {
      clearInterval(this.kickValueUpdateInterval);
      this.kickValueUpdateInterval = null;
    }
  }
  
  escapeHtml(t) { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
}