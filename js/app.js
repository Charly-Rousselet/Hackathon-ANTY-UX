window.addEventListener("DOMContentLoaded", () => {
  const config = window.MIXER_CONFIG;
  const engine = new AudioEngine(config);
  const ui = new MixerUI(engine, config);

  ui.init();

  window.mixer = {
    config,
    engine,
    ui
  };
});
