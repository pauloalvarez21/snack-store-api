import type { SalesReport } from './orders.service';

const CRLF = '\r\n';

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
 * Serializa el reporte de ventas a CSV en 4 secciones: resumen, ventas por
 * día, top productos y desglose por método de pago. Incluye BOM UTF-8 para
 * que Excel interprete correctamente los acentos del español.
 * `generatedAt` (mismo timestamp que el nombre de archivo) mantiene el
 * helper determinista.
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

  return out.join('');
}
