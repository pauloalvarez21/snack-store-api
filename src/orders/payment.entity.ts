import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  TRANSFER = 'TRANSFER',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @OneToOne(() => Order, (order) => order.payment)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'payment_method' })
  method: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    name: 'transaction_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  transactionId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
