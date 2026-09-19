# Licenze dei font

I tre typeface inclusi in `src/jewelry/fonts/` derivano da font distribuiti con
**SIL Open Font License 1.1** e sono stati convertiti nel formato `typeface.json`
(usato da `three.js`) con `tools/generate-typefaces.mjs`.
Le conversioni sono derivate dal font originale: nessun glifo è stato ridisegnato.

| File | Font originale (versione) | Autore / Copyright | Licenza |
|---|---|---|---|
| `bodoniModa.typeface.json` | Bodoni Moda SemiBold 2.005 | The Bodoni Moda Project Authors — Owen Earl (https://github.com/indestructible-type/Bodoni) | OFL 1.1 |
| `cinzel.typeface.json` | Cinzel Bold 2.000 | Natanael Gama, The Cinzel Project Authors | OFL 1.1 |
| `cormorantGaramond.typeface.json` | Cormorant Garamond SemiBold 4.001 | Christian Thalmann (Catharsis Fonts), The Cormorant Project Authors | OFL 1.1 |

Dettagli di provenienza e comandi di rigenerazione: `src/jewelry/fonts/SOURCES.md`.

## SIL Open Font License 1.1 (sintesi dei termini rilevanti)

Il testo completo della licenza è disponibile su
<https://openfontlicense.org/open-font-license-official-text/> e nella licenza di ciascun
progetto. In sintesi:

- i font possono essere usati, studiati, modificati e ridistribuiti liberamente,
  anche in prodotti commerciali;
- i file derivati **non** possono essere venduti da soli;
- ogni derivato deve restare sotto OFL 1.1 e non può usare i Reserved Font Names
  senza autorizzazione;
- il copyright e la licenza devono essere mantenuti (questo file).

Font di sistema usati per l'interfaccia (non ridistribuiti): i font sono caricati da
Google Fonts tramite `<link>` e, se il CDN non è raggiungibile, il browser ricade su
`Times New Roman` / `ui-monospace`. Sotto: Cinzel, Cormorant Garamond e JetBrains Mono,
tutti sotto OFL 1.1.
