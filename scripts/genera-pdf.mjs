#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Compone i PDF dei volumi.
//
// Avvia da sé il server di sviluppo, apre l'impaginato /stampa/<slug>/ con
// Chrome in headless, lo stampa in PDF e lo salva in public/libri/.
// Alla fine spegne tutto e riporta il numero di pagine reale, da copiare
// nella scheda del libro.
//
// Uso:  npm run genera-pdf
//       npm run genera-pdf -- liberta            (un solo volume)
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 4399;

// Chrome già installato: nessun secondo browser da scaricare.
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

if (!CHROME) {
  console.error('Chrome non trovato. Installalo, oppure indica il percorso in CHROME.');
  process.exit(1);
}

const config = (await import('../astro.config.mjs')).default;
const BASE = (config.base ?? '/').replace(/\/$/, '');

// ── il server di sviluppo ───────────────────────────────────────────────────
function avviaServer() {
  const astro = join(RADICE, 'node_modules', 'astro', 'astro.js');
  const processo = spawn(process.execPath, [astro, 'dev', '--port', String(PORTA)], {
    cwd: RADICE,
    stdio: 'ignore',
  });
  return processo;
}

async function attendiServer(indirizzo, tentativi = 60) {
  for (let i = 0; i < tentativi; i++) {
    try {
      const risposta = await fetch(indirizzo);
      if (risposta.ok) return true;
    } catch {
      /* non è ancora pronto */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Numero di pagine del PDF, letto dall'albero delle pagine. */
function contaPagine(buffer) {
  const testo = buffer.toString('latin1');
  const conteggi = [...testo.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (conteggi.length) return Math.max(...conteggi);
  const pagine = testo.match(/\/Type\s*\/Page[^s]/g);
  return pagine ? pagine.length : null;
}

// ── esecuzione ──────────────────────────────────────────────────────────────
const filtro = process.argv[2];
const volumi = readdirSync(join(RADICE, 'src', 'content', 'testi'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .filter((s) => !filtro || s.includes(filtro));

if (volumi.length === 0) {
  console.error(
    'Nessun testo integrale trovato in src/content/testi/.\n' +
      'Lancia prima:  npm run estrai-epub'
  );
  process.exit(1);
}

console.log(`Avvio il server di sviluppo sulla porta ${PORTA}…`);
const server = avviaServer();
const spegni = () => {
  if (!server.killed) server.kill();
};
process.on('exit', spegni);
process.on('SIGINT', () => {
  spegni();
  process.exit(1);
});

const radiceHttp = `http://localhost:${PORTA}${BASE}/`;
if (!(await attendiServer(radiceHttp))) {
  console.error('Il server non è partito entro il tempo previsto.');
  spegni();
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--font-render-hinting=none', '--disable-lcd-text'],
});

const esiti = [];

for (const slug of volumi) {
  const indirizzo = `${radiceHttp}stampa/${slug}/`;
  const pagina = await browser.newPage();
  await pagina.goto(indirizzo, { waitUntil: 'networkidle0', timeout: 60_000 });

  // I caratteri devono essere caricati prima di misurare le righe.
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.emulateMediaType('print');

  const pdf = await pagina.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;text-align:center;font-family:Georgia,serif;
      font-size:8pt;color:#55503f;">
      <span class="pageNumber"></span></div>`,
    timeout: 120_000,
  });

  const destinazione = join(RADICE, 'public', 'libri', `${slug}.pdf`);
  writeFileSync(destinazione, pdf);
  await pagina.close();

  esiti.push({
    slug,
    pagine: contaPagine(Buffer.from(pdf)),
    peso: Math.round(pdf.length / 1024),
  });
}

await browser.close();
spegni();

console.log('');
for (const e of esiti) {
  console.log(`── ${e.slug}`);
  console.log(`   file   : public/libri/${e.slug}.pdf (${e.peso} KB)`);
  console.log(`   pagine : ${e.pagine ?? 'non determinato'}`);
  console.log(`   ► nella scheda: pdf: /libri/${e.slug}.pdf   e   pagine: ${e.pagine ?? '?'}`);
}
console.log('');
process.exit(0);
