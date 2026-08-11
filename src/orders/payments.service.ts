import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Payment, PaymentMethod, PaymentStatus } from './payment.entity';

/**
 * Pagos SIMULADOS: no hay pasarela externa todavía.
 * - Nequi / Daviplata → quedan PENDING hasta que un ADMIN confirma el pago.
 * - Contra entrega → queda PENDING y se marca COMPLETED al entregar.
 *
 * Todos los métodos reciben un `Repository<Payment>` para poder ejecutarse
 * dentro de la misma transacción de base de datos que el pedido.
 */
@Injectable()
export class PaymentsService {
  /** Crea el pago del pedido (queda PENDING hasta confirmar el cobro). */
  async create(
    paymentsRepository: Repository<Payment>,
    orderId: string,
    method: PaymentMethod,
    amount: number,
  ): Promise<Payment> {
    const payment = paymentsRepository.create({
      orderId,
      method,
      amount: amount.toString(),
      status: PaymentStatus.PENDING,
      transactionId: null,
    });
    return paymentsRepository.save(payment);
  }

  /** Confirma el pago (Nequi/Daviplata verificado o cobro contra entrega). */
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
