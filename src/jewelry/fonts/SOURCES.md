# Provenienza dei typeface

I file `*.typeface.json` di questa cartella sono conversioni (nessun glifo
ridisegnato) di font reali, generate con:

```bash
node tools/generate-typefaces.mjs <font.ttf> "<Nome famiglia>" src/jewelry/fonts
```

I TTF di partenza provengono dai pacchetti npm `@expo-google-fonts/*`, che
impacchettano i font Google Fonts originali (OFL 1.1):

| Typeface generato | Sorgente | Versione font |
|---|---|---|
| `bodoniModa.typeface.json` | `@expo-google-fonts/bodoni-moda` → `600SemiBold/BodoniModa_600SemiBold.ttf` | 2.005 |
| `cinzel.typeface.json` | `@expo-google-fonts/cinzel` → `700Bold/Cinzel_700Bold.ttf` | 2.000 |
| `cormorantGaramond.typeface.json` | `@expo-google-fonts/cormorant-garamond` → `600SemiBold/CormorantGaramond_600SemiBold.ttf` | 4.001 |

Set di glifi incluso in ogni conversione: ASCII stampabile + Latin-1 + alcuni
segni tipografici (`– — ‘ ’ “ ” „ … • · € £ ¥ №`), per un totale di ~170 glifi
per font. I caratteri non presenti vengono scartati con un avviso nella UI
invece di far fallire l'estrazione (`THREE.FontLoader` non gestisce i glifi
mancanti e lancia un'eccezione).

La licenza dei font è in `LICENSES-fonts.md` alla radice del repository.
