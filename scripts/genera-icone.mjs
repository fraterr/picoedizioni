#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Genera le immagini di servizio del sito, con lo stesso Chrome delle
// copertine:
//   · public/social.png            1200×630 — anteprima social di riserva,
//                                  per le pagine che non sono schede di libri
//   · public/apple-touch-icon.png  180×180 — l'icona dei segnalibri iOS,
//                                  che non legge il favicon SVG
//
// I dati (nome, motto) vengono da src/data/sito.json: se cambiano, si
// rilancia. Uso:  npm run genera-icone
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const sito = JSON.parse(readFileSync(join(RADICE, 'src', 'data', 'sito.json'), 'utf8'));

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

if (!CHROME) {
  console.error('Chrome non trovato.');
  process.exit(1);
}

// La marca, identica a src/components/Marca.astro.
const marca = (dimensione, colore) => `
<svg width="${dimensione}" height="${dimensione}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="46.2" stroke="${colore}" stroke-width="1.6"/>
  <circle cx="50" cy="50" r="41.4" stroke="${colore}" stroke-width="0.7" opacity="0.55"/>
  <path fill="${colore}" fill-rule="evenodd"
    d="M40 28 L58 28 C68.5 28 73 32.5 73 40 C73 47.5 68.5 52 58 52 L46 52 L46 69 L55 69 L55 72 L31 72 L31 69 L40 69 Z
       M46 33.5 L57.5 33.5 C62.5 33.5 66 35.8 66 40 C66 44.2 62.5 46.5 57.5 46.5 L46 46.5 Z"/>
  <path d="M50 78.5 L52 81 L50 83.5 L48 81 Z" fill="${colore}" opacity="0.75"/>
</svg>`;

// Il carattere del sito, incorporato: nessuna richiesta di rete.
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

// ── la carta social: carta avorio, marca, nome, motto ───────────────────────
const cartaSociale = `<!doctype html><html><head><meta charset="utf-8"><style>
${facciateCarattere}
html,body{margin:0;padding:0}
.carta{width:1200px;height:630px;background:#fbf8f1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:34px;border-bottom:14px solid #f0d68c;
  font-family:'EB Garamond',Georgia,serif;color:#1c1a16}
.nome{font-size:44px;letter-spacing:0.3em;text-indent:0.3em;text-transform:uppercase}
.motto{font-size:34px;font-style:italic;color:#5c564a}
.sotto{font-size:24px;color:#8c8579}
.filetto{display:flex;align-items:center;gap:16px;color:#ddd5c4;width:340px}
.filetto::before,.filetto::after{content:'';flex:1;height:1px;background:currentColor}
.filetto span{color:#e6c25e;font-size:14px;line-height:1}
</style></head><body>
<div class="carta">
  ${marca(150, '#1c1a16')}
  <div class="nome">${sito.nome}</div>
  <div class="filetto"><span>◆</span></div>
  <div class="motto">${sito.motto}</div>
  <div class="sotto">${sito.sottotitolo}</div>
</div>
</body></html>`;

// ── l'icona per iOS: marca chiara su fondo inchiostro ───────────────────────
const icona = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
.icona{width:180px;height:180px;background:#1c1a16;display:grid;place-items:center}
</style></head><body>
<div class="icona">${marca(132, '#f0d68c')}</div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

const scatti = [
  { html: cartaSociale, larghezza: 1200, altezza: 630, file: 'social.png' },
  { html: icona, larghezza: 180, altezza: 180, file: 'apple-touch-icon.png' },
];

for (const { html, larghezza, altezza, file } of scatti) {
  const pagina = await browser.newPage();
  await pagina.setViewport({ width: larghezza, height: altezza });
  await pagina.setContent(html, { waitUntil: 'load' });
  await pagina.evaluate(() => document.fonts.ready);
  const png = await pagina.screenshot({ type: 'png' });
  writeFileSync(join(RADICE, 'public', file), png);
  await pagina.close();
  console.log(`   ${file}  ${larghezza}×${altezza}  ${Math.round(png.length / 1024)} KB`);
}

await browser.close();
