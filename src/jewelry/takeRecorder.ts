/**
 * Registrazione dei take ("ciak").
 *
 * Due modalità, esattamente come sul set:
 *
 * - **WebM** — ripresa in tempo reale: si riproduce il take e si cattura lo
 *   stream del canvas. La durata del video è quella reale del clip, ma il
 *   numero di fotogrammi dipende da quanto è veloce la GPU.
 * - **Sequenza PNG** — render fotogramma per fotogramma, deterministico:
 *   stesso `t` → stesso fotogramma, motion blur integrato sull'otturatore,
 *   opzionalmente con **alpha** e **pass di profondità**. È il formato che si
 *   consegna al compositing (una sequenza numerata, non un video).
 *
 * Entrambe accettano un piano (`TakePlan`) e riportano l'avanzamento; la classe
 * non tocca il renderer direttamente ma riceve tutto tramite `RecorderDeps`,
 * così la logica di pacing è verificabile in Node senza browser.
 */

export type TakeFormat = 'webm' | 'png';

export interface TakePlan {
  clipId: string;
  clipLabel: string;
  /** durata effettiva del clip, in secondi */
  duration: number;
  fps: number;
  /** fotogrammi totali (già arrotondati) */
  frames: number;
  format: TakeFormat;
  /** fattore di risoluzione della sequenza PNG */
  scale: number;
  motionBlur: boolean;
  shutterAngle: number;
  samples: number;
  transparent: boolean;
  depth: boolean;
  /** prefisso dei nomi file della sequenza */
  prefix: string;
}

export interface TakeFile {
  name: string;
  url: string;
  size: number;
  kind: 'video' | 'beauty' | 'depth' | 'manifest';
}

export interface TakeResult {
  format: TakeFormat;
  label: string;
  frames: number;
  fps: number;
  duration: number;
  width: number;
  height: number;
  files: TakeFile[];
  notes: string[];
}

export interface TakeProgress {
  frame: number;
  total: number;
  phase: 'render' | 'encode' | 'depth' | 'manifest' | 'done';
}

export interface RestoreHandle {
  (): void;
}

export interface RecorderDeps {
  canvas: HTMLCanvasElement;
  /** prepara il renderer per il take (scala, alpha) e ritorna il ripristino */
  beginTake: (plan: TakePlan) => RestoreHandle;
  /** posiziona la scena all'istante t e disegna il fotogramma */
  renderAt: (time: number, frameIndex: number) => void;
  /** rende il pass di profondità del fotogramma corrente */
  renderDepth?: () => void;
  /** cattura il canvas corrente come PNG */
  capturePng: () => Promise<Blob>;
  /** avvia la riproduzione del take; si risolve a fine take (o su abort) */
  playTake: () => Promise<void>;
  /** cede il controllo al browser (rAF, con rete di sicurezza se la scheda è nascosta) */
  nextTick: () => Promise<void>;
  now: () => number;
  /** mapping MIME disponibile, in ordine di preferenza */
  videoMimeTypes?: string[];
}

const pad = (value: number, size = 4) => String(value).padStart(size, '0');

export function buildSequences(plan: TakePlan): { beauty: string[]; depth: string[] } {
  const beauty: string[] = [];
  const depth: string[] = [];
  for (let frame = 1; frame <= plan.frames; frame++) {
    beauty.push(`${plan.prefix}_${pad(frame)}.png`);
    if (plan.depth) depth.push(`${plan.prefix}_depth_${pad(frame)}.png`);
  }
  return { beauty, depth };
}

/** Manifest che accompagna la sequenza: il compositor sa cosa ha in mano. */
export function buildManifest(plan: TakePlan, extra: Record<string, unknown> = {}) {
  return {
    clip: plan.clipId,
    label: plan.clipLabel,
    frames: plan.frames,
    fps: plan.fps,
    duration: plan.duration,
    pixelAspect: 1,
    colorSpace: 'linear-half-float -> ACES filmic (sRGB display)',
    toneMapping: 'ACESFilmic',
    motionBlur: plan.motionBlur
      ? {
          method: 'shutter-accumulation',
          shutterAngleDegrees: plan.shutterAngle,
          samplesPerFrame: plan.samples,
        }
      : null,
    channels: {
      beauty: plan.transparent ? 'RGBA premultiplied' : 'RGB su fondale',
      depth: plan.depth ? 'RGBA depth-packed (RGBADepthPacking)' : null,
    },
    naming: plan.prefix,
    ...extra,
  };
}

export class TakeRecorder {
  private recording = false;
  private abortController: AbortController | null = null;

  constructor(private readonly deps: RecorderDeps) {}

  get isRecording(): boolean {
    return this.recording;
  }

  cancel() {
    this.abortController?.abort();
  }

  /* ---------------------------------------------------------------- *
   * Sequenza PNG (fotogramma-accurata)
   * ---------------------------------------------------------------- */
  async recordSequence(
    plan: TakePlan,
    onProgress?: (progress: TakeProgress) => void
  ): Promise<TakeResult> {
    if (this.recording) throw new Error('Registrazione già in corso');
    this.recording = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const restore = this.deps.beginTake(plan);
    const notes: string[] = [];
    const files: TakeFile[] = [];
    const names = buildSequences(plan);

    try {
      const started = this.deps.now();
      for (let index = 0; index < plan.frames; index++) {
        if (signal.aborted) throw new DOMException('Take annullato', 'AbortError');
        const time = index / plan.fps;
        this.deps.renderAt(time, index);
        const beauty = await this.deps.capturePng();
        if (signal.aborted) throw new DOMException('Take annullato', 'AbortError');
        files.push({
          name: names.beauty[index],
          url: URL.createObjectURL(beauty),
          size: beauty.size,
          kind: 'beauty',
        });

        if (plan.depth && this.deps.renderDepth) {
          this.deps.renderDepth();
          const depth = await this.deps.capturePng();
          files.push({
            name: names.depth[index],
            url: URL.createObjectURL(depth),
            size: depth.size,
            kind: 'depth',
          });
          if (signal.aborted) throw new DOMException('Take annullato', 'AbortError');
        }

        onProgress?.({
          frame: index + 1,
          total: plan.frames,
          phase: plan.depth ? 'depth' : 'render',
        });
        // cede il controllo così la UI resta viva e disegna l'avanzamento
        if (index % 2 === 1) await this.deps.nextTick();
      }

      onProgress?.({ frame: plan.frames, total: plan.frames, phase: 'manifest' });
      const manifest = buildManifest(plan, {
        renderedOn: new Date().toISOString(),
        renderSeconds: Math.round((this.deps.now() - started) / 100) / 10,
        resolution: { width: this.deps.canvas.width, height: this.deps.canvas.height },
      });
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
        type: 'application/json',
      });
      files.push({
        name: `${plan.prefix}_manifest.json`,
        url: URL.createObjectURL(manifestBlob),
        size: manifestBlob.size,
        kind: 'manifest',
      });

      if (!plan.motionBlur) {
        notes.push('Motion blur disattivato: fotogrammi "sharp", blur da aggiungere in compositing.');
      }
      if (plan.depth) {
        notes.push('Il pass di profondità è codificato con RGBADepthPacking: usa near/far del manifest.');
      }
      notes.push(
        `Sequenza da ${plan.frames} fotogrammi a ${plan.fps} fps (${plan.duration.toFixed(2)} s).`
      );
      onProgress?.({ frame: plan.frames, total: plan.frames, phase: 'done' });

      return {
        format: 'png',
        label: plan.clipLabel,
        frames: plan.frames,
        fps: plan.fps,
        duration: plan.duration,
        width: this.deps.canvas.width,
        height: this.deps.canvas.height,
        files,
        notes,
      };
    } finally {
      restore();
      this.recording = false;
      this.abortController = null;
    }
  }

  /* ---------------------------------------------------------------- *
   * WebM (tempo reale)
   * ---------------------------------------------------------------- */
  static pickVideoMimeType(candidates: string[]): string | null {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported?.(type)) return type;
    }
    return candidates[0] ?? null;
  }

  async recordVideo(
    plan: TakePlan,
    onProgress?: (progress: TakeProgress) => void
  ): Promise<TakeResult> {
    if (this.recording) throw new Error('Registrazione già in corso');
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder non disponibile in questo browser');
    }

    this.recording = true;
    this.abortController = new AbortController();
    const restore = this.deps.beginTake(plan);
    const notes: string[] = [];

    try {
      const stream = this.deps.canvas.captureStream(plan.fps);
      const mimeType =
        TakeRecorder.pickVideoMimeType(
          this.deps.videoMimeTypes ?? [
            // WebM per primo: è il contenitore che i browser registrano in modo
            // affidabile; MP4 su MediaRecorder è supportato a macchia di leopardo
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4;codecs=avc1.42E01E',
            'video/mp4',
          ]
        ) ?? 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start(500);
      this.abortController.signal.addEventListener('abort', () => {
        try {
          recorder.stop();
        } catch {
          /* già fermo */
        }
      });

      const startedAt = this.deps.now();
      const frameTicker = setInterval(() => {
        const elapsed = Math.min(plan.duration, (this.deps.now() - startedAt) / 1000);
        onProgress?.({
          frame: Math.round((elapsed / plan.duration) * plan.frames),
          total: plan.frames,
          phase: 'encode',
        });
      }, 200);

      try {
        await this.deps.playTake();
        // piccolo margine perché lo stream catturi gli ultimi fotogrammi
        await new Promise((resolve) => setTimeout(resolve, 180));
      } finally {
        clearInterval(frameTicker);
        if (recorder.state !== 'inactive') recorder.stop();
        await stopped;
      }

      const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
      if (blob.size === 0) {
        throw new Error(
          'Il registratore non ha prodotto dati: tieni la scheda in primo piano durante la ripresa ' +
            'o usa la sequenza PNG, che è deterministica.'
        );
      }
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      notes.push(
        'Ripresa in tempo reale: la durata è quella del clip, il numero di fotogrammi dipende dalla GPU.'
      );
      notes.push('Per timing garantito e canali alpha/depth usa la sequenza PNG.');
      onProgress?.({ frame: plan.frames, total: plan.frames, phase: 'done' });

      return {
        format: 'webm',
        label: plan.clipLabel,
        frames: plan.frames,
        fps: plan.fps,
        duration: plan.duration,
        width: this.deps.canvas.width,
        height: this.deps.canvas.height,
        files: [
          {
            name: `${plan.prefix}.${extension}`,
            url: URL.createObjectURL(blob),
            size: blob.size,
            kind: 'video',
          },
        ],
        notes,
      };
    } finally {
      restore();
      this.recording = false;
      this.abortController = null;
    }
  }
}
