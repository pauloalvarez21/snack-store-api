// Ejecuta seed.sql contra la base de datos configurada en .env
// Uso: node --env-file=.env scripts/seed.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function buildConfig() {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    // Neon exige TLS: si la URL no trae sslmode, lo forzamos sin verificar certificado
    const ssl = url.includes('sslmode') ? undefined : { rejectUnauthorized: false };
    return { connectionString: url, ssl };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

const client = new Client(buildConfig());

try {
  await client.connect();
  const sql = readFileSync(join(root, 'seed.sql'), 'utf8');

  await client.query('BEGIN');
  const result = await client.query(sql);
  await client.query('COMMIT');

  console.log('✅ Seed aplicado correctamente');
  if (result[0]) console.log(`   Categorías insertadas: ${result[0].rowCount}`);
  if (result[1]) console.log(`   Productos insertados:  ${result[1].rowCount}`);
  if (result[2]) console.log(`   Inventario insertado:  ${result[2].rowCount}`);

  const counts = await client.query(
    `SELECT (SELECT count(*) FROM categories) AS categories,
            (SELECT count(*) FROM products)   AS products,
            (SELECT count(*) FROM inventory)  AS inventory;`,
  );
  console.log('   Totales en BD:', JSON.stringify(counts.rows[0]));
} catch (err) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('❌ Error al aplicar el seed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
