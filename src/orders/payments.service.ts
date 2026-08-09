import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Payment, PaymentMethod, PaymentStatus } from './payment.entity';

/**
 * Pagos SIMULADOS: no hay pasarela externa todavía.
 * - Tarjetas (CREDIT_CARD / DEBIT_CARD) → se simula una pasarela exitosa (COMPLETED) al crear el pedido.
 * - Transferencia → queda PENDING hasta que un ADMIN confirma el pago.
 * - Contra entrega → queda PENDING y se marca COMPLETED al entregar.
 *
 * Todos los métodos reciben un `Repository<Payment>` para poder ejecutarse
 * dentro de la misma transacción de base de datos que el pedido.
 */
@Injectable()
export class PaymentsService {
  /** Crea el pago del pedido (las tarjetas se "cobran" al instante). */
  async create(
    paymentsRepository: Repository<Payment>,
    orderId: string,
    method: PaymentMethod,
    amount: number,
  ): Promise<Payment> {
    const isCard =
      method === PaymentMethod.CREDIT_CARD ||
      method === PaymentMethod.DEBIT_CARD;

    const payment = paymentsRepository.create({
      orderId,
      method,
      amount: amount.toString(),
      status: isCard ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
      transactionId: isCard
        ? `SIM-${randomUUID().slice(0, 8).toUpperCase()}`
        : null,
    });
    return paymentsRepository.save(payment);
  }

  /** Confirma el pago (transferencia verificada o cobro contra entrega). */
  async complete(
    paymentsRepository: Repository<Payment>,
    orderId: string,
  ): Promise<void> {
    const payment = await paymentsRepository.findOne({ where: { orderId } });
    if (!payment || payment.status !== PaymentStatus.PENDING) {
      return;
    }
    payment.status = PaymentStatus.COMPLETED;
    payment.transactionId = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
    await paymentsRepository.save(payment);
  }

  /** Marca el pago según la cancelación del pedido (reembolso si ya se cobró). */
  async cancel(
    paymentsRepository: Repository<Payment>,
    orderId: string,
  ): Promise<void> {
    const payment = await paymentsRepository.findOne({ where: { orderId } });
    if (!payment) {
      return;
    }
    payment.status =
      payment.status === PaymentStatus.COMPLETED
        ? PaymentStatus.REFUNDED
        : PaymentStatus.FAILED;
    await paymentsRepository.save(payment);
  }
}
