// Fija NODE_ENV=test antes de cada suite e2e para que el rate limiting
// se desactive (ver skipIf en ThrottlerModule de src/app.module.ts).
process.env.NODE_ENV = 'test';
