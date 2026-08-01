#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Censimento dei difetti di impaginazione e di editing nei testi in
// src/content/testi/. Non modifica niente: conta e riferisce.
//
// Uso:  npm run analizza
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_TESTI = join(RADICE, 'src', 'content', 'testi');

const CONTROLLI = [
  {
    nome: 'virgolette dritte  " ',
    regex: /"/g,
    nota: 'da sostituire con caporali « » o con virgolette curve',
  },
  {
    nome: 'spazio dopo virgoletta aperta',
    regex: /"\s+\S/g,
    nota: '" testo  →  «testo',
  },
  {
    nome: "apostrofi dritti  '",
    regex: /'/g,
    nota: 'da sostituire con l’apostrofo tipografico ’',
  },
  {
    nome: 'trattino usato da lineetta',
    regex: /\s-\s/g,
    nota: ' - ​ →  —  (lineetta enne o emme)',
  },
  {
    nome: 'doppi spazi',
    regex: / {2,}/g,
    nota: 'residuo di conversione',
  },
  {
    nome: 'spazio prima di punteggiatura',
    regex: /\s+[,.;:!?]/g,
    nota: 'errore di battitura o di conversione',
  },
  {
    nome: 'punti di sospensione sciolti',
    regex: /\.\.\./g,
    nota: '…  è un carattere unico',
  },
  {
    nome: 'riferimenti biblici con trattino spurio',
    regex: /\[\s*-\s*/g,
    nota: '[- Esodo 31:15  →  [Esodo 31,15]',
  },
  {
    nome: 'riferimenti biblici con due punti',
    regex: /\[[^\]]*\d+:\d+[^\]]*\]/g,
    nota: 'uso italiano: Esodo 31,15 con la virgola',
  },
];

function analizza(testo) {
  const senzaFrontmatter = testo.replace(/^---[\s\S]*?---\n/, '');
  const blocchi = senzaFrontmatter
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const titoli = blocchi.filter((b) => b.startsWith('## '));
  const paragrafi = blocchi.filter((b) => !b.startsWith('## ') && !b.startsWith('> '));
  const citazioni = blocchi.filter((b) => b.startsWith('> '));
  const lunghezze = paragrafi.map((p) => p.split(/\s+/).length);

  const conta = (r) => (senzaFrontmatter.match(r) || []).length;

  // allocuzione: seconda persona singolare contro plurale
  const plurale = conta(/\b(voi|vostr[oaie]|vi\s|siete|potete|dovete|avete|vostre)\b/gi);
  const singolare = conta(/\b(tu|tuo|tua|tuoi|tue|ti\s|sei|puoi|devi|hai)\b/gi);

  return {
    titoli: titoli.map((t) => t.slice(3)),
    paragrafi: paragrafi.length,
    citazioni: citazioni.length,
    lunghezze,
    mediana: lunghezze.length
      ? [...lunghezze].sort((a, b) => a - b)[Math.floor(lunghezze.length / 2)]
      : 0,
    massimo: lunghezze.length ? Math.max(...lunghezze) : 0,
    oltre150: lunghezze.filter((n) => n > 150).length,
    plurale,
    singolare,
    controlli: CONTROLLI.map((c) => ({ ...c, quanti: conta(c.regex) })),
  };
}

for (const file of readdirSync(DIR_TESTI).filter((f) => f.endsWith('.md'))) {
  const r = analizza(readFileSync(join(DIR_TESTI, file), 'utf8'));
  console.log(`\n══ ${file.replace('.md', '')} ${'═'.repeat(Math.max(0, 46 - file.length))}`);
  console.log(`   capitoli   : ${r.titoli.length}`);
  console.log(`   capoversi  : ${r.paragrafi}  (citazioni a parte: ${r.citazioni})`);
  console.log(`   lunghezza  : mediana ${r.mediana} parole, massimo ${r.massimo}`);
  console.log(`   oltre 150 parole: ${r.oltre150} capoversi  ← soglia di leggibilità`);
  console.log(`   allocuzione: ${r.plurale} spie di "voi", ${r.singolare} di "tu"`);
  console.log('   titoli dei capitoli:');
  r.titoli.forEach((t) => console.log(`      · ${t}`));
  console.log('   microtipografia:');
  for (const c of r.controlli) {
    if (c.quanti > 0) console.log(`      ${String(c.quanti).padStart(4)} × ${c.nome}  — ${c.nota}`);
  }
}
console.log('');
