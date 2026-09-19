import {
  compileClip,
  evaluateClip,
  findClip,
  frameCountOf,
  takeDuration,
  type Clip,
  type RigState,
} from './timeline';

/**
 * Trasporto della ripresa.
 *
 * Piccola macchina a stati (idle / playing / scrubbing) che avanza il tempo e
 * pubblica lo stato del rig. Non renderizza: il renderer vive nella scena, così
 * il conductor resta testabile in Node.
 */
export interface ConductorOptions {
  clip: Clip;
  /** riceve lo stato del rig a ogni avanzamento */
  onRig: (state: RigState) => void;
  /** riceve il tempo corrente (per la UI di trasporto) */
  onTime?: (time: number, playing: boolean) => void;
  onEnd?: () => void;
  fps: number;
  loop?: boolean;
}

export class Conductor {
  private compiled;
  private currentTime = 0;
  private playing = false;
  private scrubbing = false;
  private clip: Clip;
  private fps: number;
  private loop: boolean;

  constructor(private readonly options: ConductorOptions) {
    this.clip = options.clip;
    this.compiled = compileClip(this.clip);
    this.fps = options.fps;
    this.loop = options.loop ?? this.clip.loop;
  }

  /* ---------------------------------------------------------------- *
   * Stato
   * ---------------------------------------------------------------- */
  get time(): number {
    return this.currentTime;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isScrubbing(): boolean {
    return this.scrubbing;
  }

  get currentClip(): Clip {
    return this.clip;
  }

  get fpsValue(): number {
    return this.fps;
  }

  get frames(): number {
    return frameCountOf(this.clip, this.fps);
  }

  get duration(): number {
    return takeDuration(this.clip, this.fps);
  }

  get looping(): boolean {
    return this.loop;
  }

  /** 0…1 */
  get progress(): number {
    return this.duration > 0 ? this.currentTime / this.duration : 0;
  }

  /* ---------------------------------------------------------------- *
   * Comandi
   * ---------------------------------------------------------------- */
  setClip(clipOrId: Clip | string) {
    this.clip = typeof clipOrId === 'string' ? findClip(clipOrId) : clipOrId;
    this.compiled = compileClip(this.clip);
    this.loop = this.clip.loop;
    this.seek(0);
  }

  setFps(fps: number) {
    this.fps = Math.max(1, Math.round(fps));
    this.seek(Math.min(this.currentTime, this.duration));
  }

  setLoop(loop: boolean) {
    this.loop = loop;
  }

  play() {
    if (this.playing) return;
    // riparte dall'inizio se il take è già finito (e non è in loop)
    if (this.currentTime >= this.duration - 1e-6) this.currentTime = 0;
    this.playing = true;
    this.publish();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.publish();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  stop() {
    const wasAlive = this.playing || this.currentTime !== 0;
    this.playing = false;
    this.scrubbing = false;
    this.currentTime = 0;
    this.apply();
    if (wasAlive) this.publish();
  }

  /** Posiziona (e mette in pausa) a un istante preciso: base per il montaggio. */
  seek(time: number) {
    this.playing = false;
    this.currentTime = Math.min(Math.max(0, time), this.duration);
    this.apply();
  }

  /** Scrub continuo da parte dell'utente. */
  scrub(time: number) {
    this.scrubbing = true;
    this.playing = false;
    this.seek(time);
    this.publish();
  }

  endScrub() {
    this.scrubbing = false;
    this.publish();
  }

  nextFrame() {
    const frame = Math.min(this.frames - 1, Math.round(this.currentTime * this.fps) + 1);
    this.playing = false;
    this.seek(frame / this.fps);
    this.publish();
  }

  previousFrame() {
    const frame = Math.max(0, Math.round(this.currentTime * this.fps) - 1);
    this.playing = false;
    this.seek(frame / this.fps);
    this.publish();
  }

  /* ---------------------------------------------------------------- *
   * Avanzamento
   * ---------------------------------------------------------------- */
  /** Avanza di `delta` secondi; ritorna true se lo stato del rig è cambiato. */
  tick(delta: number): boolean {
    if (!this.playing || delta <= 0) return false;

    let next = this.currentTime + delta;
    const duration = this.duration;

    if (next >= duration) {
      if (this.loop) {
        next = next % duration;
      } else {
        next = duration;
        this.playing = false;
        this.applyTo(next);
        this.currentTime = next;
        this.publish();
        this.options.onEnd?.();
        return true;
      }
    }

    const advanced = this.applyTo(next);
    this.currentTime = next;
    if (advanced) this.publish();
    return true;
  }

  /** Ricalcola il rig per il tempo corrente (dopo un resize, per esempio). */
  refresh() {
    this.apply();
  }

  /**
   * Stato del rig a un istante arbitrario, **senza** pubblicare nulla: è la
   * funzione pura che il campionamento dell'otturatore usa per i sub-frame.
   */
  rigAt(time: number): RigState {
    return evaluateClip(this.compiled, time);
  }

  private applyTo(time: number): boolean {
    this.options.onRig(evaluateClip(this.compiled, time));
    return true;
  }

  private apply() {
    this.options.onRig(evaluateClip(this.compiled, this.currentTime));
  }

  private publish() {
    this.options.onTime?.(this.currentTime, this.playing);
  }
}
