class AudioEngine {
  constructor(config) {
    this.config = config;
    this.context = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.channels = config.channels.map((ch) => ({
      ...ch,
      buffer: null,
      fileName: "",
      duration: 0,
      source: null,
      gain: null,
      panNode: null,
      filters: [],
      analyser: null
    }));

    this.masterVolume = config.masterVolume ?? 80;
    this.isPlaying = false;
    this.startedAt = 0;
    this.pauseOffset = 0;
    
    // Kick countdown system
    this.kickValue = 0;
    this.kickCountdownInterval = null;
    
    // Store original config for resets
    this.originalConfig = JSON.parse(JSON.stringify(config));
  }

  resetToDefaults() {
    this.cleanup();
    this.context = null;
    this.masterGain = null;
    this.masterAnalyser = null;
    this.channels = this.originalConfig.channels.map((ch) => ({
      ...ch,
      buffer: null,
      fileName: "",
      duration: 0,
      source: null,
      gain: null,
      panNode: null,
      filters: [],
      analyser: null
    }));
    this.masterVolume = this.originalConfig.masterVolume ?? 80;
    this.isPlaying = false;
    this.startedAt = 0;
    this.pauseOffset = 0;
    this.kickValue = 0;
    this.kickCountdownInterval = null;
  }

  async init() {
    if (this.context) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Ton navigateur ne supporte pas la Web Audio API.");
    }

    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterAnalyser = this.context.createAnalyser();

    this.masterAnalyser.fftSize = 2048;
    this.masterAnalyser.smoothingTimeConstant = 0.82;
    this.masterGain.gain.value = this.masterVolume / 100;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.context.destination);

    this.channels.forEach((_, index) => this.createChannelNodes(index));
  }

  createChannelNodes(index) {
    const ch = this.channels[index];

    ch.gain = this.context.createGain();
    ch.panNode = this.context.createStereoPanner();
    ch.analyser = this.context.createAnalyser();
    ch.analyser.fftSize = 512;
    ch.analyser.smoothingTimeConstant = 0.75;

    const low = this.context.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 220;

    const mid = this.context.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1200;
    mid.Q.value = 0.9;

    const high = this.context.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 5000;

    ch.filters = [low, mid, high];

    ch.gain.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(ch.panNode);
    ch.panNode.connect(ch.analyser);
    ch.analyser.connect(this.masterGain);

    this.applyChannelSettings(index);
  }

  async loadFile(index, file) {
    await this.init();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    const ch = this.channels[index];

    ch.buffer = audioBuffer;
    ch.fileName = file.name;
    ch.duration = audioBuffer.duration;

    return {
      fileName: ch.fileName,
      duration: ch.duration
    };
  }

  applyChannelSettings(index) {
    const ch = this.channels[index];
    if (!ch.gain || !ch.panNode || !ch.filters.length) return;

    ch.gain.gain.value = ch.muted ? 0 : this.toGain(ch.vol);
    ch.panNode.pan.value = this.normalizePan(ch.pan);
    ch.filters[0].gain.value = ch.eq[0];
    ch.filters[1].gain.value = ch.eq[1];
    ch.filters[2].gain.value = ch.eq[2];
  }

  toGain(value) {
    return Math.max(0, Math.min(1.25, value / 100));
  }

  normalizePan(value) {
    return Math.max(-1, Math.min(1, value / 100));
  }

  setVolume(index, value) {
    const ch = this.channels[index];
    ch.vol = Number(value);
    if (ch.gain) ch.gain.gain.value = ch.muted ? 0 : this.toGain(ch.vol);
  }

  setPan(index, value) {
    const ch = this.channels[index];
    ch.pan = Number(value);
    if (ch.panNode) ch.panNode.pan.value = this.normalizePan(ch.pan);
  }

  setEQ(index, bandIndex, value) {
    const ch = this.channels[index];
    ch.eq[bandIndex] = Number(value);
    if (ch.filters[bandIndex]) ch.filters[bandIndex].gain.value = ch.eq[bandIndex];
  }

  toggleMute(index) {
    const ch = this.channels[index];
    ch.muted = !ch.muted;
    this.setVolume(index, ch.vol);
    return ch.muted;
  }

  setMasterVolume(value) {
    this.masterVolume = Number(value);
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume / 100;
  }

  async play() {
    await this.init();

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    if (this.isPlaying) return;

    this.stopSourcesOnly();
    const now = this.context.currentTime;
    this.startedAt = now - this.pauseOffset;

    this.channels.forEach((ch, index) => {
      if (!ch.buffer) return;

      const source = this.context.createBufferSource();
      source.buffer = ch.buffer;
      source.loop = true;
      source.connect(ch.gain);

      const offset = ch.duration > 0 ? this.pauseOffset % ch.duration : 0;
      source.start(now, offset);
      ch.source = source;

      source.onended = () => {
        if (ch.source === source) ch.source = null;
      };

      this.applyChannelSettings(index);
    });

    this.isPlaying = true;
  }

  pause() {
    if (!this.context || !this.isPlaying) return;

    this.pauseOffset = Math.max(0, this.context.currentTime - this.startedAt);
    this.stopSourcesOnly();
    this.isPlaying = false;
  }

  stop() {
    this.pauseOffset = 0;
    this.stopSourcesOnly();
    this.isPlaying = false;
  }

  cleanup() {
    this.stop();
    this.stopKickCountdown();
    
    if (this.context && this.context.state !== "closed") {
      this.context.close();
    }
    
    this.context = null;
    this.masterGain = null;
    this.masterAnalyser = null;
  }

  stopSourcesOnly() {
    this.channels.forEach((ch) => {
      if (!ch.source) return;
      try {
        ch.source.stop();
      } catch (_) {
        // Source déjà stoppée.
      }
      ch.source.disconnect();
      ch.source = null;
    });
  }

  getChannelLevel(index) {
    const ch = this.channels[index];
    if (!ch.analyser || ch.muted) return 0;

    const data = new Uint8Array(ch.analyser.frequencyBinCount);
    ch.analyser.getByteFrequencyData(data);
    let sum = 0;

    for (const value of data) sum += value;
    return Math.min(1, (sum / data.length) / 150);
  }

  getMasterLevel() {
    if (!this.masterAnalyser) return 0;

    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(data);
    let sum = 0;

    for (const value of data) sum += value;
    return Math.min(1, (sum / data.length) / 160);
  }

  getWaveformData() {
    if (!this.masterAnalyser) return new Uint8Array(0);

    const data = new Uint8Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getByteTimeDomainData(data);
    return data;
  }

  async exportWav() {
    await this.init();

    const loadedChannels = this.channels.filter((ch) => ch.buffer);
    if (!loadedChannels.length) {
      throw new Error("Ajoute au moins un fichier audio avant d’exporter.");
    }

    const sampleRate = this.context.sampleRate;
    const duration = Math.max(...loadedChannels.map((ch) => ch.buffer.duration));
    const length = Math.ceil(duration * sampleRate);
    const offline = new OfflineAudioContext(2, length, sampleRate);
    const offlineMaster = offline.createGain();
    offlineMaster.gain.value = this.masterVolume / 100;
    offlineMaster.connect(offline.destination);

    this.channels.forEach((ch) => {
      if (!ch.buffer) return;

      const source = offline.createBufferSource();
      const gain = offline.createGain();
      const low = offline.createBiquadFilter();
      const mid = offline.createBiquadFilter();
      const high = offline.createBiquadFilter();
      const pan = offline.createStereoPanner();

      source.buffer = ch.buffer;
      gain.gain.value = ch.muted ? 0 : this.toGain(ch.vol);

      low.type = "lowshelf";
      low.frequency.value = 220;
      low.gain.value = ch.eq[0];

      mid.type = "peaking";
      mid.frequency.value = 1200;
      mid.Q.value = 0.9;
      mid.gain.value = ch.eq[1];

      high.type = "highshelf";
      high.frequency.value = 5000;
      high.gain.value = ch.eq[2];

      pan.pan.value = this.normalizePan(ch.pan);

      source.connect(gain);
      gain.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(pan);
      pan.connect(offlineMaster);
      source.start(0);
    });

    const renderedBuffer = await offline.startRendering();
    return this.audioBufferToWavBlob(renderedBuffer);
  }

  audioBufferToWavBlob(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * channels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channelData = [];
    let offset = 0;
    let pos = 0;

    const writeString = (text) => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(pos, text.charCodeAt(i));
        pos += 1;
      }
    };

    const writeUint32 = (value) => {
      view.setUint32(pos, value, true);
      pos += 4;
    };

    const writeUint16 = (value) => {
      view.setUint16(pos, value, true);
      pos += 2;
    };

    writeString("RIFF");
    writeUint32(length - 8);
    writeString("WAVE");
    writeString("fmt ");
    writeUint32(16);
    writeUint16(1);
    writeUint16(channels);
    writeUint32(sampleRate);
    writeUint32(sampleRate * channels * 2);
    writeUint16(channels * 2);
    writeUint16(16);
    writeString("data");
    writeUint32(length - pos - 4);

    for (let i = 0; i < channels; i += 1) {
      channelData.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < channels; i += 1) {
        let sample = channelData[i][offset];
        sample = Math.max(-1, Math.min(1, sample));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset += 1;
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  startKickCountdown() {
    if (this.kickCountdownInterval) {
      clearInterval(this.kickCountdownInterval);
    }
    this.kickValue = this.channels[0].vol; // Start from current volume
    this.kickCountdownInterval = setInterval(() => {
      if (this.kickValue > 0) {
        this.kickValue -= 1;
        this.setVolume(0, this.kickValue); // Apply directly to channel volume
      } else {
        clearInterval(this.kickCountdownInterval);
        this.kickCountdownInterval = null;
      }
    }, 1000);
  }

  stopKickCountdown() {
    if (this.kickCountdownInterval) {
      clearInterval(this.kickCountdownInterval);
      this.kickCountdownInterval = null;
    }
  }

  getKickValue() {
    return this.kickValue;
  }
}
