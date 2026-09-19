/**
 * UI smoke test.
 *
 *   npm run verify:ui
 *
 * Bundles the React tree with esbuild and renders it with `react-dom/server`:
 * this exercises the real component logic (state, conditional panels, derived
 * values) without needing a browser or a WebGL context. It catches render-time
 * crashes such as a stale icon import or a bad prop.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const bundlePath = path.join(outDir, 'ui.bundle.mjs');
execFileSync(
  path.join(repo, 'node_modules/esbuild/bin/esbuild'),
  [
    path.join(repo, 'src/App.tsx'),
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--target=es2022',
    '--jsx=automatic',
    '--packages=external',
    '--loader:.json=json',
    `--outfile=${bundlePath}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' }
);

const React = (await import('react')).default;
const { renderToString } = await import('react-dom/server');
const { default: App } = await import(bundlePath);

let html = '';
let error = null;
try {
  html = renderToString(React.createElement(App));
} catch (cause) {
  error = cause;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

check('albero React renderizzato senza eccezioni', !error, error ? String(error.message) : `${html.length} byte di HTML`);
if (error) {
  console.error(error);
  process.exit(1);
}

const expectations = [
  ['intestazione maison', /MAISON WILLIAM/],
  ['overlay di caricamento', /Generazione ambiente IBL/],
  ['canvas 3D con etichetta accessibile', /<canvas[^>]+aria-label="Vista 3D del gioiello/],
  ['viste camera', /3\/4 Hero/],
  ['pannello incisione', /Incisione 3D/],
  ['selettore font', /Bodoni Moda/],
  ['pannello materiali', /Materiali/],
  ['pannello luci', /Luce &amp; ambiente|Luce & ambiente/],
  ['pannello render', /Render &amp; post-produzione|Render & post-produzione/],
  ['scorciatoie in telemetria', /Scorciatoie/],
  ['pannello regia presente', /Regia · motion control/],
  ['selettore clip con tutti i preset', /Hero orbit[\s\S]*Push in[\s\S]*Gru zenitale[\s\S]*Reveal azurage[\s\S]*Profilo tecnico/],
  ['trasporto con timecode', /00:00\.00/],
  // react-dom/server interpone dei marker fra i nodi di testo: i pattern li tollerano
  ['contatore fotogrammi', /fotogramma[\s\S]{0,20}001[\s\S]{0,20}\/[\s\S]{0,20}240/],
  ['otturatore e DOF regolabili', /Angolo di otturatore[\s\S]*Sub-frame per fotogramma[\s\S]*Distanza di fuoco[\s\S]*Apertura/],
  ['consegna take (video + sequenza)', /Video WebM[\s\S]*Sequenza PNG/],
  ['pulsante di registrazione', /Registra/],
  ['stima del peso del take prima di registrare', /fotogrammi[\s\S]{0,80}~[\s\S]{0,20}(kB|MB)/],
  ['misura della strisciata sull\'otturatore', /Strisciata misurata/],
  ['diagnostica di consegna', /Diagnostica consegna[\s\S]{0,200}dialogo di salvataggio/],
  ['tempo di otturatore esplicitato in millisecondi', /otturatore[\s\S]{0,220}campionati in[\s\S]{0,60}passaggi/],
  ['HUD di ripresa attivo sul viewport', /Posizione nella timeline/],
  ['scorciatoia play/pausa documentata', /scorciatoie: spazio play\/pausa[\s\S]{0,60}fotogrammi[\s\S]{0,40}K registra/],
];
for (const [label, pattern] of expectations) {
  check(label, pattern.test(html));
}

// the loading overlay must not hide a broken tree: no placeholder strings
check('nessun testo segnaposto', !/undefined|NaN|\[object Object\]/.test(html));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controlli superati`);
if (failed.length) process.exitCode = 1;
