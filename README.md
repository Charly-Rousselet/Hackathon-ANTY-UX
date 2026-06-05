# Mixer 4CH

Application web de mixage audio simple et modifiable.

## Fonctionnalités

- 4 pistes audio
- import de fichiers audio par piste
- volume par piste
- panoramique gauche/droite
- égaliseur 3 bandes : lo, mid, hi
- mute par piste
- volume master
- VU-mètres animés
- waveform master
- export du mix en WAV

## Lancer le projet

Depuis le dossier du projet :

```bash
python3 -m http.server 8000
```

Puis ouvre :

```text
http://localhost:8000
```

Tu peux aussi ouvrir `index.html` directement dans ton navigateur, mais le serveur local est recommandé.

## Structure

```text
mixer_project/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── config.js
    ├── audio-engine.js
    ├── ui.js
    └── app.js
```

## Modifier les pistes

Tout se passe dans `js/config.js` :

```js
channels: [
  { name: "kick", color: "#378ADD", vol: 85, pan: 0, muted: false, eq: [0, 2, -1] }
]
```

- `name` : nom affiché
- `color` : couleur de la piste
- `vol` : volume de 0 à 100
- `pan` : -100 gauche, 0 centre, +100 droite
- `muted` : true ou false
- `eq` : [lo, mid, hi] en dB

## Prochaines améliorations possibles

- ajouter plus de pistes
- ajouter solo par piste
- ajouter timeline
- ajouter enregistrement microphone
- ajouter sauvegarde de presets
- ajouter drag and drop de fichiers audio
