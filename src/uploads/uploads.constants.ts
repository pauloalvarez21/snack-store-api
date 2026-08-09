import { join } from 'node:path';

// Carpeta local donde se guardan las imágenes subidas (gitignoreada)
export const UPLOADS_DIR = join(process.cwd(), 'uploads');

// Prefijo público con el que la API sirve las imágenes (ver main.ts)
export const UPLOADS_PUBLIC_PREFIX = '/uploads';

// Tamaño máximo por archivo: 5 MB
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// Formatos de imagen permitidos (sin SVG: puede contener scripts)
export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

// Extensión de archivo según el mimetype
export const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};
