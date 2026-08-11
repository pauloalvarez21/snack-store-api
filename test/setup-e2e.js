// Fija NODE_ENV=test antes de cada suite e2e para que el rate limiting
// se desactive (ver skipIf en ThrottlerModule de src/app.module.ts).
process.env.NODE_ENV = 'test';

// Números de billetera del comercio para que los tests e2e verifiquen que
// se exponen en el pedido (payment.walletNumber) de forma determinista.
process.env.PAYMENT_NEQUI_NUMBER = '3001234567';
process.env.PAYMENT_DAVIPLATA_NUMBER = '3011234567';
