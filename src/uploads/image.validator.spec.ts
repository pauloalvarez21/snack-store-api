import { isValidImageSignature } from './image.validator';

describe('isValidImageSignature', () => {
  it('reconoce una cabecera PNG válida', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);
    expect(isValidImageSignature('image/png', png)).toBe(true);
  });

  it('reconoce una cabecera JPEG válida', () => {
    const jpeg = Buffer.alloc(16);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0);
    expect(isValidImageSignature('image/jpeg', jpeg)).toBe(true);
  });

  it('reconoce una cabecera WebP válida', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
    ]);
    expect(isValidImageSignature('image/webp', webp)).toBe(true);
  });

  it('rechaza un archivo HTML disfrazado de PNG', () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>hola</body></html>');
    expect(isValidImageSignature('image/png', html)).toBe(false);
  });

  it('rechaza mimetypes desconocidos o no permitidos', () => {
    expect(isValidImageSignature('text/plain', Buffer.alloc(16))).toBe(false);
    expect(isValidImageSignature('image/svg+xml', Buffer.alloc(16))).toBe(
      false,
    );
  });
});
