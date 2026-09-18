import React from 'react';
import {
  Camera,
  Contrast,
  Crosshair,
  Diamond,
  Gauge,
  Image as ImageIcon,
  Info,
  Layers,
  Lightbulb,
  Ruler,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react';
import { Panel, SectionTitle, SegmentedControl, Slider, ToggleRow } from './ui';
import { FONT_IDS, FONT_PRESETS, getFontCoverage } from '../jewelry/fonts';
import {
  BACKDROPS,
  FINISHES,
  GEMS,
  LIGHTING_PRESETS,
  METALS,
  QUALITIES,
  SETTINGS_LIMITS,
  findGem,
  findMetal,
  type JewelrySettings,
  type SceneStats,
} from '../jewelry/types';

export interface PanelProps {
  settings: JewelrySettings;
  stats: SceneStats;
  /** immediate update: cheap changes */
  patch: (patch: Partial<JewelrySettings>) => void;
  /** deferred update: used by text rebuilds to keep the UI responsive */
  patchDeferred: (patch: Partial<JewelrySettings>) => void;
  onCapture: () => void;
}

/* ------------------------------------------------------------------ *
 * Nameplate
 * ------------------------------------------------------------------ */
export const NameplatePanel: React.FC<PanelProps> = ({ settings, stats, patch, patchDeferred }) => (
  <Panel>
    <SectionTitle
      icon={<Type className="w-3.5 h-3.5" />}
      title="Incisione 3D"
      hint="Qualsiasi nome, accenti compresi: il font viene adattato automaticamente alla targhetta"
    />

    <textarea
      rows={2}
      value={settings.text}
      maxLength={SETTINGS_LIMITS.text.maxLength}
      onChange={(event) => patchDeferred({ text: event.target.value })}
      placeholder="Scrivi un nome…"
      spellCheck={false}
      className="w-full resize-none bg-black border border-white/20 px-2.5 py-2 text-sm
                 font-serif-luxury tracking-[0.12em] text-white
                 focus:outline-none focus:border-white placeholder:text-zinc-600"
    />

    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {FONT_IDS.map((id) => {
          const preset = FONT_PRESETS[id];
          return (
            <button
              key={id}
              type="button"
              title={preset.hint}
              onClick={() => patchDeferred({ font: id })}
              className={
                settings.font === id
                  ? 'px-2 py-1 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold'
                  : 'px-2 py-1 text-[10px] font-mono-cad uppercase border bg-zinc-950 text-zinc-400 border-white/15 hover:border-white/50 hover:text-white'
              }
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => patchDeferred({ uppercase: !settings.uppercase })}
        title="Trasforma il testo in maiuscolo"
        className={
          settings.uppercase
            ? 'px-2 py-1 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold'
            : 'px-2 py-1 text-[10px] font-mono-cad uppercase border bg-zinc-950 text-zinc-400 border-white/15 hover:border-white/50'
        }
      >
        ABC
      </button>
      <button
        type="button"
        onClick={() => patch({ nameplateMaterial: settings.nameplateMaterial === 'metal' ? 'gem' : 'metal' })}
        title="Materiale della targhetta: clicca anche direttamente sul gioiello"
        className="px-2 py-1 text-[10px] font-mono-cad uppercase border bg-zinc-950 text-zinc-300 border-white/20 hover:border-white/60 hover:text-white flex items-center gap-1"
      >
        {settings.nameplateMaterial === 'metal' ? <Ruler className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
        {settings.nameplateMaterial === 'metal' ? 'Metallo' : 'Pietra'}
      </button>
    </div>

    <Slider
      label="Dimensione nome"
      value={settings.textScale}
      {...SETTINGS_LIMITS.textScale}
      onChange={(value) => patchDeferred({ textScale: value })}
      format={(value) => `${Math.round(value * 100)}%`}
    />
    <Slider
      label="Spessore incisione"
      value={settings.textDepth}
      {...SETTINGS_LIMITS.textDepth}
      onChange={(value) => patchDeferred({ textDepth: value })}
      format={(value) => `${value.toFixed(2)} u`}
    />
    <Slider
      label="Spaziatura lettere"
      value={settings.tracking}
      {...SETTINGS_LIMITS.tracking}
      onChange={(value) => patchDeferred({ tracking: value })}
      format={(value) => `${(value * 100).toFixed(1)} em`}
    />

    {settings.text.trim().length === 0 && (
      <p className="text-[9px] font-mono-cad text-zinc-500 leading-snug">
        La targhetta è vuota: scrivi un nome per generare l&apos;incisione 3D.
      </p>
    )}
    {stats.droppedChars.length > 0 && (
      <p className="text-[9px] font-mono-cad text-amber-200/80 leading-snug">
        Caratteri non presenti nel font e rimossi: {stats.droppedChars.join(' ')}
      </p>
    )}
    {stats.fittedSize > 0 && (
      <p className="text-[9px] font-mono-cad text-zinc-500">
        Corpo calcolato {stats.fittedSize.toFixed(2)} u • sviluppo {stats.textWidth.toFixed(2)} ×{' '}
        {stats.textHeight.toFixed(2)} u
      </p>
    )}
  </Panel>
);

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */
export const MaterialsPanel: React.FC<PanelProps> = ({ settings, patch }) => {
  const metal = findMetal(settings.metal);
  const gem = findGem(settings.gem);

  return (
    <Panel>
      <SectionTitle
        icon={<Diamond className="w-3.5 h-3.5" />}
        title="Materiali"
        hint="Ogni scelta si applica subito a tutto il gioiello (nome compreso)"
      />

      <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">Metallo</div>
      <SegmentedControl
        options={METALS.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
        value={settings.metal}
        onChange={(id) => patch({ metal: id })}
        columns={3}
        size="sm"
      />
      <p className="text-[9px] font-mono-cad text-zinc-500">{metal.hint}</p>

      <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">Finitura</div>
      <SegmentedControl
        options={FINISHES.map((f) => ({
          id: f.id,
          label: `${f.label} · ${f.roughness.toFixed(2)}`,
        }))}
        value={settings.finish}
        onChange={(id) => patch({ finish: id })}
        columns={2}
        size="sm"
      />

      <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">Pietra</div>
      <SegmentedControl
        options={GEMS.map((g) => ({ id: g.id, label: g.label, hint: g.hint }))}
        value={settings.gem}
        onChange={(id) => patch({ gem: id })}
        columns={2}
        size="sm"
      />
      <p className="text-[9px] font-mono-cad text-zinc-500">
        {gem.hint} • IOR {gem.ior.toFixed(3)} • trasmissione {gem.transmission.toFixed(2)}
      </p>
    </Panel>
  );
};

/* ------------------------------------------------------------------ *
 * Lighting
 * ------------------------------------------------------------------ */
export const LightingPanel: React.FC<PanelProps> = ({ settings, patch }) => (
  <Panel>
    <SectionTitle
      icon={<Lightbulb className="w-3.5 h-3.5" />}
      title="Luce & ambiente"
      hint="Preset IBL generati in tempo reale: nessun file HDRI esterno"
    />

    <SegmentedControl
      options={LIGHTING_PRESETS.map((l) => ({ id: l.id, label: l.label, hint: l.hint }))}
      value={settings.lighting}
      onChange={(id) => patch({ lighting: id })}
      columns={2}
      size="sm"
    />

    <Slider
      label="Intensità ambiente (IBL)"
      value={settings.envIntensity}
      {...SETTINGS_LIMITS.envIntensity}
      onChange={(value) => patch({ envIntensity: value })}
    />
    <Slider
      label="Rotazione ambiente"
      value={settings.envRotation}
      {...SETTINGS_LIMITS.envRotation}
      onChange={(value) => patch({ envRotation: value })}
      format={(value) => `${value.toFixed(0)}°`}
    />
    <Slider
      label="Intensità faretti"
      value={settings.lightIntensity}
      {...SETTINGS_LIMITS.lightIntensity}
      onChange={(value) => patch({ lightIntensity: value })}
      format={(value) => `${Math.round(value * 100)}%`}
    />
    <Slider
      label="Esposizione ACES"
      value={settings.exposure}
      {...SETTINGS_LIMITS.exposure}
      onChange={(value) => patch({ exposure: value })}
    />

    <ToggleRow
      label="Luce segue il cursore"
      hint="Offset leggero (±1.6u) sul faretto principale"
      checked={settings.pointerLight}
      onChange={(checked) => patch({ pointerLight: checked })}
    />

    <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">Fondale</div>
    <SegmentedControl
      options={BACKDROPS.map((b) => ({ id: b.id, label: b.label }))}
      value={settings.backdrop}
      onChange={(id) => patch({ backdrop: id })}
      columns={4}
      size="sm"
    />
  </Panel>
);

/* ------------------------------------------------------------------ *
 * Render / output
 * ------------------------------------------------------------------ */
export const RenderPanel: React.FC<PanelProps> = ({ settings, patch, onCapture }) => (
  <Panel>
    <SectionTitle
      icon={<Wand2 className="w-3.5 h-3.5" />}
      title="Render & post-produzione"
      hint="Bloom e occlusione ambientale sono opzionali: l'immagine resta leggibile"
    />

    <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">
      Qualità geometria / risoluzione
    </div>
    <SegmentedControl
      options={QUALITIES.map((q) => ({ id: q.id, label: q.label, hint: q.hint }))}
      value={settings.quality}
      onChange={(id) => patch({ quality: id })}
      columns={3}
      size="sm"
    />

    <ToggleRow
      label="Wireframe CAD"
      hint="Visibile sulla geometria reale, spegne bloom e AO"
      checked={settings.wireframe}
      onChange={(checked) => patch({ wireframe: checked })}
    />
    <ToggleRow
      label="Bloom (glare)"
      hint="Solo sugli highlight speculari"
      checked={settings.bloom}
      onChange={(checked) => patch({ bloom: checked })}
    />
    <Slider
      label="Intensità bloom"
      value={settings.bloomStrength}
      {...SETTINGS_LIMITS.bloomStrength}
      onChange={(value) => patch({ bloomStrength: value })}
    />
    <ToggleRow
      label="Occlusione ambientale (SSAO)"
      hint="Contatto tra nome, griffe e placca"
      checked={settings.ssao}
      onChange={(checked) => patch({ ssao: checked })}
    />

    <div className="grid grid-cols-2 gap-[3px] pt-1">
      <button
        type="button"
        onClick={() => patch({ autoRotate: !settings.autoRotate })}
        className={
          settings.autoRotate
            ? 'px-2 py-2 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold'
            : 'px-2 py-2 text-[10px] font-mono-cad uppercase border bg-zinc-950 text-zinc-400 border-white/15 hover:border-white/50'
        }
      >
        Rotazione {settings.autoRotate ? 'ON' : 'OFF'}
      </button>
      <button
        type="button"
        onClick={onCapture}
        className="px-2 py-2 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold hover:bg-zinc-200 flex items-center justify-center gap-1.5"
      >
        <Camera className="w-3.5 h-3.5" /> Render PNG
      </button>
    </div>
    <Slider
      label="Velocità rotazione"
      value={settings.autoRotateSpeed}
      {...SETTINGS_LIMITS.autoRotateSpeed}
      onChange={(value) => patch({ autoRotateSpeed: value })}
      format={(value) => `${value.toFixed(2)}×`}
    />
  </Panel>
);

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------ */
export const TelemetryPanel: React.FC<{ stats: SceneStats; settings: JewelrySettings }> = ({
  stats,
  settings,
}) => (
  <Panel className="hidden xl:block">
    <SectionTitle
      icon={<Gauge className="w-3.5 h-3.5" />}
      title="Telemetria CAD"
      hint="Valori reali letti dal renderer"
    />
    <dl className="text-[10px] font-mono-cad text-zinc-400 space-y-1">
      {[
        ['FPS', `${stats.fps}`],
        ['TRIANGOLI', stats.triangles.toLocaleString('it-IT')],
        ['OGGETTI', `${stats.pieces}`],
        ['DRAW CALL', `${stats.drawCalls}`],
        ['PIETRE', `${stats.stones}`],
        ['CORPO NOME', stats.fittedSize > 0 ? `${stats.fittedSize.toFixed(2)} u` : '—'],
        ['PIXEL RATIO', `${stats.renderScale.toFixed(2)}×`],
        ['FONT', FONT_PRESETS[settings.font].label],
        ['GLIFI DISPONIBILI', `${getFontCoverage(settings.font).glyphs}`],
      ].map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-white/5 pb-1">
          <dt>{label}</dt>
          <dd className="text-white">{value}</dd>
        </div>
      ))}
    </dl>
    <p className="text-[9px] font-mono-cad text-zinc-500 leading-snug flex items-start gap-1">
      <Info className="w-3 h-3 mt-[1px] shrink-0" />
      Scorciatoie: 1-6 viste camera, R rotazione, W wireframe, B bloom, C cattura, H interfaccia.
    </p>
  </Panel>
);

/* ------------------------------------------------------------------ *
 * Physics / specifications modal content
 * ------------------------------------------------------------------ */
export const SpecsTable: React.FC<{ settings: JewelrySettings }> = ({ settings }) => (
  <div className="space-y-4">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px] font-mono-cad border-collapse">
        <thead>
          <tr className="border-b border-white/20 text-zinc-400 text-[10px] uppercase">
            <th className="py-2 pr-3">Preset</th>
            <th className="py-2 px-3">Colore</th>
            <th className="py-2 px-3">Rough</th>
            <th className="py-2 px-3">Metal</th>
            <th className="py-2 px-3">Trasm.</th>
            <th className="py-2 px-3">IOR</th>
            <th className="py-2 pl-3">Clearcoat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {METALS.map((metal) => (
            <tr
              key={metal.id}
              className={settings.metal === metal.id ? 'bg-white/10 text-white' : 'text-zinc-300'}
            >
              <td className="py-2 pr-3">{metal.label}</td>
              <td className="py-2 px-3">{metal.color.toUpperCase()}</td>
              <td className="py-2 px-3">
                {settings.metal === metal.id
                  ? FINISHES.find((f) => f.id === settings.finish)?.roughness.toFixed(2)
                  : metal.roughness.toFixed(2)}
              </td>
              <td className="py-2 px-3">{metal.metalness.toFixed(2)}</td>
              <td className="py-2 px-3">0.00</td>
              <td className="py-2 px-3 text-zinc-500">N/A</td>
              <td className="py-2 pl-3">
                {settings.metal === metal.id
                  ? (FINISHES.find((f) => f.id === settings.finish)?.clearcoat ?? 0).toFixed(2)
                  : '0.00'}
              </td>
            </tr>
          ))}
          {GEMS.map((gem) => (
            <tr
              key={gem.id}
              className={settings.gem === gem.id ? 'bg-white/10 text-white' : 'text-zinc-300'}
            >
              <td className="py-2 pr-3">{gem.label}</td>
              <td className="py-2 px-3">{gem.color.toUpperCase()}</td>
              <td className="py-2 px-3">{gem.roughness.toFixed(3)}</td>
              <td className="py-2 px-3">{gem.metalness.toFixed(2)}</td>
              <td className="py-2 px-3">{gem.transmission.toFixed(2)}</td>
              <td className="py-2 px-3">{gem.ior.toFixed(3)}</td>
              <td className="py-2 pl-3">{gem.clearcoat.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="bg-black border border-white/12 p-3 space-y-2 text-[11px] font-mono-cad text-zinc-400 leading-relaxed">
      <div className="text-white font-semibold uppercase flex items-center gap-1.5">
        <Contrast className="w-3.5 h-3.5" /> Vincoli monochrome rispettati
      </div>
      <p>
        • Palette neutra: solo grigi, <span className="text-white">dispersion = 0</span>, nessuna
        dominante calda.
        <br />• Diamante: IOR 2.417 con trasmissione volumetrica; il taglio a brillante è generato
        con 57 facce orientate verso l&apos;esterno.
        <br />• Bloom soglia 1.1 (sopra il bianco diffuso) per non velare il gioiello.
        <br />• Tone mapping ACES con esposizione libera {settings.exposure.toFixed(2)}.
        <br />• Ambiente IBL generato proceduralmente: nessun file HDRI esterno (il vecchio asset da
        45 byte non era un HDRI valido).
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] font-mono-cad text-zinc-400">
      <div className="border border-white/12 p-3 space-y-1">
        <div className="text-white uppercase flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Anatomia della pieza
        </div>
        <p>• Castone a gradini PT950 con bordo lucido</p>
        <p>• Galleria posteriore traforata a nido d&apos;ape (azurage)</p>
        <p>• Pavé perimetrale con 4 griffe per pietra</p>
        <p>• 4 baguette cardinali + 4 solitari agli angoli</p>
        <p>• Maglia cubana con anello di sospensione</p>
      </div>
      <div className="border border-white/12 p-3 space-y-1">
        <div className="text-white uppercase flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5" /> Scena
        </div>
        <p>• Camera prospettica 34° • OrbitControls con damping</p>
        <p>• 3 fari con shadow map 2K + IBL PMREM</p>
        <p>• Composer MSAA 4× in half float, OutputPass ACES</p>
        <p>• Ombre PCF soft, normalBias sulle griffe</p>
      </div>
    </div>
  </div>
);

export const SnapshotMeta: React.FC<{ stats: SceneStats }> = ({ stats }) => (
  <div className="flex items-center gap-3 text-[10px] font-mono-cad text-zinc-500">
    <span className="flex items-center gap-1">
      <ImageIcon className="w-3 h-3" /> PNG lossless
    </span>
    <span className="flex items-center gap-1">
      <Ruler className="w-3 h-3" /> {stats.renderScale.toFixed(2)}× viewport
    </span>
  </div>
);
