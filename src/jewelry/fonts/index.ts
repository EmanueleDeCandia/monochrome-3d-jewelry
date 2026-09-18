import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import bodoniModa from './bodoniModa.typeface.json';
import cinzel from './cinzel.typeface.json';
import cormorantGaramond from './cormorantGaramond.typeface.json';

/**
 * Font registry.
 *
 * The previous implementation shipped a hand-authored typeface that only
 * contained the glyphs for "W i l l i a m": any other name made
 * `THREE.TextGeometry` throw (`data.glyphs[char]` was `undefined` and
 * `FontLoader.createPath()` returns `undefined`), which removed the nameplate
 * from the scene without any visible error.
 *
 * Every typeface below is a real OpenType font converted to the
 * `typeface.json` format with `tools/generate-typefaces.mjs`, so the whole
 * Latin-1 range (accented letters included) is available.
 * Fonts are OFL licensed - see LICENSES-fonts.md.
 */

export type FontId = 'bodoni' | 'cinzel' | 'cormorant';

export interface FontPreset {
  id: FontId;
  label: string;
  family: string;
  hint: string;
  /** Vertical space the glyphs occupy (cap height / ascender in em units). */
  data: unknown;
}

export const FONT_PRESETS: Record<FontId, FontPreset> = {
  bodoni: {
    id: 'bodoni',
    label: 'Bodoni Moda',
    family: 'Bodoni Moda SemiBold',
    hint: 'Alto contrasto, sapore Didot: il classico dell\'incisione orafa',
    data: bodoniModa,
  },
  cinzel: {
    id: 'cinzel',
    label: 'Cinzel',
    family: 'Cinzel Bold',
    hint: 'Capitale romana incisa, perfetta per monogrammi',
    data: cinzel,
  },
  cormorant: {
    id: 'cormorant',
    label: 'Cormorant',
    family: 'Cormorant Garamond SemiBold',
    hint: 'Graziato e sottile, eleganza editoriale',
    data: cormorantGaramond,
  },
};

export const FONT_IDS: FontId[] = ['bodoni', 'cinzel', 'cormorant'];

const cache = new Map<FontId, Font>();
const loader = new FontLoader();

/** Parses (once) and returns the three.js Font instance for the given preset. */
export function getFont(id: FontId): Font {
  const cached = cache.get(id);
  if (cached) return cached;

  const preset = FONT_PRESETS[id] ?? FONT_PRESETS.bodoni;
  const font = loader.parse(preset.data as Parameters<FontLoader['parse']>[0]);
  cache.set(preset.id, font);
  return font;
}

/** Parses and returns a glyph coverage report, used by the UI/telemetry. */
export function getFontCoverage(id: FontId): { glyphs: number; missingAscii: string[] } {
  const glyphs = Object.keys((FONT_PRESETS[id] ?? FONT_PRESETS.bodoni).data as { glyphs: object }).length;
  const font = getFont(id);
  const missingAscii: string[] = [];
  for (let code = 32; code <= 126; code++) {
    const char = String.fromCharCode(code);
    if (!font.data.glyphs[char] && char !== ' ') missingAscii.push(char);
  }
  return { glyphs, missingAscii };
}
