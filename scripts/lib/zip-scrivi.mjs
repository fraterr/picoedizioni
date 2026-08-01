// Scrittore ZIP minimale, quanto basta per comporre un ePub.
// Il file "mimetype" deve stare per primo e non compresso: è l'unica
// stranezza del formato, e questa funzione la rispetta.
import { deflateRawSync } from 'node:zlib';

const TAVOLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TAVOLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {Array<{nome: string, dati: Buffer|string, comprimi?: boolean}>} voci
 * @returns {Buffer}
 */
export function creaZip(voci) {
  const locali = [];
  const centrali = [];
  let offset = 0;

  for (const voce of voci) {
    const nome = Buffer.from(voce.nome, 'utf8');
    const dati = Buffer.isBuffer(voce.dati) ? voce.dati : Buffer.from(voce.dati, 'utf8');
    const comprimi = voce.comprimi !== false;
    const compressi = comprimi ? deflateRawSync(dati, { level: 9 }) : dati;
    const metodo = comprimi ? 8 : 0;
    const somma = crc32(dati);

    const locale = Buffer.alloc(30);
    locale.writeUInt32LE(0x04034b50, 0);
    locale.writeUInt16LE(20, 4); // versione necessaria
    locale.writeUInt16LE(0, 6); // nessun flag
    locale.writeUInt16LE(metodo, 8);
    locale.writeUInt16LE(0, 10); // ora
    locale.writeUInt16LE(0x21, 12); // data: 1 gennaio 1980, per build riproducibili
    locale.writeUInt32LE(somma, 14);
    locale.writeUInt32LE(compressi.length, 18);
    locale.writeUInt32LE(dati.length, 22);
    locale.writeUInt16LE(nome.length, 26);
    locale.writeUInt16LE(0, 28);
    locali.push(locale, nome, compressi);

    const centrale = Buffer.alloc(46);
    centrale.writeUInt32LE(0x02014b50, 0);
    centrale.writeUInt16LE(20, 4); // versione di creazione
    centrale.writeUInt16LE(20, 6); // versione necessaria
    centrale.writeUInt16LE(0, 8);
    centrale.writeUInt16LE(metodo, 10);
    centrale.writeUInt16LE(0, 12);
    centrale.writeUInt16LE(0x21, 14);
    centrale.writeUInt32LE(somma, 16);
    centrale.writeUInt32LE(compressi.length, 20);
    centrale.writeUInt32LE(dati.length, 24);
    centrale.writeUInt16LE(nome.length, 28);
    centrale.writeUInt16LE(0, 30); // extra
    centrale.writeUInt16LE(0, 32); // commento
    centrale.writeUInt16LE(0, 34); // disco
    centrale.writeUInt16LE(0, 36); // attributi interni
    centrale.writeUInt32LE(0, 38); // attributi esterni
    centrale.writeUInt32LE(offset, 42);
    centrali.push(centrale, nome);

    offset += locale.length + nome.length + compressi.length;
  }

  const corpoCentrale = Buffer.concat(centrali);
  const fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0);
  fine.writeUInt16LE(0, 4);
  fine.writeUInt16LE(0, 6);
  fine.writeUInt16LE(voci.length, 8);
  fine.writeUInt16LE(voci.length, 10);
  fine.writeUInt32LE(corpoCentrale.length, 12);
  fine.writeUInt32LE(offset, 16);
  fine.writeUInt16LE(0, 20);

  return Buffer.concat([...locali, corpoCentrale, fine]);
}
