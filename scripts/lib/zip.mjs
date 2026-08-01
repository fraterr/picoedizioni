// Lettore ZIP minimale (un ePub è uno ZIP). Nessuna dipendenza esterna:
// legge la "central directory" e scompatta le voci con zlib.
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CEN = 0x02014b50;

/**
 * Apre un buffer ZIP e restituisce una mappa { percorso: () => Buffer }.
 * @param {Buffer} buf
 * @returns {Map<string, () => Buffer>}
 */
export function apriZip(buf) {
  // L'EOCD sta in fondo; il commento finale può essere lungo fino a 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archivio non valido: EOCD non trovato');

  const numVoci = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const voci = new Map();
  for (let n = 0; n < numVoci; n++) {
    if (buf.readUInt32LE(p) !== CEN) throw new Error('Central directory corrotta');
    const metodo = buf.readUInt16LE(p + 10);
    const dimCompressa = buf.readUInt32LE(p + 20);
    const lunNome = buf.readUInt16LE(p + 28);
    const lunExtra = buf.readUInt16LE(p + 30);
    const lunCommento = buf.readUInt16LE(p + 32);
    const offLocale = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lunNome);
    p += 46 + lunNome + lunExtra + lunCommento;

    if (nome.endsWith('/')) continue;

    voci.set(nome, () => {
      // L'header locale ripete nome ed extra, con lunghezze proprie.
      const lnNome = buf.readUInt16LE(offLocale + 26);
      const lnExtra = buf.readUInt16LE(offLocale + 28);
      const inizio = offLocale + 30 + lnNome + lnExtra;
      const dati = buf.subarray(inizio, inizio + dimCompressa);
      if (metodo === 0) return Buffer.from(dati);
      if (metodo === 8) return inflateRawSync(dati);
      throw new Error(`Metodo di compressione non supportato (${metodo}) per ${nome}`);
    });
  }
  return voci;
}
