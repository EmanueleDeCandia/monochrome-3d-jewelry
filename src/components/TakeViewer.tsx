import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileArchive,
  Film,
  Image as ImageIcon,
  Info,
  X,
} from 'lucide-react';
import type { TakeFile, TakeResult } from '../jewelry/takeRecorder';
import {
  describeEnvironment,
  openInNewTab,
  saveBlobSafely,
  type DeliveryEnvironment,
  type SaveOutcome,
} from '../utils/delivery';
import { cn } from '../utils/cn';

export { describeEnvironment, openInNewTab, saveBlobSafely };
export type { DeliveryEnvironment, SaveOutcome };

/* ------------------------------------------------------------------ *
 * Consegna dei file
 *
 * La logica vive in `src/utils/delivery.ts` (senza React, testabile in Node):
 * un'app dentro un iframe può avere i download bloccati dal sandbox, quindi
 * ogni salvataggio riporta *come* è andato e il take si guarda in-app.
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * Visualizzatore
 * ------------------------------------------------------------------ */

export interface TakeViewerProps {
  take: TakeResult;
  onClose: () => void;
  onSave: (file: TakeFile) => void;
  onSaveAll: () => void;
  onOpen: (file: TakeFile) => void;
  status: string | null;
  bundleBusy: boolean;
  environment: DeliveryEnvironment;
}

const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`;

const PAGE = 24;

export const TakeViewer: React.FC<TakeViewerProps> = ({
  take,
  onClose,
  onSave,
  onSaveAll,
  onOpen,
  status,
  bundleBusy,
  environment,
}) => {
  const [visible, setVisible] = useState(PAGE);
  const [preview, setPreview] = useState<number | null>(null);

  const video = useMemo(() => take.files.find((file) => file.kind === 'video') ?? null, [take]);
  const beauty = useMemo(() => take.files.filter((file) => file.kind === 'beauty'), [take]);
  const extras = useMemo(() => take.files.filter((file) => file.kind !== 'beauty' && file.kind !== 'video'), [take]);
  const root = useMemo(() => take.files.find((file) => file.kind === 'manifest') ?? null, [take]);
  const total = useMemo(() => take.files.reduce((sum, file) => sum + file.size, 0), [take]);

  useEffect(() => {
    setVisible(PAGE);
    setPreview(null);
  }, [take]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (preview !== null) setPreview(null);
        else onClose();
        return;
      }
      if (preview === null) return;
      if (event.key === 'ArrowRight') setPreview((index) => Math.min(beauty.length - 1, (index ?? 0) + 1));
      if (event.key === 'ArrowLeft') setPreview((index) => Math.max(0, (index ?? 0) - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beauty.length, onClose, preview]);

  const current = preview !== null ? beauty[preview] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3 md:p-6">
      <div className="bg-zinc-950 border border-white/25 w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* intestazione */}
        <div className="flex items-start justify-between gap-4 p-4 border-b border-white/15">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono-cad uppercase tracking-[0.2em] text-white">
              {take.format === 'webm' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
              Take · {take.label}
            </div>
            <div className="text-[10px] font-mono-cad text-zinc-500 mt-1">
              {take.frames} fotogrammi · {take.fps} fps · {take.duration.toFixed(2)} s · {take.width}×{take.height} px ·{' '}
              {formatBytes(total)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSaveAll}
              disabled={bundleBusy}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono-cad uppercase border',
                bundleBusy
                  ? 'bg-zinc-900 text-zinc-500 border-white/12 cursor-wait'
                  : 'bg-white text-black border-white font-semibold hover:bg-zinc-200'
              )}
            >
              <FileArchive className="w-3.5 h-3.5" />
              {bundleBusy ? 'archivio…' : 'Scarica tutto (ZIP)'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi"
              className="p-1.5 border border-white/20 text-zinc-400 hover:text-white hover:border-white/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* avvisi e note */}
        <div className="px-4 py-2 border-b border-white/10 space-y-1 bg-black/40">
          {environment.embedded && !status ? (
            <div className="text-[10px] font-mono-cad text-amber-300 leading-snug">
              Preview dentro un iframe: i download diretti possono essere bloccati dal sandbox (il click non dà
              errori e non salva nulla). In quel caso usa <span className="text-white">«Apri in scheda»</span> e poi
              il tasto destro → <span className="text-white">Salva con nome…</span>: è un comando del browser e
              funziona sempre.
            </div>
          ) : null}
          {status ? (
            <div className="text-[10px] font-mono-cad text-white">{status}</div>
          ) : (
            <div className="text-[10px] font-mono-cad text-zinc-400 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-[1px] shrink-0" />
              <span>
                Il take è riprodotto qui sotto, non serve scaricarlo per vederlo.
                {environment.embedded ? (
                  <>
                    {' '}
                    La preview gira dentro un iframe: se un download non parte (nessun errore, nessun file), usa
                    <span className="text-white"> «Apri in scheda»</span> e poi il tasto destro →
                    <span className="text-white"> Salva </span> del browser.
                  </>
                ) : null}
                {!environment.savePicker ? ' Il dialogo di salvataggio di sistema non è disponibile in questo contesto.' : null}
              </span>
            </div>
          )}
          {take.notes.map((note) => (
            <div key={note} className="text-[10px] font-mono-cad text-zinc-500">
              · {note}
            </div>
          ))}
          {root ? (
            <div className="text-[10px] font-mono-cad text-zinc-500">
              manifest incluso ({root.name}) con clip, fps, otturatore e canali.
            </div>
          ) : null}
        </div>

        {/* corpo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {current ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-mono-cad text-zinc-300 truncate">
                  {current.name} · {formatBytes(current.size)}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpen(current)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono-cad uppercase border border-white/20 text-zinc-300 hover:border-white/60"
                  >
                    <ExternalLink className="w-3 h-3" /> Apri in scheda
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave(current)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold"
                  >
                    <Download className="w-3 h-3" /> Salva
                  </button>
                </div>
              </div>
              <div className="relative border border-white/15 bg-black flex items-center justify-center">
                <img src={current.url} alt={current.name} className="max-h-[52vh] w-auto" />
                <button
                  type="button"
                  aria-label="Fotogramma precedente"
                  onClick={() => setPreview((index) => Math.max(0, (index ?? 0) - 1))}
                  className="absolute left-2 p-1.5 bg-black/70 border border-white/25 text-white hover:border-white/70"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Fotogramma successivo"
                  onClick={() => setPreview((index) => Math.min(beauty.length - 1, (index ?? 0) + 1))}
                  className="absolute right-2 p-1.5 bg-black/70 border border-white/25 text-white hover:border-white/70"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[10px] font-mono-cad text-zinc-500 text-center">
                fotogramma {preview! + 1} di {beauty.length} · t = {(preview! / take.fps).toFixed(3)} s ·
                <button type="button" onClick={() => setPreview(null)} className="ml-1 text-white underline">
                  torna alla griglia
                </button>
              </div>
            </div>
          ) : null}

          {video && !current ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                className="w-full max-h-[52vh] bg-black border border-white/15"
                src={video.url}
                controls
                autoPlay
                muted
                loop
                playsInline
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-mono-cad text-zinc-300 truncate">
                  {video.name} · {formatBytes(video.size)}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpen(video)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono-cad uppercase border border-white/20 text-zinc-300 hover:border-white/60"
                  >
                    <ExternalLink className="w-3 h-3" /> Apri in scheda
                  </button>
                  <button
                    type="button"
                    onClick={() => onSave(video)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono-cad uppercase border bg-white text-black border-white font-semibold"
                  >
                    <Download className="w-3 h-3" /> Salva video
                  </button>
                </div>
              </div>
              {video.size === 0 ? (
                <div className="text-[10px] font-mono-cad text-amber-400">
                  Il file è vuoto: il codec scelto dal browser non ha prodotto dati. Riprova scegliendo la
                  sequenza PNG, che è deterministica.
                </div>
              ) : null}
            </div>
          ) : null}

          {beauty.length && !current && !video ? (
            <div className="space-y-2">
              <div className="text-[10px] font-mono-cad uppercase tracking-widest text-zinc-500">
                Sequenza · {beauty.length} fotogrammi
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-[3px]">
                {beauty.slice(0, visible).map((file, index) => (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => setPreview(index)}
                    title={`${file.name} — apri`}
                    className="relative border border-white/12 hover:border-white/60 bg-black"
                  >
                    <img src={file.url} alt={file.name} loading="lazy" className="w-full aspect-video object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] font-mono-cad text-zinc-400 px-1 truncate">
                      {index + 1}
                    </span>
                  </button>
                ))}
              </div>
              {visible < beauty.length ? (
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE)}
                  className="w-full px-2 py-1.5 text-[10px] font-mono-cad uppercase border border-white/20 text-zinc-300 hover:border-white/60"
                >
                  mostra altri {Math.min(PAGE, beauty.length - visible)} fotogrammi ({beauty.length - visible} rimasti)
                </button>
              ) : null}
            </div>
          ) : null}

          {extras.length && !current ? (
            <div className="space-y-1">
              <div className="text-[10px] font-mono-cad uppercase tracking-widest text-zinc-500">
                Altri file del take
              </div>
              {extras.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between gap-2 px-2 py-1 border border-white/10 bg-black/50"
                >
                  <span className="text-[10px] font-mono-cad text-zinc-300 truncate">{file.name}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-mono-cad text-zinc-500">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => onOpen(file)}
                      className="p-1 border border-white/20 text-zinc-300 hover:border-white/60"
                      title="Apri in scheda"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSave(file)}
                      className="p-1 border border-white/20 text-white hover:border-white/60"
                      title="Salva"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
