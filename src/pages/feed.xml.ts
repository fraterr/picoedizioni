// Il feed RSS del catalogo: una voce per volume, la più recente in testa.
// Chi lo segue sa di ogni nuova traduzione senza registrarsi da nessuna
// parte — è il canale più rispettoso che esista, in linea con il resto
// del sito.
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { u } from '../lib/percorsi';
import sito from '../data/sito.json';

export async function GET(context: APIContext) {
  const libri = (await getCollection('libri')).sort(
    (a, b) => b.data.pubblicato.valueOf() - a.data.pubblicato.valueOf()
  );

  return rss({
    title: sito.nome,
    description: sito.descrizione,
    site: new URL(u('/'), context.site!).toString(),
    trailingSlash: false,
    customData: '<language>it</language>',
    items: libri.map((libro) => ({
      title: `${libro.data.titolo} — ${libro.data.autore}`,
      description: libro.data.quarta,
      link: new URL(u(`/catalogo/${libro.slug}/`), context.site!).toString(),
      pubDate: libro.data.pubblicato,
    })),
  });
}
