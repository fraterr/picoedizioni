// Usato solo in fase di build (frontmatter delle pagine), mai nel browser.
import { statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Peso di un file di public/, già formattato. Restituisce null se manca:
 * così una scheda con il PDF non ancora pronto non fa fallire la build.
 */
export function peso(percorsoPubblico: string): string | null {
  if (!percorsoPubblico) return null;
  try {
    const byte = statSync(join(process.cwd(), 'public', percorsoPubblico)).size;
    if (byte < 1024) return `${byte} byte`;
    const kb = byte / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
  } catch {
    return null;
  }
}

/** Vero se il file esiste in public/. */
export function esiste(percorsoPubblico: string): boolean {
  if (!percorsoPubblico) return false;
  try {
    statSync(join(process.cwd(), 'public', percorsoPubblico));
    return true;
  } catch {
    return false;
  }
}
