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

  // Nettoyage complet lors du rechargement/fermeture
  window.addEventListener("beforeunload", () => {
    if (window.mixer) {
      if (window.mixer.ui) {
        window.mixer.ui.cleanup();
      }
      if (window.mixer.engine) {
        window.mixer.engine.cleanup();
      }
    }
  });

  // Nettoyage aussi au visibilitychange (quand l'onglet perd le focus)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && window.mixer && window.mixer.engine && window.mixer.engine.isPlaying) {
      window.mixer.engine.pause();
    }
  });
});
