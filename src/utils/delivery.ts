/**
 * Consegna dei file al disco.
 *
 * Un'app dentro un iframe (come la preview) può avere i download bloccati dal
 * sandbox: il click parte, non succede nulla e non arriva nessun errore. Qui
 * la strategia è esplicita: prima il dialogo di sistema (File System Access),
 * che dice davvero se il file è stato scritto, poi il classico `<a download>`,
 * e in ogni caso il chiamante sa *quale* strada è stata usata e può dirlo
 * all'utente invece di fallire in silenzio.
 *
 * Modulo senza React né DOM obbligatorio: è verificabile in Node.
 */

export interface DeliveryEnvironment {
  /** la pagina vive dentro un iframe */
  embedded: boolean;
  /** il dialogo di salvataggio di sistema è disponibile */
  savePicker: boolean;
  mediaRecorder: boolean;
  captureStream: boolean;
}

export type SaveOutcome = 'picker' | 'anchor' | 'cancelled' | 'failed';

interface PickerHandle {
  createWritable: () => Promise<{
    write: (blob: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

type PickerWindow = {
  showSaveFilePicker?: (options: unknown) => Promise<PickerHandle>;
  self?: unknown;
  top?: unknown;
  open?: (url: string, target?: string, features?: string) => unknown;
};

export function describeEnvironment(): DeliveryEnvironment {
  if (typeof window === 'undefined') {
    // render server-side (verify:ui): nessuna capacità dichiarabile
    return { embedded: false, savePicker: false, mediaRecorder: false, captureStream: false };
  }
  const host = window as unknown as PickerWindow;
  let embedded = false;
  try {
    embedded = host.self !== host.top;
  } catch {
    embedded = true; // parent cross-origin: siamo dentro un iframe
  }
  return {
    embedded,
    savePicker: typeof host.showSaveFilePicker === 'function',
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    captureStream:
      typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function',
  };
}

const extensionOf = (name: string) => {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'bin';
};

/** Salva un blob e dice per quale strada ci è riuscito. */
export async function saveBlobSafely(blob: Blob, name: string): Promise<SaveOutcome> {
  if (typeof window === 'undefined') return 'failed';

  const host = window as unknown as PickerWindow;
  if (typeof host.showSaveFilePicker === 'function') {
    try {
      const extension = extensionOf(name);
      const handle = await host.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'File del take',
            accept: { [blob.type || 'application/octet-stream']: [`.${extension}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'picker';
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError') return 'cancelled';
      // NotAllowedError / SecurityError: il contesto non lo permette, si prova
      // con l'anchor (che a sua volta può essere bloccato dal sandbox)
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // il browser ha già preso il file: rilascio differito per sicurezza
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'anchor';
  } catch {
    return 'failed';
  }
}

/** Apre un blob in una scheda nuova: da lì «Salva con nome» è un'azione del browser. */
export function openInNewTab(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.open(url, '_blank', 'noopener,noreferrer') !== null;
  } catch {
    return false;
  }
}
