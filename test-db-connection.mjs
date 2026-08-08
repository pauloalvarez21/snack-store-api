// Script de prueba de conexión a PostgreSQL (Neon/local)
// Uso: node --env-file=.env test-db-connection.mjs
import pg from 'pg';

const { Client } = pg;

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
  const res = await client.query('SELECT current_database() AS db, version();');
  console.log('✅ Conexión exitosa');
  console.log('   Base de datos:', res.rows[0].db);
  console.log('   Versión:', res.rows[0].version.split(' on ')[0]);

  const tables = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;`,
  );
  const names = tables.rows.map((r) => r.table_name);
  if (names.length) {
    console.log(`📦 Tablas encontradas (${names.length}): ${names.join(', ')}`);
  } else {
    console.log('⚠️  La base está vacía: falta ejecutar schema.sql en Neon');
  }

  const users = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;`,
  );
  if (users.rows.length) {
    console.log(`👤 Tabla users (${users.rows.length} columnas): ${users.rows.map((r) => r.column_name).join(', ')}`);
  }
} catch (err) {
  console.error('❌ Error de conexión:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
