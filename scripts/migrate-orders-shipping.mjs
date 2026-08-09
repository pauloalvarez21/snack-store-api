// Migración idempotente: añade las columnas snapshot de dirección y
// delivered_by_user_id a orders.
// Uso: node --env-file=.env scripts/migrate-orders-shipping.mjs
import pg from 'pg';

const SQL = `
  ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS shipping_address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS shipping_state_province VARCHAR(100),
    ADD COLUMN IF NOT EXISTS shipping_postal_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS shipping_delivery_notes TEXT,
    ADD COLUMN IF NOT EXISTS delivered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
`;

for (let attempt = 1; attempt <= 5; attempt++) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query(SQL);
    console.log('✅ Migración aplicada: columnas shipping_* y delivered_by_user_id en orders');
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
