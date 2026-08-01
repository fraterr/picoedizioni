# Pico Edizioni — sito

Sito statico costruito con [Astro](https://astro.build), pubblicato su GitHub
Pages, aggiornabile da un CMS con interfaccia web.

---

## Indice

1. [Cosa manca prima di pubblicare](#1-cosa-manca-prima-di-pubblicare)
2. [Lavorare in locale](#2-lavorare-in-locale)
3. [Mettere online il sito](#3-mettere-online-il-sito)
4. [Collegare il CMS](#4-collegare-il-cms)
5. [Aggiungere un libro](#5-aggiungere-un-libro)
6. [Newsletter, statistiche, donazioni](#6-newsletter-statistiche-donazioni)
7. [Come è fatto](#7-come-è-fatto)

---

## 1. Cosa manca prima di pubblicare

Sette cose. Tutte segnate nel codice con `DA-CONFIGURARE` o con un valore vuoto.

| Cosa | Dove | Nota |
|---|---|---|
| Utente GitHub e nome del repository | `astro.config.mjs`, righe `SITE` e `BASE` | Senza questo i collegamenti puntano nel vuoto |
| Indirizzo email pubblico | `src/data/sito.json` → `email` | Vedi § 6 per l'alias anonimo |
| Collegamento Buy Me a Coffee | `src/data/sito.json` → `collegamenti.sostieni` | Vuoto = il collegamento non compare |
| Newsletter | `src/data/sito.json` → `newsletter` | Vedi § 6 |
| Statistiche | `src/data/sito.json` → `statistiche` | Vedi § 6 |
| Le copertine per le anteprime social | `public/copertine/` | Nel sito le copertine sono disegnate; questi file servono solo a WhatsApp e simili |

---

## 2. Lavorare in locale

Serve [Node.js](https://nodejs.org) 20 o successivo.

Installare le dipendenze, una volta sola:

```bash
npm install
```

Avviare il sito in locale — si aggiorna da solo a ogni modifica:

```bash
npm run dev
```

Verificare che tutto si costruisca senza errori:

```bash
npm run build
```

Guardare il risultato della build come sarà online:

```bash
npm run preview
```

---

## 3. Mettere online il sito

1. Creare un repository su GitHub (per esempio `pico-edizioni`).

2. Aprire `astro.config.mjs` e correggere le prime due costanti:

   ```js
   const SITE = 'https://TUO-UTENTE.github.io';
   const BASE = '/pico-edizioni';        // il nome del repository
   ```

   Se un giorno arriva un dominio proprio, diventa `SITE = 'https://picoedizioni.it'`
   e `BASE = '/'`, più un file `public/CNAME` che contiene solo `picoedizioni.it`.

3. Caricare il progetto:

   ```bash
   git init
   git add .
   git commit -m "Prima versione del sito"
   git branch -M main
   git remote add origin https://github.com/TUO-UTENTE/pico-edizioni.git
   git push -u origin main
   ```

4. Su GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Fatto. Da questo momento ogni modifica al ramo `main` ricostruisce e ripubblica
il sito da sola, in un paio di minuti. Lo stato si vede nella scheda **Actions**.

---

## 4. Collegare il CMS

Il CMS è [Pages CMS](https://pagescms.org): è gratuito, non va installato da
nessuna parte e non richiede alcun server. Legge la configurazione dal file
`.pages.yml` che è già in questo repository.

1. Andare su <https://app.pagescms.org> e accedere con GitHub.
2. Autorizzare l'accesso al repository del sito.
3. Da lì si possono aggiungere libri, caricare copertine ed ePub, riscrivere le
   pagine di testo e cambiare le impostazioni generali.

Ogni salvataggio nel CMS è un commit su GitHub, che fa ripartire la
pubblicazione. Non c'è nessun passaggio manuale.

Il CMS mostra quattro sezioni:

- **Libri** — le schede del catalogo;
- **Anteprime** — il testo delle prime pagine (di norma generato dallo script);
- **Pagine** — manifesto, privacy, pubblico dominio;
- **Impostazioni del sito** — email, collegamenti, motto, newsletter, licenza.

> **Un avvertimento.** Il campo **Indirizzo web** (`slug`) di ogni libro è quello
> che compare nell'URL. Cambiarlo dopo la pubblicazione rompe tutti i
> collegamenti già condivisi in giro.

---

## 5. Aggiungere un libro

### Per la via veloce

1. Mettere il file `.epub` in `public/libri/`, con un nome tutto minuscolo e
   senza accenti: `il-potere-della-parola.epub`.

2. Lanciare:

   ```bash
   npm run estrai-epub
   ```

   Lo script estrae la copertina, genera l'anteprima (prefazione e primo
   capitolo), conta parole e pagine, e crea una bozza di scheda in
   `src/content/libri/`. Stampa anche l'indice, da copiare nella scheda.

3. Completare la scheda appena creata: titolo originale, anno, quarta di
   copertina, nota del traduttore, indice. I campi da riempire sono segnati con
   `Da scrivere`.

4. Comporre il PDF:

   ```bash
   npm run genera-pdf
   ```

   Riporta il numero di pagine reale: va copiato nel campo `pagine` della
   scheda, insieme a `pdf: /libri/<nome>.pdf`.

Lo script non sovrascrive mai una scheda già esistente: si può rilanciare
tranquillamente per rigenerare copertine, anteprime e testi.

### La filiera, in ordine

Il testo in `src/content/testi/` è **la sorgente di tutto**: da lì nascono
l'ePub, il PDF, l'anteprima sul sito. Si corregge lì, e si rigenera.

```bash
npm run estrai-epub        # 1. da un ePub esterno → testo + bozza di scheda
npm run analizza           # 2. censisce i difetti, non tocca niente
npm run normalizza         # 3. microtipografia + rigenera le anteprime
npm run genera-copertine   # 4. le copertine disegnate → PNG
npm run genera-epub        # 5. l'ePub definitivo, metadati corretti
npm run genera-pdf         # 6. il PDF impaginato
```

I passi 3–6 si possono rilanciare all'infinito: sono tutti deterministici e
non distruggono nulla. Il passo 1 si usa solo per importare un libro nuovo.

C'è anche `npm run ripristina-capoversi`, che serve a un caso specifico:
rimettere i capoversi in un testo che li ha persi nella conversione. Lavora
solo sulla struttura dell'edizione originale, depositata in
`scripts/dati/`, e senza quel file si rifiuta di partire — i capoversi non
si inventano.

### Come nasce il PDF

Non c'è nessun convertitore automatico di mezzo. `estrai-epub` tira fuori
dall'ePub il testo integrale e lo mette in `src/content/testi/`; la rotta
`/stampa/<nome>/` lo impagina come un libro — formato A5, frontespizio,
colophon, indice, giustificato con sillabazione, capoversi rientrati, un
capitolo per pagina; `genera-pdf` apre quella pagina con Chrome in headless e
la stampa.

Il vantaggio è che la tipografia si corregge modificando un foglio di stile e
si rigenera in dieci secondi. Per vedere l'impaginato mentre lo si mette a
punto, con `npm run dev` attivo:

```
http://localhost:4321/pico-edizioni/stampa/liberta-per-tutti/
```

A schermo simula i fogli; con Ctrl+P si vede l'anteprima di stampa vera. Le
regole tipografiche stanno tutte in fondo a `src/pages/stampa/[slug].astro`.

> Serve Chrome installato (lo script lo trova da solo). Non viene scaricato
> nessun secondo browser.

### Dal CMS

Sezione **Libri → Add an entry**, e si compilano i campi a mano. Copertina ed
ePub si caricano direttamente dal browser.

---

## 6. Newsletter, statistiche, donazioni

Tutti e tre sono spenti finché non li si configura, e il sito funziona
perfettamente anche senza.

### Un indirizzo email che non riveli il tuo

Serve un alias che inoltra alla casella vera senza mostrarla. Due strade
gratuite:

- **[DuckDuckGo Email Protection](https://duckduckgo.com/email/)** — si sceglie
  un indirizzo `qualcosa@duck.com`, inoltra alla casella vera e per giunta
  toglie i tracciatori dai messaggi in arrivo. La più semplice.
- **[addy.io](https://addy.io)** — alias illimitati, si può rispondere *dall'*
  alias senza scoprire l'indirizzo vero. Più potente, un filo più macchinoso.

L'indirizzo scelto va in `src/data/sito.json` → `email`. Nella pagina non compare
mai in chiaro nel sorgente: viene ricomposto dal browser, il che tiene lontana
la quasi totalità dei raccoglitori automatici.

### Newsletter

Consigliato **[Buttondown](https://buttondown.com)**: gratuito fino a 100
iscritti, niente pubblicità in coda ai messaggi, esportazione libera.

Dopo la registrazione, in `src/data/sito.json`:

```json
"newsletter": {
  "attiva": true,
  "azione": "https://buttondown.com/api/emails/embed-subscribe/TUO-NOME",
  "testo": "Un messaggio soltanto quando esce una nuova traduzione."
}
```

### Statistiche di visita

Consigliato **[GoatCounter](https://www.goatcounter.com)**: gratuito per usi non
commerciali, senza cookie e senza raccolta di indirizzi IP. È il motivo per cui
questo sito non ha alcun banner da chiudere: se si usasse Google Analytics il
banner diventerebbe obbligatorio.

```json
"statistiche": { "attive": true, "codiceGoatCounter": "picoedizioni" }
```

Il codice è solo il nome scelto in fase di registrazione, non l'indirizzo intero.

### Donazioni

Su [buymeacoffee.com](https://www.buymeacoffee.com) si crea la pagina e si
incolla l'indirizzo in `collegamenti.sostieni`. Finché il campo è vuoto, del
caffè non c'è traccia da nessuna parte nel sito.

---

## 7. Come è fatto

```
public/
  copertine/          immagini di copertina (estratte dagli ePub)
  libri/              gli ePub e i PDF da scaricare
  favicon.svg
src/
  components/         testata, piè di pagina, marca, schede, moduli
  content/
    libri/            una scheda per volume (frontmatter + nota del traduttore)
    anteprime/        le prime pagine, generate dallo script
    pagine/           manifesto, privacy, pubblico dominio
    config.ts         forma e vincoli dei contenuti
  data/sito.json      impostazioni generali
  layouts/Base.astro  intelaiatura comune, meta, tema chiaro/scuro
  lib/                utilità (percorsi, peso dei file)
  pages/              le rotte del sito
  styles/globale.css  palette, tipografia, componenti comuni
scripts/
  estrai-epub.mjs     estrattore di copertine, anteprime e conteggi
.pages.yml            configurazione del CMS
```

### Scelte da conoscere

**Il menu resta di tre voci** — Manifesto, Catalogo, Contatti — qualunque sia il
numero di libri. I titoli vivono nel catalogo. Quando gli autori diventeranno
più di uno, nel catalogo comparirà da solo un filtro per autore: non c'è niente
da attivare.

**Tutti i colori e i caratteri** stanno nelle variabili in cima a
`src/styles/globale.css`. Cambiare il giallo lì lo cambia in tutto il sito.

**I caratteri sono ospitati qui** (EB Garamond per il testo, Inter per le
etichette): nessuna richiesta a Google, nessun dato che esce.

**Il tema chiaro/scuro** segue le impostazioni del sistema; l'interruttore in
alto a destra permette di forzarlo, e la scelta resta memorizzata nel browser.

**Il sito funziona senza JavaScript.** Senza, si perdono soltanto l'interruttore
del tema, il filtro per autore e l'email cliccabile (che resta comunque leggibile).
