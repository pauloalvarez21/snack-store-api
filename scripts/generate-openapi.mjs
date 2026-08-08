// Genera openapi.json a partir de la app compilada (dist/main).
// Uso: npm run generate:openapi
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = process.env.PORT ?? '3000';
const BASE = `http://localhost:${PORT}`;
const OUT = 'openapi.json';

const child = spawn('node', ['dist/main'], {
  stdio: 'ignore',
  env: { ...process.env },
});

async function fetchDocument() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/api/docs-json`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // el servidor aún no está listo
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('No se pudo obtener el documento OpenAPI de /api/docs-json');
}

try {
  const document = await fetchDocument();
  const paths = Object.keys(document.paths ?? {}).length;
  writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`✅ ${OUT} generado (${paths} rutas documentadas)`);
} finally {
  child.kill();
}
