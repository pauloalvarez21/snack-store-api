import { closeSync, openSync, readSync } from 'node:fs';

/** Lee los primeros bytes de un archivo (para validar su firma real). */
export function readFileHeader(path: string, bytes = 16): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    readSync(fd, buffer, 0, bytes, 0);
    return buffer;
  } finally {
    closeSync(fd);
  }
}

const MAGIC_CHECKERS: Record<string, (header: Buffer) => boolean> = {
  'image/jpeg': (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  'image/png': (h) =>
    h
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (h) =>
    h.subarray(0, 6).equals(Buffer.from('GIF87a')) ||
    h.subarray(0, 6).equals(Buffer.from('GIF89a')),
  'image/webp': (h) =>
    h.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    h.subarray(8, 12).equals(Buffer.from('WEBP')),
  'image/avif': (h) =>
    h.subarray(4, 8).equals(Buffer.from('ftyp')) &&
    (h.subarray(8, 12).equals(Buffer.from('avif')) ||
      h.subarray(8, 12).equals(Buffer.from('avis'))),
};

/**
 * Valida que la cabecera real del archivo coincida con el mimetype declarado.
 * El mimetype llega en el Content-Type del multipart y es falseable por el
 * cliente, así que comprobamos la firma binaria de los formatos permitidos.
 */
export function isValidImageSignature(
  mimetype: string,
  header: Buffer,
): boolean {
  const check = MAGIC_CHECKERS[mimetype];
  return check ? check(header) : false;
}
