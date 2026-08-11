// Migración idempotente: añade los métodos de pago NEQUI y DAVIPLATA al enum
// payment_method en bases que ya existían (creadas antes de este cambio).
// Los valores antiguos (CREDIT_CARD/DEBIT_CARD/TRANSFER) permanecen en el
// tipo pero quedan sin uso: la app ya no los envía. Requiere PostgreSQL 12+
// (ALTER TYPE ADD VALUE dentro de transacción), compatible con Neon.
// Uso: node --env-file=.env scripts/migrate-payment-methods.mjs
import pg from 'pg';

const SQL = `
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'NEQUI';
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'DAVIPLATA';
`;

for (let attempt = 1; attempt <= 5; attempt++) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query(SQL);
    console.log(
      '✅ Migración aplicada: NEQUI y DAVIPLATA agregados al enum payment_method',
    );
    await client.end().catch(() => {});
    break;
  } catch (error) {
    console.log(`Intento ${attempt} fallido: ${error.message}`);
    if (attempt === 5) {
      console.error('❌ No se pudo aplicar la migración');
      process.exitCode = 1;
    }
    await client.end().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
