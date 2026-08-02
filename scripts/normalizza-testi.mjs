#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZZAZIONE TIPOGRAFICA
//
// Applica ai testi in src/content/testi/ le convenzioni dell'editoria
// italiana, e da lì rigenera le anteprime.
//
// Che cosa tocca — solo forma, mai sostanza:
//   · virgolette dritte  "…"      →  caporali  «…»
//   · apostrofo dritto   l'uomo   →  tipografico  l’uomo
//   · trattini fra spazi  -  – —  →  lineetta media  –
//   · punti di sospensione  ...   →  …
//   · spazi doppi e spazi prima della punteggiatura
//   · riferimenti biblici  [Esodo 31:15, Levitico 23:3]
//                                →  [Esodo 31,15; Levitico 23,3]
//   · titoli dei capitoli: numerale minuscolo, lineetta media,
//     titolo dal maiuscolo integrale al maiuscolo iniziale
//
// Non tocca una sola parola del testo tradotto.
//
// Uso:  npm run normalizza -- --prova     (mostra e non scrive)
//       npm run normalizza                (scrive)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_TESTI = join(RADICE, 'src', 'content', 'testi');
const DIR_ANTEPRIME = join(RADICE, 'src', 'content', 'anteprime');
// Anche schede e pagine vanno normalizzate, altrimenti la quarta di copertina
// e il testo del libro finiscono sulla stessa schermata con lineette diverse.
// Su questi file si applicano SOLO le regole innocue per il frontmatter YAML:
// convertire le virgolette dritte in caporali spezzerebbe titolo: "…".
const DIR_APPARATO = [
  join(RADICE, 'src', 'content', 'libri'),
  join(RADICE, 'src', 'content', 'pagine'),
];
// L'anteprima si chiude al primo titolo di capitolo dopo la soglia, così i
// libri divisi in capitoli ne offrono uno intero. Ma un libro senza capitoli
// non incontrerebbe mai quel titolo: da qui il tetto massimo.
const PAROLE_ANTEPRIMA = 1200;
const PAROLE_ANTEPRIMA_MAX = 2600;

const prova = process.argv.includes('--prova');

// Nomi propri da conservare maiuscoli quando si scioglie un titolo tutto
// in capitali. Elenco volutamente corto: si allunga quando serve.
const NOMI_PROPRI = [
  'Dio',
  'Sabbath',
  'Bibbia',
  'Cristo',
  'Gesù',
  'Israele',
  'Signore',
  'Spirito',
];

/** Da MAIUSCOLO INTEGRALE a Maiuscolo iniziale, salvando i nomi propri. */
function scioglMaiuscole(titolo) {
  const lettere = titolo.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const quanteAlte = (titolo.match(/[A-ZÀ-Ý]/g) || []).length;
  if (!lettere.length || quanteAlte / lettere.length < 0.7) return titolo;

  let risultato = titolo.toLowerCase();
  risultato = risultato.charAt(0).toUpperCase() + risultato.slice(1);
  for (const nome of NOMI_PROPRI) {
    risultato = risultato.replace(
      new RegExp(`\\b${nome.toLowerCase()}\\b`, 'g'),
      nome
    );
  }
  return risultato;
}

/** Le virgolette dritte diventano caporali, alternando apertura e chiusura. */
function caporali(testo) {
  let aperta = false;
  return testo.replace(/"/g, () => {
    aperta = !aperta;
    return aperta ? '«' : '»';
  });
}

function normalizzaTitolo(riga) {
  let t = riga.replace(/^##\s+/, '').trim();

  // separatore uniforme
  t = t.replace(/\s*[-–—]\s*/, ' – ');

  // "Capitolo Uno" → "Capitolo uno"
  t = t.replace(/^(Capitolo)\s+(\S+)/i, (_, cap, num) => {
    return `${cap.charAt(0).toUpperCase()}${cap.slice(1).toLowerCase()} ${num.toLowerCase()}`;
  });

  // "PREFAZIONE" → "Prefazione"
  const pezzi = t.split(' – ');
  if (pezzi.length === 2) t = `${pezzi[0]} – ${scioglMaiuscole(pezzi[1])}`;
  else t = scioglMaiuscole(t);

  // anche i titoli vogliono l’apostrofo tipografico
  t = t.replace(/(?<=[A-Za-zÀ-ÿ])'/g, '’');

  return `## ${t}`;
}

function normalizzaCorpo(testo) {
  let t = testo;

  // 1. residuo di conversione: la firma dell'autore inglobata nel testo,
  //    seguita dalla ripetizione del titolo.
  t = t.replace(/\s+-\s+(NEVILLE)\s+Il segreto è sentire\s*$/m, '\n\n$1');

  // 2. riferimenti biblici
  t = t.replace(/\[\s*-\s*/g, '[');
  t = t.replace(/\[([^\]]+)\]/g, (intero, dentro) => {
    if (!/\d+:\d+/.test(dentro)) return intero;
    const pulito = dentro
      .replace(/(\d+):(\d+)/g, '$1,$2')
      .replace(/,\s*(?=[A-ZÀ-Ý1-9][a-zà-ÿ]*\.?\s*\d+,)/g, '; ');
    return `[${pulito}]`;
  });

  // 3. punti di sospensione
  t = t.replace(/\.\.\./g, '…');

  // 4. virgolette: prima si tolgono gli spazi interni, poi si convertono
  t = t.replace(/"\s+/g, '"').replace(/\s+"/g, '"');
  t = caporali(t);
  // ricompone lo spazio dopo la chiusura, se manca
  t = t.replace(/»(?=[A-Za-zÀ-ÿ])/g, '» ');
  t = t.replace(/(?<=[A-Za-zÀ-ÿ,;])«/g, ' «');

  // 5. apostrofo tipografico dopo lettera: elisione (l’uomo, dell’«IO SONO»)
  //    e troncamento (un po’). Il glifo è lo stesso in entrambi i casi.
  t = t.replace(/(?<=[A-Za-zÀ-ÿ])'/g, '’');

  // 6. lineette. Solo spazi e tabulazioni ai lati: con \s si mangerebbero gli
  //    a capo, e a ogni esecuzione le righe si salderebbero fra loro.
  t = t.replace(/[ \t]+[-–—]{1,2}[ \t]+/g, ' – ');

  // 7. spaziature
  t = t.replace(/[ \t]+([,.;:!?])/g, '$1');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/[ \t]+$/gm, '');

  return t;
}

// ── esecuzione ──────────────────────────────────────────────────────────────
const conta = (t, r) => (t.match(r) || []).length;

for (const file of readdirSync(DIR_TESTI).filter((f) => f.endsWith('.md'))) {
  const percorso = join(DIR_TESTI, file);
  const sorgente = readFileSync(percorso, 'utf8');
  const frontmatter = sorgente.match(/^---[\s\S]*?---\n/)[0];
  const corpo = sorgente.slice(frontmatter.length);

  const prima = {
    virgolette: conta(corpo, /"/g),
    apostrofi: conta(corpo, /'/g),
    trattini: conta(corpo, /\s-\s/g),
    ellissi: conta(corpo, /\.\.\./g),
    duePunti: conta(corpo, /\[[^\]]*\d+:\d+[^\]]*\]/g),
  };

  const blocchi = corpo.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const nuovi = blocchi.map((b) =>
    b.startsWith('## ') ? normalizzaTitolo(b) : normalizzaCorpo(b)
  );
  // la firma può aver generato un doppio blocco: si ridivide
  const finali = nuovi.join('\n\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const nuovoCorpo = '\n' + finali.join('\n\n') + '\n';

  const dopo = {
    virgolette: conta(nuovoCorpo, /"/g),
    apostrofi: conta(nuovoCorpo, /'/g),
    trattini: conta(nuovoCorpo, /\s-\s/g),
    ellissi: conta(nuovoCorpo, /\.\.\./g),
    duePunti: conta(nuovoCorpo, /\[[^\]]*\d+:\d+[^\]]*\]/g),
  };

  console.log(`\n══ ${file.replace('.md', '')}`);
  for (const chiave of Object.keys(prima)) {
    if (prima[chiave] || dopo[chiave]) {
      console.log(`   ${chiave.padEnd(12)} ${String(prima[chiave]).padStart(4)} → ${dopo[chiave]}`);
    }
  }
  console.log('   titoli normalizzati:');
  finali
    .filter((b) => b.startsWith('## '))
    .forEach((t) => console.log(`      · ${t.slice(3)}`));

  if (!prova) {
    writeFileSync(percorso, frontmatter + nuovoCorpo, 'utf8');

    // l'anteprima si ricava dal testo normalizzato, non più dall'ePub
    const scelti = [];
    let parole = 0;
    for (const blocco of finali) {
      if (parole >= PAROLE_ANTEPRIMA && blocco.startsWith('## ')) break;
      if (parole >= PAROLE_ANTEPRIMA_MAX) break;
      scelti.push(blocco);
      parole += blocco.split(/\s+/).length;
    }
    mkdirSync(DIR_ANTEPRIME, { recursive: true });
    const slug = file.replace('.md', '');
    writeFileSync(
      join(DIR_ANTEPRIME, file),
      `---\nlibro: ${slug}\nparole: ${parole}\n---\n\n${scelti.join('\n\n')}\n`,
      'utf8'
    );
    console.log(`   anteprima rigenerata: ${parole} parole`);
  }
}

// ── apparato: schede e pagine ───────────────────────────────────────────────
// Qui si tocca il minimo indispensabile, perché questi file contengono
// frontmatter YAML ed elenchi Markdown, e due regole apparentemente innocue
// li distruggono:
//   · convertire le virgolette dritte in caporali romperebbe  titolo: "…"
//   · convertire un trattino a inizio riga trasformerebbe il marcatore di
//     elenco  «  - voce»  in  «  – voce», che non è più un elenco
//   · comprimere gli spazi doppi cancellerebbe le indentazioni
// Resta perciò la sola lineetta incisiva, riconoscibile perché preceduta da
// una parola e non dall'inizio della riga.
function normalizzaApparato(testo) {
  return (
    testo
      .replace(/\.\.\./g, '…')
      .replace(/(?<=\S)[ \t]+[-–—]{1,2}[ \t]+/g, ' – ')
      // Stesso caso, ma con la lineetta in fondo alla riga. Il \r? non è
      // pignoleria: su Windows i file hanno terminatori CRLF, e senza di
      // quello la regola non aggancia mai la fine riga.
      .replace(/(?<=\S)[ \t]+[-–—]{1,2}(?=\r?\n)/g, ' –')
      // Lineetta a inizio riga: è un inciso andato a capo, non un elenco.
      // Un elenco Markdown usa il trattino semplice, mai la lineetta lunga:
      // per questo qui si escludono i "-" e si toccano solo "–" e "—".
      .replace(/^[–—](?=[ \t])/gm, '–')
  );
}

let toccati = 0;
for (const cartella of DIR_APPARATO) {
  if (!existsSync(cartella)) continue;
  for (const file of readdirSync(cartella).filter((f) => f.endsWith('.md'))) {
    const percorso = join(cartella, file);
    const sorgente = readFileSync(percorso, 'utf8');
    const nuovo = normalizzaApparato(sorgente);
    if (nuovo !== sorgente) {
      toccati++;
      const lunghe = (sorgente.match(/—/g) || []).length;
      console.log(`\n══ ${file} (apparato)`);
      console.log(`   lineette lunghe → medie: ${lunghe}`);
      if (!prova) writeFileSync(percorso, nuovo, 'utf8');
    }
  }
}
if (toccati === 0) console.log('\n(apparato: già a posto)');

console.log(prova ? '\n(prova: non ho scritto niente)\n' : '');
