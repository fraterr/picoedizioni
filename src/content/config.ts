import { defineCollection, z } from 'astro:content';

// ─── I libri del catalogo ────────────────────────────────────────────────────
// Il corpo del file Markdown è la nota del traduttore.
const libri = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    sottotitolo: z.string().optional().default(''),
    autore: z.string(),
    titoloOriginale: z.string(),
    annoOriginale: z.number(),
    annoTraduzione: z.number(),
    pagine: z.number(),
    parole: z.number(),
    copertina: z.string(),
    // Il tono della copertina disegnata. Vedi TONI in components/Copertina.astro.
    colore: z
      .enum([
        'zabaione',
        'sottobosco',
        'zucca',
        'ruggine',
        'vinaccia',
        'castagna',
        'prugna',
        'brughiera',
      ])
      .optional()
      .default('zabaione'),
    epub: z.string(),
    pdf: z.string().optional().default(''),
    pubblicato: z.date(),
    inEvidenza: z.boolean().optional().default(false),
    quarta: z.string(),
    indice: z.array(z.string()).optional().default([]),
  }),
});

// ─── Le anteprime, generate da scripts/estrai-epub.mjs ───────────────────────
const anteprime = defineCollection({
  type: 'content',
  schema: z.object({
    libro: z.string(),
    parole: z.number(),
  }),
});

// ─── Il testo integrale, usato solo per comporre il PDF ──────────────────────
// Generato da scripts/estrai-epub.mjs. Non ha una pagina pubblica: lo legge
// soltanto la rotta /stampa/, che serve a produrre il file da scaricare.
const testi = defineCollection({
  type: 'content',
  schema: z.object({
    libro: z.string(),
    parole: z.number(),
  }),
});

// ─── Le pagine di testo (manifesto, note legali…) ────────────────────────────
const pagine = defineCollection({
  type: 'content',
  schema: z.object({
    titolo: z.string(),
    occhiello: z.string().optional().default(''),
    sommario: z.string().optional().default(''),
  }),
});

export const collections = { libri, anteprime, testi, pagine };
