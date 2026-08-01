// ─────────────────────────────────────────────────────────────────────────────
// Il disegno della copertina, in un posto solo.
// Lo usano: il componente del sito, il generatore delle immagini PNG e
// l'impaginato del PDF. Cambiare qui cambia dappertutto.
// ─────────────────────────────────────────────────────────────────────────────

/** Tinte d'autunno. L'inchiostro è la stessa tinta portata al fondo. */
export const TONI = {
  zabaione: { fondo: '#eec95f', inchiostro: '#241d0b' },
  sottobosco: { fondo: '#9dae6b', inchiostro: '#161a0d' },
  zucca: { fondo: '#e4a054', inchiostro: '#241408' },
  ruggine: { fondo: '#cb7c58', inchiostro: '#24110a' },
  vinaccia: { fondo: '#b4707e', inchiostro: '#210e12' },
  castagna: { fondo: '#c59a6a', inchiostro: '#241a0e' },
  prugna: { fondo: '#9d87a6', inchiostro: '#1a1220' },
  brughiera: { fondo: '#93a0b5', inchiostro: '#12151f' },
};

export const NOMI_TONI = Object.keys(TONI);

const CHIARO = '#f2ead8';

/** Spezza una stringa in righe senza mai tagliare una parola. */
export function spezza(testo, massimo) {
  const righe = [];
  let corrente = '';
  for (const parola of String(testo).split(/\s+/)) {
    const prova = corrente ? `${corrente} ${parola}` : parola;
    if (prova.length > massimo && corrente) {
      righe.push(corrente);
      corrente = parola;
    } else {
      corrente = prova;
    }
  }
  if (corrente) righe.push(corrente);
  return righe;
}

const scappa = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** La marca tipografica, in tracciati. */
export function marcaSvg(colore, trasformazione = '') {
  return `<g ${trasformazione ? `transform="${trasformazione}" ` : ''}fill="none">
    <circle cx="50" cy="50" r="46.2" stroke="${colore}" stroke-width="1.6"/>
    <circle cx="50" cy="50" r="41.4" stroke="${colore}" stroke-width="0.7" opacity="0.55"/>
    <path fill="${colore}" fill-rule="evenodd" d="M40 28 L58 28 C68.5 28 73 32.5 73 40 C73 47.5 68.5 52 58 52 L46 52 L46 69 L55 69 L55 72 L31 72 L31 69 L40 69 Z M46 33.5 L57.5 33.5 C62.5 33.5 66 35.8 66 40 C66 44.2 62.5 46.5 57.5 46.5 L46 46.5 Z"/>
    <path d="M50 78.5 L52 81 L50 83.5 L48 81 Z" fill="${colore}" opacity="0.75"/>
  </g>`;
}

/**
 * La copertina completa.
 * @param {{titolo: string, autore: string, colore?: string, carattere?: string}} dati
 */
export function copertinaSvg({ titolo, autore, colore = 'zabaione', carattere }) {
  const tono = TONI[colore] ?? TONI.zabaione;
  const font = carattere ?? "'EB Garamond', Garamond, Georgia, serif";

  const righeTitolo = spezza(titolo, 15);
  const corpoTitolo = righeTitolo.length <= 2 ? 54 : righeTitolo.length === 3 ? 44 : 36;
  const interlinea = corpoTitolo * 1.16;
  const primaRiga = 300 - ((righeTitolo.length - 1) * interlinea) / 2;

  const righeAutore = spezza(String(autore).toUpperCase(), 22);
  const corpoAutore = righeAutore.length > 1 ? 20 : 23;

  const testo = (contenuto, y, dimensione, extra = '') =>
    `<text x="250" y="${y}" text-anchor="middle" fill="${tono.inchiostro}" font-family="${font}" font-size="${dimensione}" ${extra}>${contenuto}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 707" width="500" height="707">
  <rect width="500" height="707" fill="${tono.fondo}"/>
  <rect x="16" y="16" width="468" height="58" fill="${tono.inchiostro}"/>
  <text x="250" y="53" text-anchor="middle" fill="${CHIARO}" font-family="${font}" font-size="22" letter-spacing="3.4">PICO EDIZIONI <tspan font-style="italic" letter-spacing="0.5">eBook</tspan></text>
  <rect x="16" y="86" width="468" height="605" fill="none" stroke="${tono.inchiostro}" stroke-width="2.4"/>
  <rect x="24" y="94" width="452" height="589" fill="none" stroke="${tono.inchiostro}" stroke-width="1"/>
  ${righeAutore
    .map((r, i) => testo(scappa(r), 192 + i * (corpoAutore * 1.35), corpoAutore, 'letter-spacing="3.2"'))
    .join('\n  ')}
  ${righeTitolo
    .map((r, i) => testo(scappa(r), primaRiga + i * interlinea, corpoTitolo, 'font-style="italic"'))
    .join('\n  ')}
  ${marcaSvg(tono.inchiostro, 'translate(196 444) scale(1.08)')}
  ${testo('PICO EDIZIONI', 626, 21, 'letter-spacing="5"')}
</svg>`;
}
