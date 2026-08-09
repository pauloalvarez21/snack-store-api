export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

/**
 * Deriva el estado de disponibilidad a partir del stock real.
 * - Sin stock → OUT_OF_STOCK
 * - Stock <= nivel mínimo → LOW_STOCK
 * - En otro caso → IN_STOCK
 *
 * Se usa tanto en la respuesta pública de productos (sin cantidades exactas)
 * como en los endpoints de inventario (solo ADMIN).
 */
export function computeStockStatus(
  stockQuantity: number,
  minStockLevel: number,
): StockStatus {
  if (stockQuantity <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (stockQuantity <= minStockLevel) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}
