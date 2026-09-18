import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Compass,
  Diamond,
  Eye,
  Info,
  Keyboard,
  Layers,
  Maximize,
  RotateCw,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { initJewelryScene, type CaptureOptions, type JewelrySceneHandle } from '../jewelry/initJewelryScene';
import {
  CAMERA_VIEWS,
  DEFAULT_SETTINGS,
  QUALITIES,
  findQuality,
  type CameraViewId,
  type JewelrySettings,
  type SceneStats,
} from '../jewelry/types';
import {
  LightingPanel,
  MaterialsPanel,
  NameplatePanel,
  RenderPanel,
  SnapshotMeta,
  SpecsTable,
  TelemetryPanel,
  type PanelProps,
} from './panels';
import { Toolbar } from './ui';
import { cn } from '../utils/cn';

const EMPTY_STATS: SceneStats = {
  fps: 0,
  triangles: 0,
  stones: 0,
  pieces: 0,
  drawCalls: 0,
  textWidth: 0,
  textHeight: 0,
  fittedSize: 0,
  droppedChars: [],
  renderScale: 1,
};

interface Snapshot {
  url: string;
  width: number;
  height: number;
  bytes: number;
  transparent: boolean;
}

export const JewelryViewer: React.FC = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<JewelrySceneHandle | null>(null);

  const [settings, setSettings] = useState<JewelrySettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<SceneStats>(EMPTY_STATS);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(
    typeof window === 'undefined' ? true : window.innerWidth >= 1180
  );
  const [uiVisible, setUiVisible] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [captureScale, setCaptureScale] = useState<2 | 3 | 4>(2);
  const [captureTransparent, setCaptureTransparent] = useState(false);

  // latest settings, readable from async callbacks without re-creating them
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /* ---------------------------------------------------------------- *
   * Scene lifecycle
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    void initJewelryScene(canvas, {
      initialSettings: settingsRef.current,
      onStats: (next) => setStats(next),
      onSettingsChange: (patch) => setSettings((prev) => ({ ...prev, ...patch })),
      onError: (error) => {
        setErrorMessage(error.message);
        setStatus('error');
      },
    })
      .then((handle) => {
        if (disposed) {
          handle.dispose();
          return;
        }
        sceneRef.current = handle;
        handle.applySettings(settingsRef.current);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error('[JewelryViewer] scene init failed', error);
        if (disposed) return;
        setErrorMessage(error instanceof Error ? error.message : 'Errore di inizializzazione WebGL');
        setStatus('error');
      });

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * Settings plumbing
   *
   * `patch`  -> immediate: cheap changes (materials, light, camera)
   * `patchDeferred` -> coalesced: anything that rebuilds the 3D text
   * ---------------------------------------------------------------- */
  const pendingKeys = useRef<Set<keyof JewelrySettings>>(new Set());
  const pendingTimer = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    if (pendingKeys.current.size === 0) return;
    const patch: Partial<JewelrySettings> = {};
    pendingKeys.current.forEach((key) => {
      // read the freshest value so a queued rebuild never applies stale data
      (patch as Record<string, unknown>)[key] = settingsRef.current[key];
    });
    pendingKeys.current.clear();
    sceneRef.current?.applySettings(patch);
  }, []);

  useEffect(() => () => flushPending(), [flushPending]);

  const patch = useCallback((next: Partial<JewelrySettings>) => {
    setSettings((prev) => ({ ...prev, ...next }));
    sceneRef.current?.applySettings(next);
  }, []);

  const patchDeferred = useCallback(
    (next: Partial<JewelrySettings>) => {
      setSettings((prev) => ({ ...prev, ...next }));
      Object.keys(next).forEach((key) => pendingKeys.current.add(key as keyof JewelrySettings));
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
      pendingTimer.current = window.setTimeout(flushPending, 150);
    },
    [flushPending]
  );

  const panelProps: PanelProps = {
    settings,
    stats,
    patch,
    patchDeferred,
    onCapture: () => undefined,
  };

  /* ---------------------------------------------------------------- *
   * Camera views
   * ---------------------------------------------------------------- */
  const handleCameraView = useCallback(
    (view: CameraViewId) => {
      setSettings((prev) => ({ ...prev, cameraView: view }));
      sceneRef.current?.setCameraView(view);
    },
    []
  );

  /* ---------------------------------------------------------------- *
   * Capture
   * ---------------------------------------------------------------- */
  const runCapture = useCallback(
    (options: CaptureOptions) => {
      const handle = sceneRef.current;
      if (!handle) return;
      const url = handle.capture(options);
      const image = new Image();
      image.onload = () =>
        setSnapshot({
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          bytes: Math.round(url.length * 0.75),
          transparent: Boolean(options.transparent),
        });
      image.src = url;
    },
    []
  );

  const handleCapture = useCallback(
    () => runCapture({ scale: captureScale, transparent: captureTransparent }),
    [captureScale, captureTransparent, runCapture]
  );

  /* ---------------------------------------------------------------- *
   * Keyboard shortcuts
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const index = Number.parseInt(event.key, 10);
      if (!Number.isNaN(index) && index >= 1 && index <= CAMERA_VIEWS.length) {
        handleCameraView(CAMERA_VIEWS[index - 1].id);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'r':
          patch({ autoRotate: !settingsRef.current.autoRotate });
          break;
        case 'w':
          patch({ wireframe: !settingsRef.current.wireframe });
          break;
        case 'b':
          patch({ bloom: !settingsRef.current.bloom });
          break;
        case 'c':
          handleCapture();
          break;
        case 'h':
          setUiVisible((visible) => !visible);
          break;
        case 'p':
          setPanelOpen((open) => !open);
          break;
        case 'escape':
          setSnapshot(null);
          setSpecsOpen(false);
          setShortcutsOpen(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCameraView, handleCapture, patch]);

  const quality = findQuality(settings.quality);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white select-none">
      {/* 3D viewport. When the control panel is docked the host shrinks so the
          auto-framing keeps the whole piece inside the visible area. */}
      <div
        ref={hostRef}
        className={cn(
          'absolute inset-0 transition-[right] duration-300 ease-out',
          panelOpen && 'sm:right-[21rem]'
        )}
      >
        <canvas
          ref={canvasRef}
          aria-label={`Vista 3D del gioiello: ciondolo con nome inciso ${settings.text.trim() || '—'}`}
          className="block w-full h-full cursor-grab active:cursor-grabbing touch-none"
        />
      </div>

      {/* Loading / error overlay */}
      {status !== 'ready' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/92 backdrop-blur-md px-6 text-center">
          {status === 'loading' ? (
            <>
              <div className="w-14 h-14 border border-white/20 border-t-white rounded-full animate-spin mb-6" />
              <h2 className="text-lg md:text-xl tracking-[0.3em] font-serif-luxury text-white">
                MAISON WILLIAM
              </h2>
              <p className="text-[10px] font-mono-cad text-zinc-400 mt-3 tracking-[0.2em] uppercase">
                Generazione ambiente IBL • assemblaggio pavé • incisione 3D
              </p>
            </>
          ) : (
            <>
              <X className="w-8 h-8 text-white mb-4" />
              <h2 className="text-lg tracking-[0.25em] font-serif-luxury">RENDERER NON DISPONIBILE</h2>
              <p className="text-xs font-mono-cad text-zinc-400 mt-3 max-w-md leading-relaxed">
                {errorMessage ?? 'WebGL non è attivo su questo dispositivo.'}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-6 px-4 py-2 bg-white text-black text-[11px] font-mono-cad uppercase font-semibold"
              >
                Riprova
              </button>
            </>
          )}
        </div>
      )}

      {uiVisible && (
        <>
          {/* Header */}
          <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4 md:px-6 py-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-none">

            <div className="flex items-center gap-3 pointer-events-auto min-w-0">
              <div className="w-9 h-9 border border-white/30 flex items-center justify-center bg-white/5 backdrop-blur-sm shrink-0">
                <Diamond className="w-4.5 h-4.5 text-white" strokeWidth={1.4} />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-serif-luxury font-bold tracking-[0.25em] truncate">
                  MAISON WILLIAM
                </h1>
                <p className="text-[9px] font-mono-cad text-zinc-500 tracking-[0.18em] uppercase truncate">
                  {settings.text.trim() ? `PIEZA «${settings.text.trim()}»` : 'PIEZA PERSONALIZZADA'} •{' '}
                  {quality.label} • {settings.wireframe ? 'WIREFRAME CAD' : 'PBR MONOCROMO'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pointer-events-auto">
              <Toolbar
                label="Specifiche"
                title="Tabella fisica dei materiali"
                icon={<Info className="w-3.5 h-3.5" />}
                onClick={() => setSpecsOpen(true)}
              />
              <Toolbar
                label="Scorciatoie"
                title="Scorciatoie da tastiera"
                icon={<Keyboard className="w-3.5 h-3.5" />}
                onClick={() => setShortcutsOpen((open) => !open)}
                active={shortcutsOpen}
              />
              <Toolbar
                label="Controlli"
                title="Mostra/nascondi il pannello di controllo (P)"
                icon={<Sliders className="w-3.5 h-3.5" />}
                onClick={() => setPanelOpen((open) => !open)}
                active={panelOpen}
              />
              <Toolbar
                label={`Render ${captureScale}×`}
                title="Cattura PNG alla risoluzione scelta"
                icon={<Camera className="w-3.5 h-3.5" />}
                onClick={handleCapture}
                variant="primary"
              />
            </div>
          </header>

          {/* Camera rail */}
          <div className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 hidden md:flex flex-col gap-[3px]">
            <div className="text-[9px] font-mono-cad uppercase tracking-[0.2em] text-zinc-500 mb-1 px-1">
              Viste
            </div>
            {CAMERA_VIEWS.map((view, index) => {
              const active = settings.cameraView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  title={`${view.hint} (${index + 1})`}
                  onClick={() => handleCameraView(view.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-[11px] font-mono-cad border transition-colors text-left backdrop-blur-md',
                    active
                      ? 'bg-white text-black border-white font-semibold'
                      : 'bg-black/70 text-zinc-400 border-white/12 hover:text-white hover:border-white/50'
                  )}
                >
                  <span className="text-[9px] opacity-60">{index + 1}</span>
                  <span className="tracking-wide uppercase">{view.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              title="Rotazione cinematografica (R)"
              onClick={() => patch({ autoRotate: !settings.autoRotate })}
              className={cn(
                'mt-2 flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-mono-cad uppercase border backdrop-blur-md transition-colors',
                settings.autoRotate
                  ? 'bg-zinc-900/90 border-white/40 text-white'
                  : 'bg-black/70 border-white/12 text-zinc-500 hover:text-zinc-300'
              )}
            >
              <span className="flex items-center gap-1.5">
                <RotateCw
                  className={cn('w-3.5 h-3.5', settings.autoRotate && 'animate-spin')}
                  style={{ animationDuration: '7s' }}
                />
                Rotazione
              </span>
              <span className={cn('text-[9px] px-1', settings.autoRotate ? 'bg-white text-black' : 'bg-zinc-800')}>
                {settings.autoRotate ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>

          {/* Control panel */}
          <aside
            className={cn(
              'absolute z-30 right-0 top-0 bottom-0 w-[19rem] sm:w-[21rem] p-3 pt-16 space-y-3 overflow-y-auto',
              'bg-black/70 backdrop-blur-xl border-l border-white/12 transition-transform duration-300',
              panelOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <NameplatePanel {...panelProps} />
            <MaterialsPanel {...panelProps} />
            <LightingPanel {...panelProps} />
            <RenderPanel {...panelProps} onCapture={handleCapture} />
            <TelemetryPanel stats={stats} settings={settings} />

            <div className="flex flex-wrap gap-[3px] pb-4">
              {([2, 3, 4] as const).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setCaptureScale(scale)}
                  className={cn(
                    'flex-1 px-2 py-1.5 text-[10px] font-mono-cad uppercase border',
                    captureScale === scale
                      ? 'bg-white text-black border-white font-semibold'
                      : 'bg-zinc-950 text-zinc-400 border-white/12 hover:border-white/40'
                  )}
                >
                  {scale}× ({Math.min(scale * 100, 400)}% max)
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCaptureTransparent(!captureTransparent)}
                className={cn(
                  'w-full px-2 py-1.5 text-[10px] font-mono-cad uppercase border',
                  captureTransparent
                    ? 'bg-white text-black border-white font-semibold'
                    : 'bg-zinc-950 text-zinc-400 border-white/12 hover:border-white/40'
                )}
              >
                Sfondo trasparente {captureTransparent ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const defaults = { ...DEFAULT_SETTINGS };
                  setSettings(defaults);
                  sceneRef.current?.applySettings(defaults);
                  sceneRef.current?.setCameraView(defaults.cameraView);
                }}
                className="w-full px-2 py-1.5 text-[10px] font-mono-cad uppercase border bg-zinc-950 text-zinc-400 border-white/12 hover:border-white/40"
              >
                Ripristina impostazioni
              </button>
            </div>
          </aside>

          {/* Mobile camera strip */}
          <div className="absolute bottom-0 left-0 right-0 z-20 md:hidden flex gap-[3px] px-3 py-3 overflow-x-auto bg-gradient-to-t from-black/90 to-transparent">
            {CAMERA_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => handleCameraView(view.id)}
                className={cn(
                  'shrink-0 px-3 py-2 text-[10px] font-mono-cad uppercase border',
                  settings.cameraView === view.id
                    ? 'bg-white text-black border-white font-semibold'
                    : 'bg-black/70 text-zinc-400 border-white/15'
                )}
              >
                {view.label}
              </button>
            ))}
          </div>

          {/* Status strip */}
          {(status === 'ready' || stats.fps > 0) && (
            <div
              className={cn(
                'absolute bottom-3 left-3 md:left-6 z-20 hidden md:flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-black/70 border border-white/12 backdrop-blur-md text-[10px] font-mono-cad text-zinc-400 pointer-events-none transition-[right] duration-300',
                panelOpen ? 'right-[22rem]' : 'right-4'
              )}
            >
              <span className="flex items-center gap-1.5 text-white">
                <Layers className="w-3.5 h-3.5" />
                {stats.triangles.toLocaleString('it-IT')} triangoli
              </span>
              <span>{stats.stones} pietre</span>
              <span>{stats.drawCalls} draw call</span>
              <span>{stats.fps} fps</span>
              <span className="hidden lg:inline">
                clicca il gioiello per invertire il materiale del nome
              </span>
            </div>
          )}
        </>
      )}

      {/* Shortcuts */}
      {shortcutsOpen && (
        <div className="absolute top-16 right-4 z-40 w-72 bg-black/95 border border-white/20 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono-cad uppercase tracking-widest text-white">
              Scorciatoie
            </span>
            <button type="button" onClick={() => setShortcutsOpen(false)} className="text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="text-[11px] font-mono-cad text-zinc-400 space-y-1.5">
            {[
              ['1 … 6', 'viste camera'],
              ['R', 'rotazione automatica'],
              ['W', 'wireframe CAD'],
              ['B', 'bloom'],
              ['C', 'cattura PNG'],
              ['P', 'pannello controlli'],
              ['H', 'nascondi interfaccia'],
              ['Trascina', 'orbita'],
              ['Rotella', 'zoom'],
              ['Tasto destro', 'pan'],
            ].map(([key, label]) => (
              <li key={key} className="flex justify-between gap-3 border-b border-white/5 pb-1">
                <span className="text-white">{key}</span>
                <span className="text-zinc-500">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Specifications modal */}
      {specsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-white/20 w-full max-w-3xl max-h-[88vh] overflow-y-auto p-5 md:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/15">
              <div>
                <h3 className="text-base font-serif-luxury font-bold tracking-[0.2em] text-white uppercase">
                  Fisica & materiali
                </h3>
                <p className="text-[10px] font-mono-cad text-zinc-500 uppercase tracking-wide">
                  Matrice PBR monocroma • nessuna aberrazione cromatica
                </p>
              </div>
              <button type="button" onClick={() => setSpecsOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SpecsTable settings={settings} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSpecsOpen(false)}
                className="px-5 py-2 bg-white text-black text-[11px] font-mono-cad font-semibold uppercase hover:bg-zinc-200"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot modal */}
      {snapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-lg p-4 md:p-8">
          <div className="bg-zinc-950 border border-white/25 w-full max-w-4xl p-4 md:p-6 space-y-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between gap-4 pb-2 border-b border-white/15">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-4 h-4 text-white shrink-0" />
                <h3 className="text-[11px] font-mono-cad uppercase tracking-[0.2em] text-white truncate">
                  Render monocromo {snapshot.width}×{snapshot.height}px
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSnapshot(null)}
                className="text-[11px] font-mono-cad text-zinc-400 hover:text-white flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> CHIUDI
              </button>
            </div>

            <div className="relative border border-white/15 bg-black max-h-[58vh] overflow-hidden flex items-center justify-center w-full">
              <img
                src={snapshot.url}
                alt="Render CAD del gioiello"
                className="max-h-[56vh] object-contain"
              />
              <div className="absolute bottom-3 right-3 bg-black/80 border border-white/25 px-2.5 py-1 text-[9px] font-mono-cad text-zinc-300">
                MAISON WILLIAM • {snapshot.transparent ? 'ALPHA' : 'FONDALE'} • ACES
              </div>
            </div>

            <div className="w-full flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <SnapshotMeta stats={{ ...stats, renderScale: captureScale }} />
                <span className="text-[9px] font-mono-cad text-zinc-600">
                  {(snapshot.bytes / 1024 / 1024).toFixed(2)} MB stimati • PNG 24-bit
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSnapshot(null)}
                  className="px-4 py-2 border border-white/20 text-[11px] font-mono-cad uppercase text-zinc-300 hover:text-white"
                >
                  Chiudi
                </button>
                <a
                  href={snapshot.url}
                  download={`William-${settings.text.trim() || 'gioiello'}-${snapshot.width}x${snapshot.height}.png`}
                  className="px-5 py-2 bg-white text-black text-[11px] font-mono-cad font-semibold uppercase hover:bg-zinc-200 flex items-center gap-1.5"
                >
                  <Maximize className="w-3.5 h-3.5" /> Scarica PNG
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating toggle when the UI is hidden */}
      {!uiVisible && (
        <button
          type="button"
          onClick={() => setUiVisible(true)}
          className="absolute bottom-4 right-4 z-40 px-3 py-2 bg-black/80 border border-white/25 text-[10px] font-mono-cad uppercase text-zinc-300 hover:text-white flex items-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" /> Mostra interfaccia
        </button>
      )}

      {/* Camera view badge for wide layouts */}
      {uiVisible && status === 'ready' && (
        <div
          className={cn(
            'absolute top-16 left-1/2 -translate-x-1/2 z-20 hidden xl:flex items-center gap-3 px-3 py-1.5 bg-black/60 border border-white/12 backdrop-blur-md text-[10px] font-mono-cad text-zinc-400 pointer-events-none transition-all duration-300',
            panelOpen && 'xl:left-[calc(50%-10.5rem)]'
          )}
        >
          <Compass className="w-3.5 h-3.5 text-white" />
          <span className="uppercase tracking-wide">{CAMERA_VIEWS.find((v) => v.id === settings.cameraView)?.hint}</span>
          <span className="text-zinc-600">|</span>
          <span>
            {QUALITIES.find((q) => q.id === settings.quality)?.label} • IBL{' '}
            {settings.envIntensity.toFixed(2)}× • ACES {settings.exposure.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
};
