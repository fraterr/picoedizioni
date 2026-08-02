#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Compone gli ePub a partire dal testo normalizzato.
//
// Gli ePub di partenza venivano da una conversione Word→Calibre e portavano
// con sé i suoi difetti: metadati sbagliati, marcatura sporca, nessun indice
// navigabile. Questi si costruiscono da zero, in ePub 3, con:
//   · metadati corretti (autore l'autore, traduttore l'editore)
//   · copertina, frontespizio, colophon, indice navigabile
//   · un foglio di stile sobrio, che rispetta le scelte del lettore
//
// Uso:  npm run genera-epub
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { creaZip } from './lib/zip-scrivi.mjs';
import { leggiScheda } from './genera-copertine.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_SCHEDE = join(RADICE, 'src', 'content', 'libri');
const DIR_TESTI = join(RADICE, 'src', 'content', 'testi');
const DIR_COPERTINE = join(RADICE, 'public', 'copertine');
const DIR_USCITA = join(RADICE, 'public', 'libri');

const sito = JSON.parse(readFileSync(join(RADICE, 'src', 'data', 'sito.json'), 'utf8'));

const scappa = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Da Markdown a XHTML. Il vocabolario è volutamente ristretto. */
function inXhtml(blocchi) {
  return blocchi
    .map((blocco) => {
      if (blocco.startsWith('> ')) {
        // I versi vanno a capo dove l'autore li ha mandati a capo: ogni riga
        // della citazione resta una riga, non si fondono in un paragrafo.
        const righe = blocco
          .split('\n')
          .map((r) => corsivi(scappa(r.replace(/^>\s?/, '').replace(/\\$/, '').trim())))
          .filter(Boolean);
        return `<blockquote><p>${righe.join('<br/>\n      ')}</p></blockquote>`;
      }
      return `<p>${corsivi(scappa(blocco))}</p>`;
    })
    .join('\n    ');
}

const corsivi = (s) => s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

const pagina = (titolo, corpo, classe = '') =>
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="it" xml:lang="it">
  <head>
    <meta charset="utf-8"/>
    <title>${scappa(titolo)}</title>
    <link rel="stylesheet" type="text/css" href="stile.css"/>
  </head>
  <body${classe ? ` class="${classe}"` : ''}>
    ${corpo}
  </body>
</html>
`;

const STILE = `/* Pico Edizioni — foglio di stile essenziale.
   Nessun corpo assoluto, nessun colore di fondo: le preferenze di chi legge
   vengono prima di quelle di chi compone. */

body { margin: 0 5%; line-height: 1.5; text-align: justify; hyphens: auto; }
h1, h2 { text-align: center; font-weight: normal; line-height: 1.25; }
h1 { font-size: 1.6em; margin: 2em 0 1em; }
h2 { font-size: 1.25em; margin: 3em 0 1.5em; page-break-before: always; }
h2:first-child { page-break-before: avoid; }
p { margin: 0; text-indent: 1.3em; }
h1 + p, h2 + p, blockquote + p, p.senza-rientro { text-indent: 0; }
blockquote { margin: 1em 2em; font-style: italic; }
blockquote p { text-indent: 0; }
em { font-style: italic; }

.copertina { margin: 0; padding: 0; text-align: center; }
.copertina img { max-width: 100%; height: auto; }

.frontespizio { text-align: center; margin-top: 25%; }
.frontespizio .autore { letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.95em; }
.frontespizio .titolo { font-size: 1.8em; font-style: italic; margin: 1.5em 0 0.6em; }
.frontespizio .sottotitolo { font-style: italic; }
.frontespizio .editore { letter-spacing: 0.25em; text-transform: uppercase; font-size: 0.8em; margin-top: 4em; }

.colophon { font-size: 0.85em; text-align: left; }
.colophon p { text-indent: 0; margin-bottom: 1em; }

nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.5em 0; }
`;

// ── composizione di un volume ───────────────────────────────────────────────
function componi(slug) {
  const scheda = leggiScheda(join(DIR_SCHEDE, `${slug}.md`));
  const testo = readFileSync(join(DIR_TESTI, `${slug}.md`), 'utf8');
  const corpo = testo.slice(testo.indexOf('---', 4) + 4);

  // divisione in capitoli
  const capitoli = [];
  for (const blocco of corpo.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
    if (blocco.startsWith('## ')) capitoli.push({ titolo: blocco.slice(3), blocchi: [] });
    else if (capitoli.length) capitoli.at(-1).blocchi.push(blocco);
  }

  // identificativo stabile: stesso libro, stesso codice a ogni rigenerazione
  const impronta = createHash('sha1').update(`picoedizioni:${slug}`).digest('hex');
  const uuid = `${impronta.slice(0, 8)}-${impronta.slice(8, 12)}-${impronta.slice(12, 16)}-${impronta.slice(16, 20)}-${impronta.slice(20, 32)}`;
  const modificato = `${scheda.annoTraduzione}-01-01T00:00:00Z`;

  const filePng = join(DIR_COPERTINE, `${slug}.png`);
  const haCopertina = existsSync(filePng);

  // ── i file del pacchetto ──────────────────────────────────────────────────
  const voci = [{ nome: 'mimetype', dati: 'application/epub+zip', comprimi: false }];

  voci.push({
    nome: 'META-INF/container.xml',
    dati: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  });

  voci.push({ nome: 'OEBPS/stile.css', dati: STILE });

  if (haCopertina) {
    voci.push({ nome: 'OEBPS/immagini/copertina.png', dati: readFileSync(filePng) });
    voci.push({
      nome: 'OEBPS/copertina.xhtml',
      dati: pagina(
        'Copertina',
        `<div class="copertina"><img src="immagini/copertina.png" alt="Copertina di ${scappa(scheda.titolo)}"/></div>`,
        'copertina'
      ),
    });
  }

  voci.push({
    nome: 'OEBPS/frontespizio.xhtml',
    dati: pagina(
      scheda.titolo,
      `<div class="frontespizio">
      <p class="autore">${scappa(scheda.autore)}</p>
      <h1 class="titolo">${scappa(scheda.titolo)}</h1>
      ${scheda.sottotitolo ? `<p class="sottotitolo">${scappa(scheda.sottotitolo)}</p>` : ''}
      <p class="editore">Pico Edizioni</p>
    </div>`
    ),
  });

  voci.push({
    nome: 'OEBPS/colophon.xhtml',
    dati: pagina(
      'Colophon',
      `<div class="colophon">
      <p>Titolo originale: <em>${scappa(scheda.titoloOriginale)}</em><br/>
         Prima edizione ${scappa(scheda.annoOriginale)}. Opera di pubblico dominio.</p>
      <p>Traduzione italiana di Pico Edizioni, ${scappa(scheda.annoTraduzione)}.</p>
      <p>Questa traduzione è frutto di un lavoro volontario e non è in vendita.
         È distribuita sotto licenza ${scappa(sito.licenza.nome)}: siete liberi di
         scaricarla, stamparla e ridistribuirla gratuitamente, citando la fonte;
         non potete venderla né pubblicarne versioni modificate.</p>
      <p><em>${scappa(sito.motto)}</em><br/>${scappa(sito.mottoFonte)}</p>
    </div>`
    ),
  });

  const fileCapitoli = capitoli.map((capitolo, i) => {
    const nome = `testo-${String(i + 1).padStart(2, '0')}.xhtml`;
    voci.push({
      nome: `OEBPS/${nome}`,
      dati: pagina(
        capitolo.titolo,
        `<h2>${scappa(capitolo.titolo)}</h2>\n    ${inXhtml(capitolo.blocchi)}`
      ),
    });
    return { nome, titolo: capitolo.titolo };
  });

  // indice navigabile (ePub 3)
  voci.push({
    nome: 'OEBPS/nav.xhtml',
    dati: pagina(
      'Indice',
      `<nav epub:type="toc" id="toc">
      <h1>Indice</h1>
      <ol>
        ${fileCapitoli.map((c) => `<li><a href="${c.nome}">${scappa(c.titolo)}</a></li>`).join('\n        ')}
      </ol>
    </nav>
    <nav epub:type="landmarks" hidden="hidden">
      <ol>
        ${haCopertina ? '<li><a epub:type="cover" href="copertina.xhtml">Copertina</a></li>' : ''}
        <li><a epub:type="bodymatter" href="${fileCapitoli[0].nome}">Inizio</a></li>
      </ol>
    </nav>`
    ),
  });

  // indice per i lettori più vecchi (ePub 2)
  voci.push({
    nome: 'OEBPS/toc.ncx',
    dati: `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${scappa(scheda.titolo)}</text></docTitle>
  <navMap>
${fileCapitoli
  .map(
    (c, i) => `    <navPoint id="n${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${scappa(c.titolo)}</text></navLabel>
      <content src="${c.nome}"/>
    </navPoint>`
  )
  .join('\n')}
  </navMap>
</ncx>
`,
  });

  // il pacchetto
  voci.push({
    nome: 'OEBPS/content.opf',
    dati: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="it">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${scappa(scheda.titolo)}</dc:title>
    ${scheda.sottotitolo ? `<dc:title id="sub">${scappa(scheda.sottotitolo)}</dc:title>` : ''}
    <dc:creator id="autore">${scappa(scheda.autore)}</dc:creator>
    <meta refines="#autore" property="role" scheme="marc:relators">aut</meta>
    <dc:contributor id="traduttore">Pico Edizioni</dc:contributor>
    <meta refines="#traduttore" property="role" scheme="marc:relators">trl</meta>
    <dc:publisher>Pico Edizioni</dc:publisher>
    <dc:language>it</dc:language>
    <dc:date>${scheda.annoTraduzione}-01-01</dc:date>
    <dc:source>${scappa(scheda.titoloOriginale)} (${scappa(scheda.annoOriginale)})</dc:source>
    <dc:rights>Traduzione sotto licenza ${scappa(sito.licenza.nome)}. Testo originale di pubblico dominio.</dc:rights>
    <meta property="dcterms:modified">${modificato}</meta>
    ${haCopertina ? '<meta name="cover" content="copertina-img"/>' : ''}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="stile" href="stile.css" media-type="text/css"/>
    ${haCopertina ? '<item id="copertina-img" href="immagini/copertina.png" media-type="image/png" properties="cover-image"/>' : ''}
    ${haCopertina ? '<item id="copertina" href="copertina.xhtml" media-type="application/xhtml+xml"/>' : ''}
    <item id="frontespizio" href="frontespizio.xhtml" media-type="application/xhtml+xml"/>
    <item id="colophon" href="colophon.xhtml" media-type="application/xhtml+xml"/>
${fileCapitoli
  .map((c, i) => `    <item id="t${i + 1}" href="${c.nome}" media-type="application/xhtml+xml"/>`)
  .join('\n')}
  </manifest>
  <spine toc="ncx">
    ${haCopertina ? '<itemref idref="copertina"/>' : ''}
    <itemref idref="frontespizio"/>
    <itemref idref="colophon"/>
    <itemref idref="nav"/>
${fileCapitoli.map((_, i) => `    <itemref idref="t${i + 1}"/>`).join('\n')}
  </spine>
</package>
`,
  });

  const zip = creaZip(voci);
  writeFileSync(join(DIR_USCITA, `${slug}.epub`), zip);

  return { slug, capitoli: capitoli.length, file: voci.length, peso: Math.round(zip.length / 1024) };
}

// ── esecuzione ──────────────────────────────────────────────────────────────
const filtro = process.argv[2];
const volumi = readdirSync(DIR_TESTI)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''))
  .filter((s) => !filtro || s.includes(filtro));

console.log('');
for (const slug of volumi) {
  const r = componi(slug);
  console.log(
    `   ${r.slug}.epub  ${r.capitoli} capitoli, ${r.file} file, ${r.peso} KB`
  );
}
console.log('');
