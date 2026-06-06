window.MIXER_CONFIG = {
  appName: "Mixer 4CH",
  masterVolume: 80,
  channels: [
    { name: "kick",  color: "#378ADD", vol: 100, pan:   0, muted: false, eq: [ 0,  2, -1] },
    { name: "snare", color: "#D4537E", vol: 70, pan: -20, muted: false, eq: [ 1, -1,  3] },
    { name: "bass",  color: "#1D9E75", vol: 75, pan:  10, muted: false, eq: [ 4,  0, -2] },
    { name: "synth", color: "#7F77DD", vol: 10, pan:  30, muted: false, eq: [-1,  2,  2] }
  ],
  eqBands: ["lo", "mid", "hi"],
  eqRange: { min: -12, max: 12 }
};