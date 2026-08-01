// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// ─────────────────────────────────────────────────────────────────────────────
// ATTENZIONE — due valori da aggiornare quando pubblichi su GitHub Pages.
//
//   site : l'indirizzo pubblico del sito.
//   base : la sottocartella. Serve SOLO se il repository non si chiama
//          <tuo-utente>.github.io. Esempio: repo "pico-edizioni" pubblicato da
//          "mario" -> site: 'https://mario.github.io', base: '/pico-edizioni'
//
// Se in futuro compri un dominio (es. picoedizioni.it):
//   site: 'https://picoedizioni.it', base: '/'  (e crea public/CNAME)
// ─────────────────────────────────────────────────────────────────────────────

const SITE = 'https://fraterr.github.io';
const BASE = '/picoedizioni';

/**
 * I testi scritti nel CMS contengono collegamenti come "/contatti/".
 * Quando il sito vive in una sottocartella vanno riscritti in
 * "/pico-edizioni/contatti/". Questo piccolo plugin lo fa in fase di build,
 * così chi scrive non deve pensarci.
 */
function prefissaCollegamenti() {
  const base = BASE.replace(/\/$/, '');
  if (!base) return () => {};
  const attributi = { a: 'href', img: 'src', source: 'srcset' };
  return () => (albero) => {
    const visita = (nodo) => {
      if (nodo.type === 'element') {
        const attributo = attributi[nodo.tagName];
        const valore = attributo && nodo.properties?.[attributo];
        if (typeof valore === 'string' && valore.startsWith('/') && !valore.startsWith('//')) {
          nodo.properties[attributo] = base + valore;
        }
      }
      (nodo.children || []).forEach(visita);
    };
    visita(albero);
  };
}

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  // L'impaginato per la stampa serve solo a produrre i PDF: fuori dalla sitemap.
  integrations: [sitemap({ filter: (pagina) => !pagina.includes('/stampa/') })],
  build: { format: 'directory' },
  markdown: {
    smartypants: true,
    rehypePlugins: [prefissaCollegamenti()],
  },
});
