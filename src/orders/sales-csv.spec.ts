import type { SalesReport } from './orders.service';
import { PaymentMethod } from './payment.entity';
import { buildSalesCsv } from './sales-csv';

const report: SalesReport = {
  range: { from: null, to: null },
  summary: { totalOrders: 3, totalAmount: 50.01, averageTicket: 16.67 },
  byDay: [
    { date: '2026-08-08', orders: 2, amount: 33.34 },
    { date: '2026-08-07', orders: 1, amount: 16.67 },
  ],
  topProducts: [
    {
      productId: 'p1',
      productName: 'Papas Fritas, Grandes',
      quantity: 4,
      amount: 12,
    },
  ],
  byPaymentMethod: [{ method: PaymentMethod.NEQUI, orders: 3, amount: 50.01 }],
  paymentInstructions: [
    { method: PaymentMethod.NEQUI, walletNumber: '3001234567' },
    { method: PaymentMethod.DAVIPLATA, walletNumber: '3011234567' },
    { method: PaymentMethod.CASH_ON_DELIVERY, walletNumber: null },
  ],
};

describe('buildSalesCsv', () => {
  it('empieza con BOM UTF-8 para que Excel lea los acentos', () => {
    expect(buildSalesCsv(report).startsWith('\uFEFF')).toBe(true);
  });

  it('incluye todas las secciones del reporte con sus encabezados', () => {
    const csv = buildSalesCsv(report);
    expect(csv).toContain('Reporte de ventas');
    expect(csv).toContain('Resumen');
    expect(csv).toContain('Ventas por día');
    expect(csv).toContain('Top productos (por monto)');
    expect(csv).toContain('Desglose por método de pago');
    expect(csv).toContain('Instrucciones de pago');
  });

  it('incluye las instrucciones de pago con el número de cada billetera', () => {
    const csv = buildSalesCsv(report);
    expect(csv).toContain('Metodo,Detalle');
    expect(csv).toContain('Nequi,3001234567');
    expect(csv).toContain('Daviplata,3011234567');
    expect(csv).toContain('Efectivo contra entrega,Se cobra al entregar');
  });

  it('marca como "No configurado" una billetera sin número en el entorno', () => {
    const csv = buildSalesCsv({
      ...report,
      paymentInstructions: [
        { method: PaymentMethod.NEQUI, walletNumber: null },
      ],
    });
    expect(csv).toContain('Nequi,No configurado');
  });

  it('incluye el resumen, las ventas por día y los montos con 2 decimales', () => {
    const csv = buildSalesCsv(report);
    expect(csv).toContain('Pedidos vendidos,3');
    expect(csv).toContain('Monto total,50.01');
    expect(csv).toContain('Ticket promedio,16.67');
    expect(csv).toContain('Fecha,Pedidos,Monto');
    expect(csv).toContain('2026-08-08,2,33.34');
    expect(csv).toContain('Metodo,Pedidos,Monto');
    expect(csv).toContain('NEQUI,3,50.01');
  });

  it('escapa campos con comas entrecomillándolos', () => {
    expect(buildSalesCsv(report)).toContain('"Papas Fritas, Grandes"');
  });

  it('escapa comillas duplicándolas dentro de un campo', () => {
    const csv = buildSalesCsv({
      ...report,
      topProducts: [
        {
          productId: 'p1',
          productName: 'Papas "Premium" Grandes',
          quantity: 1,
          amount: 5,
        },
      ],
    });
    expect(csv).toContain('"Papas ""Premium"" Grandes"');
  });

  it('usa CRLF como salto de línea (compatible con Excel)', () => {
    const csv = buildSalesCsv(report);
    // No hay saltos \n sueltos (solo como parte de \r\n)
    expect(csv.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(csv).toContain('\r\n');
  });

  it('refleja el rango de fechas cuando se filtra', () => {
    const csv = buildSalesCsv({
      ...report,
      range: { from: '2026-08-01T00:00:00.000Z', to: null },
    });
    expect(csv).toContain('Rango,Desde 2026-08-01T00:00:00.000Z');
  });

  it('maneja un reporte vacío sin romperse', () => {
    const empty: SalesReport = {
      range: { from: null, to: null },
      summary: { totalOrders: 0, totalAmount: 0, averageTicket: 0 },
      byDay: [],
      topProducts: [],
      byPaymentMethod: [],
      paymentInstructions: [],
    };
    const csv = buildSalesCsv(empty);
    expect(csv).toContain('Monto total,0.00');
    expect(csv).toContain('Ticket promedio,0.00');
  });
});
