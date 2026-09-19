import React from 'react';
import {
  Camera,
  Circle,
  Clapperboard,
  Contrast,
  Crosshair,
  Diamond,
  Download,
  Film,
  Gauge,
  Image as ImageIcon,
  Info,
  Layers,
  Lightbulb,
  Pause,
  Play,
  Ruler,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Timer,
  Type,
  Video,
  Wand2,
} from 'lucide-react';
import { Panel, SectionTitle, SegmentedControl, Slider, ToggleRow } from './ui';
import { FONT_IDS, FONT_PRESETS, getFontCoverage } from '../jewelry/fonts';
import { type DirectorState, type TakeProgress, type TakeResult } from '../jewelry';
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
 * Regia (motion control): timeline, otturatore, take
 * ------------------------------------------------------------------ */

export interface DirectorPanelProps {
  settings: JewelrySettings;
  patch: (patch: Partial<JewelrySettings>) => void;
  director: DirectorState;
  progress: TakeProgress | null;
  take: TakeResult | null;
  onTransport: (command: 'play' | 'pause' | 'toggle' | 'stop' | 'prev' | 'next') => void;
  onSeek: (time: number) => void;
  onRecord: () => void;
  onCancel: () => void;
  onDownload: (file: TakeResult['files'][number]) => void;
  onDownloadAll: () => void;
}

/** timecode SRT style: 00:04.13 */
const timecode = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
};

const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export const DirectorPanel: React.FC<DirectorPanelProps> = ({
  settings,
  patch,
  director,
  progress,
  take,
  onTransport,
  onSeek,
  onRecord,
  onCancel,
  onDownload,
  onDownloadAll,
}) => {
  const recording = director.recording;
  const frame = Math.round(director.time * director.fps);
  const busy = progress !== null;

  return (
    <Panel>
      <SectionTitle
        icon={<Clapperboard className="w-3.5 h-3.5" />}
        title="Regia · motion control"
        hint="Camera, piatto girevole e luci sono funzioni del tempo: la ripresa è ripetibile"
        right={
          <span
            className={
              recording
                ? 'text-[9px] font-mono-cad px-1.5 py-0.5 bg-red-500 text-black font-semibold animate-pulse'
                : 'text-[9px] font-mono-cad px-1.5 py-0.5 border border-white/20 text-zinc-500'
            }
          >
            {recording ? 'REC' : 'STBY'}
          </span>
        }
      />

      {/* clip ------------------------------------------------------ */}
      <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">Clip</div>
      <div className="grid grid-cols-1 gap-[3px]">
        {director.clips.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => patch({ clip: entry.id })}
            className={
              entry.id === director.clip
                ? 'px-2 py-1.5 text-left border bg-white text-black border-white'
                : 'px-2 py-1.5 text-left border bg-zinc-950/70 text-zinc-300 border-white/12 hover:border-white/45'
            }
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono-cad uppercase tracking-wide truncate">
                {entry.label}
              </span>
              <span
                className={
                  entry.id === director.clip
                    ? 'text-[9px] font-mono-cad text-black/70'
                    : 'text-[9px] font-mono-cad text-zinc-500'
                }
              >
                {entry.duration}s{entry.loop ? ' ⟲' : ''}
              </span>
            </span>
            <span
              className={
                entry.id === director.clip
                  ? 'block text-[9px] font-mono-cad text-black/60 leading-snug'
                  : 'block text-[9px] font-mono-cad text-zinc-500 leading-snug'
              }
            >
              {entry.hint}
            </span>
          </button>
        ))}
      </div>

      {/* trasporto ------------------------------------------------- */}
      <div className="pt-1 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono-cad">
          <span className="text-zinc-400 uppercase tracking-wide">Trasporto</span>
          <span className="text-white font-semibold">
            {timecode(director.time)} <span className="text-zinc-500">/ {timecode(director.duration)}</span>
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(0.001, director.duration)}
          step={1 / Math.max(1, director.fps)}
          value={director.time}
          onChange={(event) => onSeek(parseFloat(event.target.value))}
          aria-label="Posizione nella timeline"
          className="w-full h-1 appearance-none bg-zinc-800 accent-white cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                     [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white
                     [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
        />
        <div className="flex items-center justify-between text-[9px] font-mono-cad text-zinc-500">
          <span>
            fotogramma {String(Math.min(frame + 1, director.frames)).padStart(3, '0')} / {director.frames}
          </span>
          <span>
            {director.fps} fps · {director.loop ? 'loop' : 'one-shot'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-[3px]">
          {[
            { id: 'prev', icon: <SkipBack className="w-3.5 h-3.5" />, label: 'Fotogramma −', action: 'prev' as const },
            {
              id: 'toggle',
              icon: director.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />,
              label: director.playing ? 'Pausa' : 'Riproduci',
              action: 'toggle' as const,
            },
            { id: 'next', icon: <SkipForward className="w-3.5 h-3.5" />, label: 'Fotogramma +', action: 'next' as const },
            { id: 'stop', icon: <Square className="w-3.5 h-3.5" />, label: 'Torna a inizio', action: 'stop' as const },
          ].map((control) => (
            <button
              key={control.id}
              type="button"
              title={control.label}
              aria-label={control.label}
              onClick={() => onTransport(control.action)}
              className={
                control.id === 'toggle'
                  ? 'py-1.5 flex items-center justify-center border bg-white text-black border-white hover:bg-zinc-200'
                  : 'py-1.5 flex items-center justify-center border bg-zinc-950/80 text-zinc-300 border-white/20 hover:border-white/60 hover:text-white'
              }
            >
              {control.icon}
            </button>
          ))}
        </div>
        <ToggleRow
          label="Loop del take"
          hint="La riproduzione riavvolge invece di fermarsi"
          checked={settings.loopTake}
          onChange={(checked) => patch({ loopTake: checked })}
        />
        <div className="flex items-center gap-1 text-[9px] font-mono-cad text-zinc-500">
          <Timer className="w-3 h-3" />
          <span>
            scorciatoie: spazio play/pausa · ← → fotogrammi · S inizio · K registra
          </span>
        </div>
      </div>

      {/* movimento ------------------------------------------------ */}
      <div className="pt-1.5 space-y-2 border-t border-white/10">
        <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">
          Motion blur · otturatore
        </div>
        <ToggleRow
          label="Integrazione sull'otturatore"
          hint="Sub-frame reali sommati: è blur vero, non un filtro"
          checked={settings.motionBlur}
          onChange={(checked) => patch({ motionBlur: checked })}
        />
        <Slider
          label="Angolo di otturatore"
          value={settings.shutterAngle}
          {...SETTINGS_LIMITS.shutterAngle}
          onChange={(value) => patch({ shutterAngle: value })}
          format={(value) => `${value.toFixed(0)}° (${(value / 360).toFixed(2)} fot.)`}
        />
        <Slider
          label="Sub-frame per fotogramma"
          value={settings.shutterSamples}
          {...SETTINGS_LIMITS.shutterSamples}
          onChange={(value) => patch({ shutterSamples: value })}
          format={(value) => `${value.toFixed(0)} campioni`}
        />

        <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500 pt-1">
          Profondità di campo
        </div>
        <ToggleRow
          label="DOF (bokeh)"
          hint="Fuoco selettivo su placca e nome"
          checked={settings.dof}
          onChange={(checked) => patch({ dof: checked })}
        />
        <Slider
          label="Distanza di fuoco"
          value={settings.focusDistance}
          {...SETTINGS_LIMITS.focusDistance}
          onChange={(value) => patch({ focusDistance: value })}
          format={(value) => `${value.toFixed(1)} u`}
        />
        <Slider
          label="Apertura"
          value={settings.dofAperture}
          {...SETTINGS_LIMITS.dofAperture}
          onChange={(value) => patch({ dofAperture: value })}
          format={(value) => value.toFixed(5)}
        />
        <Slider
          label="Sfocatura massima"
          value={settings.dofMaxBlur}
          {...SETTINGS_LIMITS.dofMaxBlur}
          onChange={(value) => patch({ dofMaxBlur: value })}
          format={(value) => value.toFixed(3)}
        />
      </div>

      {/* take ----------------------------------------------------- */}
      <div className="pt-1.5 space-y-2 border-t border-white/10">
        <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">
          Take · consegna
        </div>
        <SegmentedControl
          options={[
            { id: 'webm', label: 'Video WebM', hint: 'Ripresa in tempo reale, pronta da guardare' },
            { id: 'png', label: 'Sequenza PNG', hint: 'Fotogramma-accurata, alpha e depth opzionali' },
          ]}
          value={settings.takeFormat}
          onChange={(id) => patch({ takeFormat: id })}
          columns={2}
          size="sm"
        />
        <Slider
          label="Fotogrammi al secondo"
          value={settings.takeFps}
          {...SETTINGS_LIMITS.takeFps}
          onChange={(value) => patch({ takeFps: value })}
          format={(value) => `${value.toFixed(0)} fps`}
        />
        {settings.takeFormat === 'png' ? (
          <>
            <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500">
              Risoluzione sequenza
            </div>
            <SegmentedControl
              options={[
                { id: '1', label: '1×', hint: 'Dimensione del viewport' },
                { id: '2', label: '2×', hint: 'Doppia risoluzione (max 4K sul lato lungo)' },
                { id: '3', label: '3×', hint: 'Massima qualità' },
              ]}
              value={String(settings.takeScale)}
              onChange={(id) => patch({ takeScale: Number(id) })}
              columns={3}
              size="sm"
            />
            <ToggleRow
              label="Fondo trasparente (alpha)"
              hint="Il compositor può bucare il fondale"
              checked={settings.takeTransparent}
              onChange={(checked) => patch({ takeTransparent: checked })}
            />
            <ToggleRow
              label="Pass di profondità"
              hint="Seconda serie di frame con depth packed"
              checked={settings.takeDepth}
              onChange={(checked) => patch({ takeDepth: checked })}
            />
          </>
        ) : null}

        <div className="grid grid-cols-2 gap-[3px] pt-1">
          <button
            type="button"
            onClick={onRecord}
            disabled={busy || recording}
            className={
              busy || recording
                ? 'px-2 py-2 text-[10px] font-mono-cad uppercase border bg-zinc-900 text-zinc-500 border-white/12 cursor-not-allowed flex items-center justify-center gap-1.5'
                : 'px-2 py-2 text-[10px] font-mono-cad uppercase border bg-red-500 text-black border-red-500 font-semibold hover:bg-red-400 flex items-center justify-center gap-1.5'
            }
          >
            <Circle className="w-3 h-3" /> Registra
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={!busy}
            className={
              busy
                ? 'px-2 py-2 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold hover:bg-zinc-200 flex items-center justify-center gap-1.5'
                : 'px-2 py-2 text-[10px] font-mono-cad uppercase border bg-zinc-950 text-zinc-500 border-white/12 cursor-not-allowed flex items-center justify-center gap-1.5'
            }
          >
            <Square className="w-3 h-3" /> Annulla
          </button>
        </div>

        {progress ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] font-mono-cad text-zinc-400">
              <span className="uppercase tracking-wide">
                {progress.phase === 'encode' ? 'codifica' : progress.phase === 'depth' ? 'depth + beauty' : 'render'}
              </span>
              <span>
                {progress.frame} / {progress.total}
              </span>
            </div>
            <div className="h-1 bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-white transition-[width] duration-150"
                style={{ width: `${Math.min(100, (progress.frame / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {take ? (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-[9px] font-mono-cad">
              <span className="text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                {take.format === 'webm' ? <Video className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                ultimo take · {take.frames} fotogrammi
              </span>
              <button
                type="button"
                onClick={onDownloadAll}
                className="px-1.5 py-0.5 border bg-white text-black border-white font-semibold uppercase flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> ZIP
              </button>
            </div>
            <ul className="max-h-32 overflow-y-auto space-y-[2px] pr-1">
              {take.files.slice(0, 60).map((file) => (
                <li key={file.name}>
                  <button
                    type="button"
                    onClick={() => onDownload(file)}
                    className="w-full flex items-center justify-between gap-2 px-1.5 py-1 border border-white/10 bg-zinc-950/60 text-left hover:border-white/40"
                  >
                    <span className="text-[9px] font-mono-cad text-zinc-300 truncate">{file.name}</span>
                    <span className="text-[9px] font-mono-cad text-zinc-500 shrink-0">
                      {formatBytes(file.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {take.files.length > 60 ? (
              <div className="text-[9px] font-mono-cad text-zinc-500">
                … e altri {take.files.length - 60} fotogrammi: usa lo ZIP per scaricare tutto
              </div>
            ) : null}
            {take.notes.map((note) => (
              <div key={note} className="text-[9px] font-mono-cad text-zinc-500 leading-snug">
                · {note}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[9px] font-mono-cad text-zinc-600 leading-snug">
            Nessun take registrato. Il take usa il clip selezionato, gli fps e le opzioni
            dell'otturatore qui sopra.
          </div>
        )}
      </div>
    </Panel>
  );
};

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
