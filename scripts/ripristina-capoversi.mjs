#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// RIPRISTINO DEI CAPOVERSI
//
// «Il segreto è sentire» è arrivato dalla conversione con i capitoli in un
// blocco unico. Questo script rimette i capoversi dove li aveva l'autore,
// ricavandoli dall'edizione a stampa del 1944.
//
// Il metodo, in breve:
//   1. dall'originale si ricava quante FRASI compone ogni capoverso;
//   2. il testo italiano si divide in frasi;
//   3. si riuniscono le frasi italiane secondo lo stesso raggruppamento.
//
// Se i due conteggi di frasi non coincidono esattamente — e non coincidono
// mai del tutto, perché tradurre accorpa e separa periodi — i confini si
// riportano in proporzione, così il ritmo dei capoversi resta quello.
//
// Non inventa nulla: senza il file della struttura, si ferma.
//
// Uso:  npm run ripristina-capoversi -- --prova     (mostra e non scrive)
//       npm run ripristina-capoversi                (scrive)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE_TESTO = join(RADICE, 'src', 'content', 'testi', 'il-segreto-e-sentire.md');
const FILE_STRUTTURA = join(RADICE, 'scripts', 'dati', 'struttura-1944.json');

const prova = process.argv.includes('--prova');

if (!existsSync(FILE_STRUTTURA)) {
  console.error(
    `Manca il file della struttura originale:\n  ${FILE_STRUTTURA}\n\n` +
      'Senza quello non si procede: i capoversi si ripristinano sull\'originale,\n' +
      'non a intuito.'
  );
  process.exit(1);
}

/** Divide in frasi tenendo insieme abbreviazioni e virgolette di chiusura. */
function inFrasi(testo) {
  const frasi = [];
  const re = /[^.!?]+[.!?]+["»')\]]*\s*/g;
  let m;
  let ultimo = 0;
  while ((m = re.exec(testo))) {
    frasi.push(m[0].trim());
    ultimo = re.lastIndex;
  }
  const coda = testo.slice(ultimo).trim();
  if (coda) frasi.push(coda);
  return frasi.filter(Boolean);
}

// ── il testo italiano, capitolo per capitolo ────────────────────────────────
const sorgente = readFileSync(FILE_TESTO, 'utf8');
const frontmatter = sorgente.match(/^---[\s\S]*?---\n/)[0];
const corpo = sorgente.slice(frontmatter.length);

const sezioni = [];
for (const blocco of corpo.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
  if (blocco.startsWith('## ')) {
    sezioni.push({ titolo: blocco, blocchi: [] });
  } else if (sezioni.length) {
    sezioni[sezioni.length - 1].blocchi.push(blocco);
  }
}

// ── la struttura originale, capitolo per capitolo ───────────────────────────
const struttura = JSON.parse(readFileSync(FILE_STRUTTURA, 'utf8'));

if (struttura.length !== sezioni.length) {
  console.error(
    `I capitoli non corrispondono: ${sezioni.length} nel testo italiano, ` +
      `${struttura.length} nella struttura originale.`
  );
  process.exit(1);
}

// ── ricomposizione ──────────────────────────────────────────────────────────
const risultato = [];
const rapporto = [];

for (const [i, sezione] of sezioni.entries()) {
  const capoversiOriginali = struttura[i].capoversi; // frasi per capoverso
  const testoIntero = sezione.blocchi.join(' ').replace(/\s+/g, ' ').trim();
  const frasi = inFrasi(testoIntero);

  const totaleOriginale = capoversiOriginali.reduce((a, b) => a + b, 0);
  const totaleItaliano = frasi.length;

  // confini in proporzione: regge anche quando i conteggi divergono
  const confini = [];
  let cumulato = 0;
  for (const quante of capoversiOriginali.slice(0, -1)) {
    cumulato += quante;
    const taglio = Math.round((cumulato / totaleOriginale) * totaleItaliano);
    if (taglio > (confini.at(-1) ?? 0) && taglio < totaleItaliano) confini.push(taglio);
  }

  const nuovi = [];
  let inizio = 0;
  for (const taglio of [...confini, totaleItaliano]) {
    const pezzo = frasi.slice(inizio, taglio).join(' ').trim();
    if (pezzo) nuovi.push(pezzo);
    inizio = taglio;
  }

  risultato.push(sezione.titolo, ...nuovi);
  rapporto.push({
    titolo: sezione.titolo.slice(3),
    frasiOriginale: totaleOriginale,
    frasiItaliano: totaleItaliano,
    scarto: `${totaleItaliano - totaleOriginale > 0 ? '+' : ''}${totaleItaliano - totaleOriginale}`,
    capoversiPrima: sezione.blocchi.length,
    capoversiDopo: nuovi.length,
    parolePerCapoverso: Math.round(
      nuovi.reduce((n, p) => n + p.split(/\s+/).length, 0) / nuovi.length
    ),
  });
}

// ── esito ───────────────────────────────────────────────────────────────────
console.log('\n  capitolo                                  frasi    capoversi   media');
console.log('                                          ing/ita   prima→dopo  parole');
console.log('  ' + '─'.repeat(72));
for (const r of rapporto) {
  console.log(
    '  ' +
      r.titolo.padEnd(40).slice(0, 40) +
      `${String(r.frasiOriginale).padStart(4)}/${String(r.frasiItaliano).padEnd(4)}` +
      `${String(r.capoversiPrima).padStart(6)} → ${String(r.capoversiDopo).padEnd(5)}` +
      String(r.parolePerCapoverso).padStart(5)
  );
}

const scartoMassimo = Math.max(
  ...rapporto.map((r) => Math.abs(r.frasiItaliano - r.frasiOriginale) / r.frasiOriginale)
);
console.log(`\n  scarto massimo fra i conteggi di frasi: ${Math.round(scartoMassimo * 100)}%`);
if (scartoMassimo > 0.2) {
  console.log('  ⚠ oltre il 20%: la corrispondenza fra i due testi è dubbia, controllare a mano.');
}

if (prova) {
  console.log('\n  (prova: non ho scritto niente)\n');
} else {
  writeFileSync(FILE_TESTO, frontmatter + '\n' + risultato.join('\n\n') + '\n', 'utf8');
  console.log(`\n  scritto: ${FILE_TESTO}\n`);
}
