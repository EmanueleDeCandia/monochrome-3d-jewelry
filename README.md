# Maison William — Studio CAD 3D Monocromo

Visualizzatore 3D di un ciondolo personalizzabile: **platino inciso a nome**, castone a gradini,
pavé di brillanti, retro traforato a nido d'ape e catena cubana. Interfaccia in italiano,
palette rigorosamente monocroma.

Stack: **React 19 · TypeScript 5.9 · Vite 7 · three.js r186 · Tailwind CSS 4** (+ `lucide-react`, `clsx`, `tailwind-merge`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + bundle single-file in dist/index.html
npm run preview
npm run verify:scene   # QA offline: geometria, font, layout + render software in tools/out
npm run render:views   # render di tutte le viste con il rasterizzatore software
```

---

## 1. Cosa è stato corretto

### 1.1 Il nome era bloccato su "William"

**Causa.** `src/jewelry/fonts/luxurySerifFont.ts` era un typeface "disegnato a mano" che conteneva
**solo i glifi ` ␣ W i l a m`** (6 glifi, 2,4 KB). `FontLoader.createPath()` fa
`data.glyphs[char]` e, se il glifo manca, ritorna `undefined` senza gestire l'errore:

```js
const glyph = data.glyphs[ char ] || data.glyphs[ '?' ];   // undefined
if ( ! glyph ) { console.error(...); return; }              // <-- undefined
// ... poco dopo:  outline = glyph.o.split(' ')  -> TypeError
```

Quindi scrivere `Sofia`, `Anna`, `9` … faceva **esplodere `TextGeometry`**: nessuna gestione
dell'eccezione in `updateText()` e il nome spariva dalla scena. L'unica stringa che funzionava era
`"William"`.

**Soluzione.**

- tre typeface reali (`Bodoni Moda`, `Cinzel`, `Cormorant Garamond`, OFL) convertiti in
  `typeface.json` con `tools/generate-typefaces.mjs` (opentype.js → outline nel formato che
  `FontLoader` si aspetta). Ognuno copre **ASCII + Latin-1 + punteggiatura tipografica** (~170 glifi).
- `src/jewelry/fonts/index.ts`: registry con cache dei `Font` parsati + `getFontCoverage()`
  per verificare la copertura dei glifi.
- `buildTextGeometry()` ora fa il **layout glifo per glifo**, quindi:
  - i caratteri **senza glifo vengono scartati** e segnalati nella UI (`stats.droppedChars`)
    invece di far fallire l'intera estrazione;
  - si può applicare il **`tracking`** (letter-spacing), che `THREE.TextGeometry` non supporta;
  - il testo viene centrato otticamente sul bounding box reale.
- `fitText()` **adatta automaticamente il corpo del nome** alla finestra del castone e poi applica
  il moltiplicatore dell'utente: nomi corti (`Zoe`) e lunghi (`José-María`) stanno sempre dentro
  la targhetta, senza clipping (verificato dal QA harness per 10 nomi × 3 font).

### 1.2 Funzionalità che non producevano alcun cambiamento visivo

| Controllo | Prima | Adesso |
|---|---|---|
| Materiale | cambiava **solo la mesh del nome** | `MaterialLibrary` condivisa: metallo, finitura, pietra e baguette si applicano a **tutto** il gioiello |
| Lighting preset | cambiava `intensity` di luci con `decay = 2` a 8–10 unità di distanza (≈ 85/d² → variazioni impercettibili) | `decay = 0` (irradianza prevedibile) + rigenerazione dell'IBL per preset + scala di intensità per faretto |
| Exposure | clampata **tra 1.00 e 1.20** | intervallo utile 0.25 – 2.20 (con ACES è la manopola che conta per i riflessi metallici) |
| Hot-swap cliccando | funzionava solo in parte (toggle solo platino/diamante) | click sul gioiello cicla metallo ⇄ pietra del nome, funziona con mouse, penna e touch |
| Wireframe | `child.material.wireframe` su *istanze* di materiale condivise | flag centralizzato nella library, con spegnimento automatico di bloom/SSAO |
| Rotazione automatica | `group.rotation.y += 0.0035` **mentre OrbitControls aggiorna la camera** (inclinazione azzerata) | `controls.autoRotate` con pausa automatica durante interazione e tween |
| "RENDER 4K" | `canvas.toDataURL()` alla risoluzione del viewport (mai 4K) | `capture({ scale })` 1×–4× fino a 4096 px, con opzione **sfondo trasparente** |
| Snapshot | nessun controllo di risoluzione | 2×/3×/4×, stato del file, dimensioni reali |

### 1.3 L'effetto luce che offuscava l'oggetto

Tre cause sovrapposte:

1. **Bloom**: `UnrealBloomPass(0.75, 0.5, 0.95)` su un buffer HDR lineare con environment 2.2× →
   ogni riflesso metallico superava la soglia e sbocciava, "mangiando" la geometria.
   Ora: soglia **1.1** (sopra il bianco diffuso), intensità di default 0.22, slider e toggle.
2. **SSAO sempre attiva, mal calibrata**: `kernelRadius 0.15` su una pieza larga 9 unità → un alone
   nero su tutto. Ora è **opt-in**, con `maxDistance` sensato e spegnimento in wireframe.
3. **Luci**: 85/55/40 cd con `decay = 2` a 8–10 unità. Ora 2.2/1.4/1.0 con `decay = 0`,
   master 0.8×, e il faretto principale segue il cursore **solo su richiesta**
   (prima si muoveva a ogni `mousemove` con offset ±3.2 unità).

### 1.4 Bug di rendering (three.js / geometria)

- **Normali e avvolgimento dei tagli invertiti.** `addTriangle()` calcolava
  `(v3-v2) × (v1-v2)`: per un contorno antiorario il risultato è la normale **entrante**.
  Conseguenza: tavola e padiglione delle pietre venivano **cullati** (back-face culling) e le
  gemme apparivano come blob neri. Nuovo `FacetBuilder` in `gemstoneGeometry.ts` orienta ogni
  faccia verso l'esterno usando il centro della gemma (+ UV); il QA harness verifica che il
  **100% delle facce** (120 per brillante, 24 per baguette) sia avvolta e orientata correttamente.
- **Pietre del pavé girate radialmente** (`Euler(π/2, 0, rotZ)` con `rotZ` = angolo della posizione):
  le pietre sui lati destro/sinistro/inferiore mostravano il **padiglione** invece della tavola.
  Ora il ghiaccio è sospeso con `Euler(π/2, 0, k·π/2, 'ZYX')` e la tavola punta sempre verso la camera.
- **Anti-aliasing assente.** `new EffectComposer(renderer)` crea un render target proprio, quindi
  `antialias: true` sul renderer non aveva alcun effetto; l'FXAA applicato **prima** della
  `OutputPass` girava su dati lineari HDR (dove non è pensato per funzionare).
  Ora il composer usa un target **MSAA 4× half-float** e la FXAA è stata rimossa.
- **HDRI inesistente.** `public/assets/studio_black_white_sharp.hdr` era un file di **45 byte**
  (solo header RADIANCE, nessun dato): `RGBELoader` falliva sempre e tutto ricadeva sul fallback.
  Ora l'ambiente è **generato proceduralmente** (canvas → PMREM) con 4 layout di softbox
  selezionabili, rotazione IBL e controllo intensità: zero asset esterni, funziona anche da `file://`.
- **`envMapIntensity` non veniva applicata.** three.js r155+ sovrascrive `material.envMapIntensity`
  con `scene.environmentIntensity` quando `material.envMap === null` (vedi `WebGLRenderer`).
  Il controllo globale dell'IBL è quindi su `scene.environmentIntensity`.
- **Catena cubana ricostruita.** I link erano posizionati su una curva arbitraria con
  `rotation.set(pitch, yaw, roll)` senza relazione con la pendenza: gli anelli si compenetravano.
  Ora una `CatmullRomCurve3` con **frame ortonormale** (l'anello giace nel piano della tangente),
  piani alternati per l'incastro: verificato senza intersezioni.
- **`castShadow` senza ricevente**: nessun oggetto aveva `receiveShadow`, quindi le shadow map non
  producevano alcun effetto visibile (solo costo). Ora le ombre funzionano davvero (PCF soft,
  `normalBias` sulle griffe) e il pavé è istanziato.
- Altre correzioni: `renderer.setSize` senza `updateStyle` spaccava allineamento canvas/DOM;
  il `ResizeObserver` ridispatchava `window.resize` senza aggiornare la camera;
  il listener di resize era su `window` mentre il canvas è `absolute`;
  `useEffect[]` catturava lo stato iniziale (ora tutto passa da `handle.applySettings`);
  `noUnusedLocals` era violato in più punti (`fontLoader`, `innerHole`…);
  le geometrie non venivano mai liberate (ora `dispose()` completo + `renderer.dispose()`).

### 1.5 Robustezza e igiene del progetto

- **Error boundary** attorno al viewer, overlay di errore WebGL con retry, gestione di
  `webglcontextlost`.
- Nessun `forceContextLoss()` in cleanup: in React StrictMode l'effetto viene montato due volte
  sullo **stesso** `<canvas>` e uccidere il contesto rompeva il secondo mount.
- `index.html`: rimossa la richiesta `Cinzel:900` (peso inesistente, 400/600/700 sono i reali),
  titolo/lingua/descrizione corretti, `noscript`, `color-scheme: dark`.
- **Asset inesistenti** (`public/assets`, `public/textures`: un typeface orfano e il finto HDRI)
  rimossi; `src/jewelry/index.ts` importava `./fonts/luxurySerifFont` (file inesistente → errore TS).
- Dipendenze: **Vite aggiornato a 7.3.6** (le 7.0–7.3.3 hanno l'advisory GHSA-v6wh-96g9-6wx3);
  `npm audit` pulito; nome/versione/script del `package.json` allineati al progetto.

---

## 2. Funzionalità aggiunte

- **Nome libero** con 3 font serif, maiuscole, spaziatura lettere, spessore incisione, dimensione,
  auto-fit e avviso sui caratteri non supportati.
- **Materiali**: 5 metalli (platino, rodio, titanio, gunmetal, ceramica) × 4 finiture
  (specchio, lucido, satinato, opaco) + 4 pietre (diamante, diamante nero, ossidiana, quarzo fumé)
  con IOR, trasmissione e attenuazione reali.
- **Luci**: 4 preset con IBL rigenerato, intensità ambiente, rotazione ambiente, master dei faretti,
  esposizione ACES, 4 fondali, luce-che-segue-il-cursore (opt-in).
- **Viste camera**: 6 preset con **inquadratura adattiva** — FOV e distanza derivano dalla finestra
  visibile e dall'aspect ratio, quindi il gioiello è sempre interamente in frame, anche in portrait.
- **Qualità**: bozza / standard / alta (tessellazione, bevel e pixel ratio) con rigenerazione dell'incisione.
- **Cattura**: 1×–4× (fino a 4096 px), sfondo trasparente, anteprima e download nominato.
- **Scorciatoie**: `1…6` viste, `R` rotazione, `W` wireframe, `B` bloom, `C` cattura, `P` pannello,
  `H` nascondi interfaccia, `Esc` chiudi.
- **Telemetria reale**: FPS, triangoli, oggetti, draw call, pietre, corpo calcolato, pixel ratio.

---

## 3. Architettura

```
src/
  components/
    JewelryViewer.tsx    orchestrazione UI + ciclo di vita della scena
    panels.tsx           pannelli (nome, materiali, luci, render, telemetria, specifiche)
    ui.tsx               primitive monocrome (panel, slider, segmented, toggle)
    ErrorBoundary.tsx
  jewelry/
    initJewelryScene.ts  bootstrap: renderer, camera, controlli, loop, impostazioni, capture
    cameraFraming.ts     FOV/distanza adattivi all'aspect ratio
    jewelryBuilder.ts    assemblaggio (castone, azurage, pavé, baguette, bail, catena, testo 3D)
    gemstoneGeometry.ts  tagli sfaccettati con normali corrette
    materials.ts         libreria PBR monocroma condivisa
    studioEnvironment.ts IBL procedurale + faretti + fondale
    postprocessing.ts    composer MSAA half-float + bloom + SSAO opzionale + OutputPass ACES
    fonts/               typeface.json reali + registry
    types.ts             preset, impostazioni, limiti, statistiche
tools/                   QA offline (harness + rasterizzatore software + generatore typeface)
```

**Flusso aggiornamenti UI → scena.** `patch()` per i cambiamenti economici (materiali, luci,
camera); `patchDeferred()` per quelli che ricostruiscono la geometria del testo (coalescati a 150 ms,
con lettura del valore più recente per evitare stati obsoleti). La scena è l'unica fonte di verità
per le modifiche che avvengono al suo interno (click sul gioiello → `onSettingsChange`).

---

## 4. QA offline

`npm run verify:scene` compila i moduli "DOM-free" della scena con esbuild e verifica
(**28 controlli**, tutti verdi):

- **Faceting**: ogni faccia di brillante e baguette è avvolta e orientata verso l'esterno (100%),
  nessun `NaN`;
- **Testo**: 10 nomi × 3 font, inclusi accenti, apostrofi, maiuscole, testo vuoto: sempre dentro la
  finestra del castone, caratteri mancanti segnalati;
- **Copertura alfabeto** su tutti i font;
- **Layout**: pavé esattamente sulla fascia del castone (0 pietre nella finestra), catena senza
  anelli sovrapposti, nome dentro la finestra, solitari e baguette non collidenti;
- **Ambiente procedurale**: i 4 layout di softbox e i 4 fondali vengono generati (2D canvas stubbato)
  e producono risultati distinti.

Poi rasterizza la geometria reale con un piccolo renderer software (`tools/softrender.mjs`) e salva
i PNG in `tools/out/` per l'ispezione visiva, con la stessa matematica di inquadratura dell'app.

Licenza dei font: vedi `LICENSES-fonts.md`.
