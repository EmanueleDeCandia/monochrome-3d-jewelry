/**
 * Generates three.js typeface.json files (facetype.js compatible) from real
 * OpenType/TrueType fonts.
 *
 * Usage:
 *   node generate-typefaces.mjs <font.ttf> <OutName> [outDir]
 *
 * The glyph outline format matches what THREE.FontLoader / FontLoader.parse()
 * expects: y axis flipped (baseline at 0, ascender positive), font units as
 * integers, `ha` = advance width.
 */
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const ASCII =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
const LATIN1 =
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ';
const PUNCT = '–—‘’“”„…•·€£¥№';

function nameOf(font, key) {
  const v = font.names?.[key];
  if (!v) return '';
  return typeof v === 'string' ? v : v.en ?? Object.values(v)[0] ?? '';
}

export const DEFAULT_CHARSET = ASCII + LATIN1 + PUNCT;

export function convertFont(fontPath, familyName, charset = DEFAULT_CHARSET) {
  const font = opentype.parse(fs.readFileSync(fontPath).buffer);
  const resolution = font.unitsPerEm;
  const glyphs = {};

  for (const ch of charset) {
    const glyph = font.charToGlyph(ch);
    if (!glyph || glyph.index === 0) continue;

    const p = glyph.getPath(0, 0, resolution);
    let o = '';
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    const track = (x, y) => {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (-y < yMin) yMin = -y;
      if (-y > yMax) yMax = -y;
    };

    for (const cmd of p.commands) {
      switch (cmd.type) {
        case 'M':
          track(cmd.x, cmd.y);
          o += `m ${Math.round(cmd.x)} ${Math.round(-cmd.y)} `;
          break;
        case 'L':
          track(cmd.x, cmd.y);
          o += `l ${Math.round(cmd.x)} ${Math.round(-cmd.y)} `;
          break;
        case 'Q':
          track(cmd.x, cmd.y);
          track(cmd.x1, cmd.y1);
          o += `q ${Math.round(cmd.x)} ${Math.round(-cmd.y)} ${Math.round(
            cmd.x1
          )} ${Math.round(-cmd.y1)} `;
          break;
        case 'C':
          track(cmd.x, cmd.y);
          track(cmd.x1, cmd.y1);
          track(cmd.x2, cmd.y2);
          o += `b ${Math.round(cmd.x)} ${Math.round(-cmd.y)} ${Math.round(
            cmd.x1
          )} ${Math.round(-cmd.y1)} ${Math.round(cmd.x2)} ${Math.round(
            -cmd.y2
          )} `;
          break;
        case 'Z':
          o += 'z ';
          break;
        default:
          break;
      }
    }

    if (!o.trim()) continue;

    glyphs[ch] = {
      ha: glyph.advanceWidth || 0,
      x_min: Number.isFinite(xMin) ? Math.round(xMin) : 0,
      x_max: Number.isFinite(xMax) ? Math.round(xMax) : 0,
      o: o.trim(),
    };
  }

  const head = font.tables.head || {};
  const os2 = font.tables.os2 || {};

  const ascender = font.ascender || os2.sTypoAscender || resolution * 0.75;
  const descender = font.descender || os2.sTypoDescender || -resolution * 0.25;
  const upm = resolution;

  return {
    glyphs,
    familyName,
    ascender: Math.round(ascender),
    descender: Math.round(descender),
    underlinePosition: Math.round(os2.underlinePosition ?? -upm * 0.1),
    underlineThickness: Math.round(os2.underlineThickness ?? upm * 0.05),
    boundingBox: {
      // y-flipped (three.js convention: y up, baseline at 0)
      yMin: Math.round(-(head.yMax ?? ascender)),
      xMin: Math.round(head.xMin ?? 0),
      yMax: Math.round(-(head.yMin ?? descender)),
      xMax: Math.round(head.xMax ?? upm),
    },
    resolution: upm,
    original_font_information: {
      fontFamily: nameOf(font, 'fontFamily') || familyName,
      fontSubfamily: nameOf(font, 'fontSubfamily') || 'Regular',
      version: nameOf(font, 'version') || '',
      designer: nameOf(font, 'designer') || '',
      license: nameOf(font, 'license').replace(/\s+/g, ' ').slice(0, 400),
      unitsPerEm: upm,
      numGlyphs: font.numGlyphs,
    },
  };
}

if (process.argv[1] && process.argv[1].endsWith('generate-typefaces.mjs')) {
  const [fontPath, familyName, outDir = '.'] = process.argv.slice(2);
  if (!fontPath || !familyName) {
    console.error('usage: node generate-typefaces.mjs <font.ttf> <FamilyName> [outDir]');
    process.exit(1);
  }
  const data = convertFont(fontPath, familyName);
  const outFile = path.join(outDir, `${path.basename(fontPath, '.ttf')}.typeface.json`);
  fs.writeFileSync(outFile, JSON.stringify(data));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(
    `${outFile}  (${Object.keys(data.glyphs).length} glyphs, ${kb} KB, upm ${data.resolution})`
  );
}
