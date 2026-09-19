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
  Circle,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
} from 'lucide-react';
import { zipSync } from 'fflate';
import { initJewelryScene, type CaptureOptions, type JewelrySceneHandle } from '../jewelry/initJewelryScene';
import {
  CLIP_PRESETS,
  findClip,
  frameCountOf,
  takeDuration,
} from '../jewelry/timeline';
import type { DirectorState } from '../jewelry/initJewelryScene';
import type { TakeFile, TakePlan, TakeProgress, TakeResult } from '../jewelry/takeRecorder';
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
  DirectorPanel,
  SnapshotMeta,
  SpecsTable,
  TelemetryPanel,
  type PanelProps,
} from './panels';
import { Toolbar } from './ui';
import { TakeViewer } from './TakeViewer';
import {
  describeEnvironment,
  openInNewTab,
  saveBlobSafely,
  type DeliveryEnvironment,
} from '../utils/delivery';
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

/** riassunto dei clip per lo stato iniziale, prima che la scena sia pronta */
const CLIP_SUMMARY = CLIP_PRESETS.map((clip) => ({
  id: clip.id,
  label: clip.label,
  hint: clip.hint,
  duration: clip.duration,
  loop: clip.loop,
}));

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

  const [director, setDirector] = useState<DirectorState>(() => ({
    clip: DEFAULT_SETTINGS.clip,
    clipLabel: findClip(DEFAULT_SETTINGS.clip).label,
    clips: CLIP_SUMMARY,
    time: 0,
    duration: findClip(DEFAULT_SETTINGS.clip).duration,
    frames: frameCountOf(findClip(DEFAULT_SETTINGS.clip), DEFAULT_SETTINGS.takeFps),
    fps: DEFAULT_SETTINGS.takeFps,
    playing: false,
    recording: false,
    progress: 0,
    loop: DEFAULT_SETTINGS.loopTake,
    viewport: { width: 1440, height: 810 },
    shutter: {
      pixels: 0,
      span: 0,
      spinDegrees: 0,
      negligible: false,
      still: true,
      text: 'in attesa della scena…',
    },
  }));
  const [takeProgress, setTakeProgress] = useState<TakeProgress | null>(null);
  const [take, setTake] = useState<TakeResult | null>(null);
  // i blob del take non sono serializzabili: vivono in un ref
  const takeFilesRef = useRef<TakeFile[]>([]);
  const [takeOpen, setTakeOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [environment] = useState<DeliveryEnvironment>(() => describeEnvironment());

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
    let directorUnsubscribe: (() => void) | null = null;

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
        // la scena pubblica lo stato della regia (trasporto, avanzamento take)
        const unsubscribeState = handle.director.onState(setDirector);
        const unsubscribeProgress = handle.director.onProgress(setTakeProgress);
        directorUnsubscribe = () => {
          unsubscribeState();
          unsubscribeProgress();
        };
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
      directorUnsubscribe?.();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * Regia: trasporto, registrazione dei take, download
   * ---------------------------------------------------------------- */
  const handleTransport = useCallback(
    (command: 'play' | 'pause' | 'toggle' | 'stop' | 'prev' | 'next') => {
      const directorApi = sceneRef.current?.director;
      if (!directorApi) return;
      if (command === 'prev') directorApi.step(-1);
      else if (command === 'next') directorApi.step(1);
      else directorApi[command]();
    },
    []
  );

  const handleSeek = useCallback((time: number) => {
    sceneRef.current?.director.seek(time);
  }, []);

  const buildPlan = useCallback((): TakePlan => {
    const current = settingsRef.current;
    const clip = findClip(current.clip);
    const fps = Math.max(1, Math.round(current.takeFps));
    const frames = frameCountOf(clip, fps);
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, '')
      .slice(4);
    return {
      clipId: clip.id,
      clipLabel: clip.label,
      duration: takeDuration(clip, fps),
      fps,
      frames,
      format: current.takeFormat,
      scale: current.takeScale,
      motionBlur: current.motionBlur && current.shutterAngle > 0 && current.shutterSamples > 1,
      shutterAngle: current.shutterAngle,
      samples: Math.max(1, Math.round(current.shutterSamples)),
      transparent: current.takeTransparent && current.takeFormat === 'png',
      depth: current.takeDepth && current.takeFormat === 'png',
      prefix: `${clip.id}_${fps}fps_${stamp}`,
    };
  }, []);

  const [takeError, setTakeError] = useState<string | null>(null);

  const handleRecord = useCallback(async () => {
    const directorApi = sceneRef.current?.director;
    if (!directorApi || directorApi.state().recording) return;
    const plan = buildPlan();
    setTakeError(null);
    setSaveStatus(null);
    setTakeOpen(false);
    if (plan.format === 'webm' && typeof document !== 'undefined' && document.hidden) {
      setTakeError(
        'La ripresa video richiede la scheda in primo piano (il browser non disegna le schede nascoste). ' +
          'La sequenza PNG invece procede anche in background.'
      );
      return;
    }
    // il take precedente non serve più: libero i blob prima di riempirne altri
    takeFilesRef.current.forEach((file) => URL.revokeObjectURL(file.url));
    takeFilesRef.current = [];
    setTake(null);
    try {
      const result = await directorApi.record(plan);
      takeFilesRef.current = result.files;
      setTake(result);
      // il take si guarda subito: non deve dipendere dal download
      setTakeOpen(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        takeFilesRef.current = [];
        setTake(null);
        return;
      }
      setTakeError(error instanceof Error ? error.message : 'Registrazione non riuscita');
    }
  }, [buildPlan]);

  const handleCancelTake = useCallback(() => {
    sceneRef.current?.director.cancel();
  }, []);

  /** messaggio unico per spiegare *cosa* è successo a un salvataggio */
  const reportSave = useCallback(
    (outcome: 'picker' | 'anchor' | 'cancelled' | 'failed', name: string) => {
      if (outcome === 'picker') setSaveStatus(`${name} salvato.`);
      else if (outcome === 'anchor')
        setSaveStatus(
          environment.embedded
            ? `Download di ${name} avviato… se non compare nulla, la preview blocca i download: usa «Apri in scheda» e poi tasto destro → Salva.`
            : `Download di ${name} avviato: controlla la cartella dei download.`
        );
      else if (outcome === 'failed')
        setSaveStatus(
          `Il browser ha rifiutato il salvataggio di ${name}: usa «Apri in scheda» e poi tasto destro → Salva.`
        );
      else setSaveStatus(null);
    },
    [environment.embedded]
  );

  const handleSave = useCallback(
    async (file: TakeFile) => {
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const outcome = await saveBlobSafely(blob, file.name);
        reportSave(outcome, file.name);
      } catch (error) {
        setSaveStatus(
          `Non riesco a preparare ${file.name}: ${error instanceof Error ? error.message : 'errore'}. Usa «Apri in scheda».`
        );
      }
    },
    [reportSave]
  );

  const handleOpenFile = useCallback(
    (file: TakeFile) => {
      const opened = openInNewTab(file.url);
      setSaveStatus(
        opened
          ? `${file.name} aperto in una scheda nuova: da lì il tasto destro → «Salva con nome…» funziona sempre.`
          : 'Il browser ha bloccato l\'apertura della scheda: consenti i popup per questo sito, oppure prova il pulsante «Salva».'
      );
    },
    []
  );

  /** oltre questa soglia l'archivio in memoria non vale il rischio */
  const ZIP_BUDGET = 250 * 1024 * 1024;

  const handleDownloadAll = useCallback(async () => {
    const files = takeFilesRef.current;
    if (!files.length) return;
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > ZIP_BUDGET) {
      setSaveStatus(
        `Il take pesa ${(total / (1024 * 1024)).toFixed(0)} MB: troppo per un archivio in memoria. ` +
          'Apri i fotogrammi dalla griglia e salvali singolarmente, oppure ripeti la registrazione a risoluzione più bassa.'
      );
      return;
    }

    setBundleBusy(true);
    setSaveStatus('Archivio in preparazione…');
    try {
      const archive: Record<string, Uint8Array> = {};
      for (const file of files) {
        const response = await fetch(file.url);
        archive[file.name] = new Uint8Array(await response.arrayBuffer());
      }
      const zipped = zipSync(archive, { level: 0 });
      const label = files[0]?.name.replace(/_\d{4}\.(png|webm|mp4)$/, '') ?? 'take';
      const outcome = await saveBlobSafely(
        new Blob([zipped], { type: 'application/zip' }),
        `${label}.zip`
      );
      reportSave(outcome, `${label}.zip`);
    } catch (error) {
      setSaveStatus(
        `Archivio non riuscito: ${error instanceof Error ? error.message : 'errore sconosciuto'}. ` +
          'Salva i singoli fotogrammi dalla griglia.'
      );
    } finally {
      setBundleBusy(false);
    }
  }, [reportSave]);

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

      if (event.code === 'Space') {
        event.preventDefault();
        sceneRef.current?.director.toggle();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        sceneRef.current?.director.step(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 's':
          sceneRef.current?.director.stop();
          break;
        case 'k':
          void handleRecord();
          break;
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
  }, [handleCameraView, handleCapture, handleRecord, patch]);

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

      {director.recording || takeProgress ? (
        <div className="absolute inset-0 z-30 pointer-events-none ring-2 ring-inset ring-red-500/70">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-black/85 border border-red-500/70 backdrop-blur-md">
            <span className="w-2 h-2 bg-red-500 animate-pulse" />
            <span className="text-[10px] font-mono-cad uppercase tracking-[0.2em] text-white">
              {takeProgress ? `Registrazione ${takeProgress.frame}/${takeProgress.total}` : 'REC'}
            </span>
          </div>
        </div>
      ) : null}

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
            <DirectorPanel
              settings={settings}
              patch={patch}
              director={director}
              progress={takeProgress}
              take={take}
              onTransport={handleTransport}
              onSeek={handleSeek}
              onRecord={() => void handleRecord()}
              onCancel={handleCancelTake}
              onOpenTake={() => setTakeOpen(true)}
              onSave={(file) => void handleSave(file)}
              onSaveAll={() => void handleDownloadAll()}
            />
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


          {/* HUD di ripresa: trasporto sempre a portata di mano */}
          {uiVisible && status === 'ready' ? (
            <div
              className={cn(
                'absolute bottom-16 md:bottom-14 left-3 md:left-6 z-20 transition-[right] duration-300 pointer-events-none',
                panelOpen ? 'right-3 sm:right-[22rem]' : 'right-3 sm:right-6'
              )}
            >
              <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 bg-black/75 border border-white/12 backdrop-blur-xl pointer-events-auto">
                <button
                  type="button"
                  title={director.playing ? 'Pausa (spazio)' : 'Riproduci (spazio)'}
                  aria-label={director.playing ? 'Pausa' : 'Riproduci'}
                  onClick={() => handleTransport('toggle')}
                  className="shrink-0 w-8 h-8 flex items-center justify-center border bg-white text-black border-white hover:bg-zinc-200"
                >
                  {director.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  title="Fotogramma precedente (←)"
                  aria-label="Fotogramma precedente"
                  onClick={() => handleTransport('prev')}
                  className="shrink-0 w-8 h-8 flex items-center justify-center border bg-zinc-950/80 text-zinc-300 border-white/20 hover:border-white/60"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Fotogramma successivo (→)"
                  aria-label="Fotogramma successivo"
                  onClick={() => handleTransport('next')}
                  className="shrink-0 w-8 h-8 flex items-center justify-center border bg-zinc-950/80 text-zinc-300 border-white/20 hover:border-white/60"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Torna all'inizio (S)"
                  aria-label="Torna all'inizio"
                  onClick={() => handleTransport('stop')}
                  className="shrink-0 w-8 h-8 flex items-center justify-center border bg-zinc-950/80 text-zinc-300 border-white/20 hover:border-white/60"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>

                <input
                  type="range"
                  min={0}
                  max={Math.max(0.001, director.duration)}
                  step={1 / Math.max(1, director.fps)}
                  value={director.time}
                  onChange={(event) => handleSeek(parseFloat(event.target.value))}
                  aria-label="Posizione nella timeline"
                  className="flex-1 min-w-[8rem] h-1 appearance-none bg-zinc-800 accent-white cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                             [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white
                             [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
                />

                <span className="shrink-0 text-[10px] font-mono-cad text-zinc-300 tabular-nums">
                  {director.time.toFixed(2)}s
                  <span className="text-zinc-500">/{director.duration.toFixed(2)}s</span>
                </span>
                <span className="shrink-0 text-[9px] font-mono-cad uppercase tracking-wider text-zinc-500">
                  {director.clipLabel}
                </span>

                <button
                  type="button"
                  title="Registra il take (K)"
                  onClick={() => void handleRecord()}
                  disabled={takeProgress !== null}
                  className={cn(
                    'shrink-0 flex items-center gap-1.5 px-2 py-1.5 border text-[10px] font-mono-cad uppercase tracking-wide',
                    takeProgress !== null
                      ? 'bg-zinc-900 text-zinc-500 border-white/12 cursor-not-allowed'
                      : 'bg-red-500 text-black border-red-500 font-semibold hover:bg-red-400'
                  )}
                >
                  <Circle className="w-3 h-3" />
                  {takeProgress ? `${takeProgress.frame}/${takeProgress.total}` : 'Rec'}
                </button>
              </div>

              {takeError ? (
                <div className="mt-1 px-2 py-1 text-[10px] font-mono-cad text-black bg-white border border-white">
                  {takeError}
                </div>
              ) : null}
            </div>
          ) : null}

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
              ['Spazio', 'play / pausa del take'],
              ['← →', 'fotogramma avanti/indietro'],
              ['S', 'torna all\'inizio'],
              ['K', 'registra il take'],
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

      {/* Take viewer: il take si guarda dentro l'app */}
      {takeOpen && take ? (
        <TakeViewer
          take={take}
          onClose={() => setTakeOpen(false)}
          onSave={(file) => void handleSave(file)}
          onSaveAll={() => void handleDownloadAll()}
          onOpen={handleOpenFile}
          status={saveStatus}
          bundleBusy={bundleBusy}
          environment={environment}
        />
      ) : null}

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
