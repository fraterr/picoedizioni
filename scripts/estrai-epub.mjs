#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Estrae da ogni ePub in public/libri/ :
//   • la copertina          -> public/copertine/<slug>.jpg
//   • un'anteprima          -> src/content/anteprime/<slug>.md
//   • conteggi e struttura  -> stampati a schermo (da riportare nella scheda)
//
// Uso:  npm run estrai-epub
//       npm run estrai-epub -- nome-del-libro     (solo uno)
//
// Non sovrascrive mai una scheda libro già esistente: se manca, ne crea una
// bozza in src/content/libri/<slug>.md da completare a mano o dal CMS.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apriZip } from './lib/zip.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_EPUB = join(RADICE, 'public', 'libri');
const DIR_COPERTINE = join(RADICE, 'public', 'copertine');
const DIR_SCHEDE = join(RADICE, 'src', 'content', 'libri');
const DIR_ANTEPRIME = join(RADICE, 'src', 'content', 'anteprime');
const DIR_TESTI = join(RADICE, 'src', 'content', 'testi');

// Soglie per riconoscere l'anteprima: si saltano frontespizio, colophon e
// indice (blocchi molto corti), poi si prende testo fino a ~1200 parole.
const PAROLE_MIN_BLOCCO = 60;
const PAROLE_ANTEPRIMA = 1200;
const PAROLE_PER_PAGINA = 250; // stima per un formato 12,5 × 20 cm

// ── utilità ─────────────────────────────────────────────────────────────────
const assicuraCartella = (d) => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); };

const attributo = (tag, nome) => {
  const m = tag.match(new RegExp(`${nome}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
};

const decodificaEntita = (s) =>
  s.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const soloTesto = (html) =>
  decodificaEntita(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const conta = (t) => (t ? t.split(/\s+/).filter(Boolean).length : 0);

/** Converte un blocco XHTML dell'ePub in Markdown pulito. */
function inMarkdown(html) {
  const corpo = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  const righe = [];

  const blocchi = corpo.match(/<(h[1-6]|p|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
  for (const blocco of blocchi) {
    const tag = blocco.match(/^<(\w+)/)[1].toLowerCase();
    let testo = blocco
      .replace(/^<\w+[^>]*>/, '')
      .replace(/<\/\w+>$/, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(i|em)\b[^>]*>/gi, '*')
      .replace(/<\/?(b|strong)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '');
    testo = decodificaEntita(testo).replace(/\s+/g, ' ').trim();
    testo = testo.replace(/\*\s*\*/g, ''); // corsivi rimasti vuoti
    if (!testo) continue;

    if (tag.startsWith('h')) righe.push(`## ${testo}`);
    else if (tag === 'blockquote') righe.push(`> ${testo}`);
    else righe.push(testo);
  }
  return righe.join('\n\n');
}

const virgolette = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// ── lettura di un ePub ──────────────────────────────────────────────────────
function leggiEpub(percorso) {
  const voci = apriZip(readFileSync(percorso));
  const leggi = (n) => {
    const f = voci.get(n);
    if (!f) throw new Error(`Voce mancante nell'ePub: ${n}`);
    return f();
  };

  const container = leggi('META-INF/container.xml').toString('utf8');
  const percorsoOpf = attributo(container.match(/<rootfile\s[^>]*>/i)[0], 'full-path');
  const baseOpf = posix.dirname(percorsoOpf) === '.' ? '' : posix.dirname(percorsoOpf) + '/';
  const opf = leggi(percorsoOpf).toString('utf8');

  const dc = (campo) => {
    const m = opf.match(new RegExp(`<dc:${campo}[^>]*>([\\s\\S]*?)</dc:${campo}>`, 'i'));
    return m ? decodificaEntita(m[1]).trim() : null;
  };

  // manifest: id -> href
  const manifest = new Map();
  for (const voce of opf.match(/<item\b[^>]*>/gi) || []) {
    const id = attributo(voce, 'id');
    if (id) manifest.set(id, { href: attributo(voce, 'href'), tipo: attributo(voce, 'media-type') });
  }

  // spine: ordine di lettura
  const ordine = (opf.match(/<itemref\b[^>]*>/gi) || [])
    .map((v) => attributo(v, 'idref'))
    .map((id) => manifest.get(id))
    .filter((v) => v && /xhtml|html/.test(v.tipo || ''));

  // copertina
  const metaCover = opf.match(/<meta[^>]*name=["']cover["'][^>]*>/i);
  const idCover = metaCover ? attributo(metaCover[0], 'content') : null;
  const cover = idCover && manifest.get(idCover) ? manifest.get(idCover) : null;

  // indice
  const ncxVoce = [...manifest.values()].find((v) => (v.href || '').endsWith('.ncx'));
  let indice = [];
  if (ncxVoce) {
    const ncx = leggi(baseOpf + ncxVoce.href).toString('utf8');
    indice = [...ncx.matchAll(/<text>([\s\S]*?)<\/text>/g)]
      .map((m) => decodificaEntita(m[1]).replace(/\s+/g, ' ').trim())
      .slice(1); // la prima voce è il titolo del libro
  }

  // testo, blocco per blocco
  const sezioni = ordine.map((v) => {
    const html = leggi(baseOpf + v.href).toString('utf8');
    return { href: v.href, html, parole: conta(soloTesto(html)) };
  });

  return {
    titolo: dc('title'),
    autore: dc('creator'),
    editore: dc('publisher'),
    indice,
    sezioni,
    copertina: cover ? { dati: leggi(baseOpf + cover.href), tipo: cover.tipo } : null,
    immagini: [...manifest.values()]
      .filter((v) => /^image\//.test(v.tipo || '') && v !== cover)
      .map((v) => ({ href: v.href, dati: leggi(baseOpf + v.href), tipo: v.tipo })),
  };
}

// ── elaborazione ────────────────────────────────────────────────────────────
function elabora(fileEpub) {
  const slug = basename(fileEpub, '.epub');
  const libro = leggiEpub(join(DIR_EPUB, fileEpub));
  const paroleTotali = libro.sezioni.reduce((n, s) => n + s.parole, 0);
  const pagine = Math.round(paroleTotali / PAROLE_PER_PAGINA / 2) * 2; // arrotonda a pari

  // copertina
  if (libro.copertina) {
    assicuraCartella(DIR_COPERTINE);
    const est = (libro.copertina.tipo || '').includes('png') ? 'png' : 'jpg';
    writeFileSync(join(DIR_COPERTINE, `${slug}.${est}`), libro.copertina.dati);
  }

  // Frontespizio, colophon e indice dell'ePub sono blocchi cortissimi: si
  // saltano, perché l'impaginato per la stampa ricostruisce i suoi.
  let inizio = 0;
  while (inizio < libro.sezioni.length && libro.sezioni[inizio].parole < PAROLE_MIN_BLOCCO) {
    inizio++;
  }
  const corpoLibro = libro.sezioni.slice(inizio);

  // anteprima: dal primo blocco utile fino alla soglia
  const scelte = [];
  let accumulate = 0;
  for (const sezione of corpoLibro) {
    if (accumulate >= PAROLE_ANTEPRIMA) break;
    scelte.push(sezione);
    accumulate += sezione.parole;
  }

  assicuraCartella(DIR_ANTEPRIME);
  writeFileSync(
    join(DIR_ANTEPRIME, `${slug}.md`),
    `---\nlibro: ${slug}\nparole: ${accumulate}\n---\n\n${scelte
      .map((s) => inMarkdown(s.html))
      .join('\n\n')}\n`,
    'utf8'
  );

  // testo integrale: serve solo a comporre il PDF, non ha una pagina propria
  assicuraCartella(DIR_TESTI);
  writeFileSync(
    join(DIR_TESTI, `${slug}.md`),
    `---\nlibro: ${slug}\nparole: ${corpoLibro.reduce((n, s) => n + s.parole, 0)}\n---\n\n${corpoLibro
      .map((s) => inMarkdown(s.html))
      .join('\n\n')}\n`,
    'utf8'
  );

  // scheda: solo se non esiste già (non si sovrascrive il lavoro editoriale)
  assicuraCartella(DIR_SCHEDE);
  const fileScheda = join(DIR_SCHEDE, `${slug}.md`);
  let schedaCreata = false;
  if (!existsSync(fileScheda)) {
    const oggi = new Date().toISOString().slice(0, 10);
    writeFileSync(
      fileScheda,
      [
        '---',
        `slug: ${slug}`,
        `titolo: ${virgolette(libro.titolo || slug)}`,
        'sottotitolo: ""',
        `autore: ${virgolette(libro.autore || '')}`,
        'titoloOriginale: ""',
        'annoOriginale: 0',
        `annoTraduzione: ${new Date().getFullYear()}`,
        `pagine: ${pagine}`,
        `parole: ${paroleTotali}`,
        `copertina: /copertine/${slug}.jpg`,
        `epub: /libri/${slug}.epub`,
        'pdf: ""',
        `pubblicato: ${oggi}`,
        'inEvidenza: false',
        'quarta: >-',
        '  Da scrivere.',
        '---',
        '',
        'Nota del traduttore da scrivere.',
        '',
      ].join('\n'),
      'utf8'
    );
    schedaCreata = true;
  }

  return { slug, libro, paroleTotali, pagine, accumulate, scelte, corpoLibro, schedaCreata };
}

// ── esecuzione ──────────────────────────────────────────────────────────────
assicuraCartella(DIR_EPUB);
const filtro = process.argv[2];
const epub = readdirSync(DIR_EPUB)
  .filter((f) => f.endsWith('.epub'))
  .filter((f) => !filtro || f.includes(filtro));

if (epub.length === 0) {
  console.error(`Nessun ePub trovato in ${DIR_EPUB}${filtro ? ` con filtro "${filtro}"` : ''}.`);
  process.exit(1);
}

for (const f of epub) {
  const r = elabora(f);
  console.log(`\n── ${r.slug} ──────────────────────────────────`);
  console.log(`   titolo ePub   : ${r.libro.titolo}`);
  console.log(`   autore ePub   : ${r.libro.autore}`);
  console.log(`   parole        : ${r.paroleTotali.toLocaleString('it-IT')}`);
  console.log(`   pagine stimate: ~${r.pagine} (a ${PAROLE_PER_PAGINA} parole/pagina)`);
  console.log(`   copertina     : ${r.libro.copertina ? 'estratta' : 'ASSENTE'}`);
  console.log(`   anteprima     : ${r.accumulate} parole, ${r.scelte.length} blocchi`);
  console.log(`   testo integrale: ${r.corpoLibro.length} blocchi`);
  console.log(`   indice        : ${r.libro.indice.length} voci`);
  r.libro.indice.forEach((v) => console.log(`                   · ${v}`));
  if (r.schedaCreata) console.log(`   ► creata la bozza src/content/libri/${r.slug}.md — da completare`);
}
console.log('');
