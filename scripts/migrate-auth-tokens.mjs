// Migración idempotente: crea las tablas de sesión (refresh_tokens y
// revoked_tokens) para soportar refresh tokens y revocación de JWT.
// Uso: node --env-file=.env scripts/migrate-auth-tokens.mjs
import pg from 'pg';

const SQL = `
  CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      revoked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

  CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti VARCHAR(64) PRIMARY KEY,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

for (let attempt = 1; attempt <= 5; attempt++) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query(SQL);
    console.log('✅ Migración aplicada: refresh_tokens y revoked_tokens');
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
