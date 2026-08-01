// Il sito può vivere in una sottocartella (GitHub Pages: /nome-repo/).
// Ogni collegamento e ogni immagine passa da qui, così spostare il sito
// significa cambiare una sola riga in astro.config.mjs.

const BASE = import.meta.env.BASE_URL;

/** Antepone la base a un percorso assoluto del sito. u('/catalogo/') */
export function u(percorso: string = '/'): string {
  if (/^(https?:)?\/\/|^mailto:|^#/.test(percorso)) return percorso;
  const base = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const coda = percorso.startsWith('/') ? percorso : `/${percorso}`;
  return `${base}${coda}`.replace(/([^:])\/{2,}/g, '$1/') || '/';
}

/** Formatta un numero secondo le convenzioni italiane. 11560 -> 11.560 */
export const numero = (n: number): string => n.toLocaleString('it-IT');

/** Tempo di lettura stimato, in minuti, a 200 parole al minuto. */
export const minutiLettura = (parole: number): number =>
  Math.max(1, Math.round(parole / 200));
