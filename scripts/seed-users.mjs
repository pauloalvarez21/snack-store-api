// Crea usuarios demo para probar los roles de la app (CUSTOMER, ADMIN, DELIVERY).
// Uso: node --env-file=.env scripts/seed-users.mjs
// Idempotente: si el email ya existe, no lo duplica ni cambia su contraseña.
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Client } = pg;

const BCRYPT_ROUNDS = 10;

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

const DEMO_USERS = [
  {
    email: 'cliente@snack.store',
    password: 'Demo123!',
    role: 'CUSTOMER',
    firstName: 'Cliente',
    lastName: 'Demo',
    phone: '+56911111111',
  },
  {
    email: 'admin@snack.store',
    password: 'Demo123!',
    role: 'ADMIN',
    firstName: 'Admin',
    lastName: 'Demo',
    phone: '+56922222222',
  },
  {
    email: 'repartidor@snack.store',
    password: 'Demo123!',
    role: 'DELIVERY',
    firstName: 'Repartidor',
    lastName: 'Demo',
    phone: '+56933333333',
  },
];

const client = new Client(buildConfig());

try {
  await client.connect();

  for (const u of DEMO_USERS) {
    const existing = await client.query('SELECT password_hash FROM users WHERE email = $1', [
      u.email,
    ]);

    if (existing.rowCount > 0) {
      console.log(`⏭  Ya existe: ${u.email} (${u.role})`);
      // Verifica que la contraseña conocida siga funcionando
      const ok = await bcrypt.compare(u.password, existing.rows[0].password_hash);
      console.log(`   Contraseña demo ${ok ? '✅ válida' : '❌ NO coincide (cambiada manualmente)'}`);
      continue;
    }

    const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [u.email, hash, u.firstName, u.lastName, u.phone, u.role],
    );
    console.log(`✅ Creado: ${u.email} (${u.role})`);
  }

  console.log('\n--- Credenciales demo ---');
  for (const u of DEMO_USERS) {
    console.log(`${u.role.padEnd(9)} ${u.email} / ${u.password}`);
  }

  const counts = await client.query(
    'SELECT role, count(*) AS total FROM users GROUP BY role ORDER BY role',
  );
  console.log('\nUsuarios por rol en BD:');
  for (const row of counts.rows) {
    console.log(`  ${row.role}: ${row.total}`);
  }
} catch (err) {
  console.error('❌ Error al crear usuarios:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
