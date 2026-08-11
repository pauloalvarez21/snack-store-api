import type { SalesReport } from './orders.service';
import { PaymentMethod } from './payment.entity';

const CRLF = '\r\n';

/** Nombre legible de cada método de pago (para las instrucciones). */
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.NEQUI]: 'Nequi',
  [PaymentMethod.DAVIPLATA]: 'Daviplata',
  [PaymentMethod.CASH_ON_DELIVERY]: 'Efectivo contra entrega',
};

/** Escapa un campo CSV: lo entrecomilla si contiene comas, comillas o saltos de línea. */
function escapeField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Formatea montos con 2 decimales (punto decimal, consistente con el CSV). */
function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Convierte una fila de campos en una línea CSV (con salto de línea CRLF). */
function line(...fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeField).join(',') + CRLF;
}

/** Encabezado de sección (línea en blanco + título en negrita de contexto). */
function sectionHeader(title: string): string {
  return CRLF + line(title);
}

/**
 * Detalle legible para la sección de instrucciones de pago: el número de la
 * billetera, o una indicación cuando no aplica o no está configurado.
 */
function paymentDetail(instruction: {
  method: PaymentMethod;
  walletNumber: string | null;
}): string {
  if (instruction.method === PaymentMethod.CASH_ON_DELIVERY) {
    return 'Se cobra al entregar';
  }
  return instruction.walletNumber ?? 'No configurado';
}

/**
 * Serializa el reporte de ventas a CSV en 5 secciones: resumen, ventas por
 * día, top productos, desglose por método de pago e instrucciones de pago.
 * Incluye BOM UTF-8 para que Excel interprete correctamente los acentos del
 * español. `generatedAt` (mismo timestamp que el nombre de archivo) mantiene
 * el helper determinista.
 */
export function buildSalesCsv(
  report: SalesReport,
  generatedAt: Date = new Date(),
): string {
  const out: string[] = ['\uFEFF'];

  out.push(line('Reporte de ventas'));
  out.push(line('Generado', generatedAt.toISOString()));

  const { from, to } = report.range;
  const rangeText =
    from && to
      ? `${from} a ${to}`
      : from
        ? `Desde ${from}`
        : to
          ? `Hasta ${to}`
          : 'Todo el historial';
  out.push(line('Rango', rangeText));

  // Resumen
  out.push(sectionHeader('Resumen'));
  out.push(line('Metrica', 'Valor'));
  out.push(line('Pedidos vendidos', report.summary.totalOrders));
  out.push(line('Monto total', formatAmount(report.summary.totalAmount)));
  out.push(line('Ticket promedio', formatAmount(report.summary.averageTicket)));

  // Ventas por día
  out.push(sectionHeader('Ventas por día'));
  out.push(line('Fecha', 'Pedidos', 'Monto'));
  for (const row of report.byDay) {
    out.push(line(row.date, row.orders, formatAmount(row.amount)));
  }

  // Top productos (por monto)
  out.push(sectionHeader('Top productos (por monto)'));
  out.push(line('Producto', 'Unidades', 'Monto'));
  for (const row of report.topProducts) {
    out.push(line(row.productName, row.quantity, formatAmount(row.amount)));
  }

  // Desglose por método de pago
  out.push(sectionHeader('Desglose por método de pago'));
  out.push(line('Metodo', 'Pedidos', 'Monto'));
  for (const row of report.byPaymentMethod) {
    out.push(line(row.method, row.orders, formatAmount(row.amount)));
  }

  // Instrucciones de pago: a dónde paga el cliente según el método
  out.push(sectionHeader('Instrucciones de pago'));
  out.push(line('Metodo', 'Detalle'));
  for (const row of report.paymentInstructions) {
    out.push(line(PAYMENT_LABELS[row.method], paymentDetail(row)));
  }

  return out.join('');
}
