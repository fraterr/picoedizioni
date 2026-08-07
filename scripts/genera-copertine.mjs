#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Trasforma le copertine disegnate in immagini PNG.
// Servono in due posti: dentro l'ePub, e come anteprima quando qualcuno
// condivide il collegamento su WhatsApp o simili.
//
// Uso:  npm run genera-copertine
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { copertinaSvg } from './lib/copertina.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_SCHEDE = join(RADICE, 'src', 'content', 'libri');
const DIR_COPERTINE = join(RADICE, 'public', 'copertine');
const LARGHEZZA = 1000; // 1000 × 1414: buona per le anteprime e per l'ePub

export const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

/** Legge i campi che servono dal frontmatter della scheda. */
export function leggiScheda(percorso) {
  // I fine riga si normalizzano subito: un checkout Windows può arrivare in
  // CRLF, e le espressioni regolari qui sotto presuppongono LF.
  const testo = readFileSync(percorso, 'utf8').replace(/\r\n/g, '\n');
  const fm = testo.match(/^---\n([\s\S]*?)\n---/)[1];
  const campo = (nome) => {
    const m = fm.match(new RegExp(`^${nome}:\\s*(.*)$`, 'm'));
    if (!m) return '';
    return m[1].trim().replace(/^["']|["']$/g, '');
  };
  return {
    slug: campo('slug'),
    titolo: campo('titolo'),
    sottotitolo: campo('sottotitolo'),
    autore: campo('autore'),
    titoloOriginale: campo('titoloOriginale'),
    annoOriginale: campo('annoOriginale'),
    annoTraduzione: campo('annoTraduzione'),
    edizione: Number(campo('edizione')) || 1,
    colore: campo('colore') || 'zabaione',
    corpo: testo.slice(testo.indexOf('---', 4) + 4).trim(),
  };
}

// Il file serve sia da comando sia da modulo per genera-epub.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!CHROME) {
    console.error('Chrome non trovato.');
    process.exit(1);
  }

  const schede = readdirSync(DIR_SCHEDE)
    .filter((f) => f.endsWith('.md'))
    .map((f) => leggiScheda(join(DIR_SCHEDE, f)));

  // Il carattere è quello del sito, incorporato: nessuna richiesta di rete e
  // resa identica a quella delle pagine.
  const facciateCarattere = ['400-normal', '400-italic']
    .map((variante) => {
      const file = join(
        RADICE,
        'node_modules',
        '@fontsource',
        'eb-garamond',
        'files',
        `eb-garamond-latin-${variante}.woff2`
      );
      const base64 = readFileSync(file).toString('base64');
      return `@font-face{font-family:'EB Garamond';font-style:${
        variante.endsWith('italic') ? 'italic' : 'normal'
      };font-weight:400;src:url(data:font/woff2;base64,${base64}) format('woff2');}`;
    })
    .join('\n');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  mkdirSync(DIR_COPERTINE, { recursive: true });

  for (const scheda of schede) {
    const svg = copertinaSvg({
      titolo: scheda.titolo,
      autore: scheda.autore,
      colore: scheda.colore,
    });

    const pagina = await browser.newPage();
    await pagina.setViewport({ width: LARGHEZZA, height: Math.round(LARGHEZZA * 1.414) });
    await pagina.setContent(
      `<!doctype html><html><head><meta charset="utf-8">
       <style>${facciateCarattere}
       html,body{margin:0;padding:0}svg{display:block;width:100vw;height:auto}</style>
       </head><body>${svg}</body></html>`,
      { waitUntil: 'load' }
    );
    await pagina.evaluate(() => document.fonts.ready);

    const png = await pagina.screenshot({ type: 'png', fullPage: false });
    writeFileSync(join(DIR_COPERTINE, `${scheda.slug}.png`), png);
    await pagina.close();

    console.log(
      `   ${scheda.slug}.png  ${LARGHEZZA}×${Math.round(LARGHEZZA * 1.414)}  ${Math.round(png.length / 1024)} KB  (${scheda.colore})`
    );
  }

  await browser.close();
  console.log('');
}
