import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PREPARING = 'PREPARING',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // SERIAL en el esquema: PostgreSQL asigna el valor al insertar
  @Column({
    name: 'order_number',
    type: 'integer',
    generated: 'increment',
    unique: true,
  })
  orderNumber: number;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  // Quién confirmó la entrega (se registra al marcar DELIVERED)
  @Column({ name: 'delivered_by_user_id', type: 'uuid', nullable: true })
  deliveredByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'delivered_by_user_id' })
  deliveredBy: User | null;

  @Column({ name: 'address_id', type: 'uuid', nullable: true })
  addressId: string | null;

  // Snapshot de la dirección al momento de la compra (historial inmutable)
  @Column({
    name: 'shipping_address_line1',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  shippingAddressLine1: string | null;

  @Column({
    name: 'shipping_address_line2',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  shippingAddressLine2: string | null;

  @Column({
    name: 'shipping_city',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  shippingCity: string | null;

  @Column({
    name: 'shipping_state_province',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  shippingStateProvince: string | null;

  @Column({
    name: 'shipping_postal_code',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  shippingPostalCode: string | null;

  @Column({
    name: 'shipping_delivery_notes',
    type: 'text',
    nullable: true,
  })
  shippingDeliveryNotes: string | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: string;

  @Column({
    name: 'delivery_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  deliveryFee: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: string;

  @Column({ name: 'delivery_slot_start', type: 'timestamptz', nullable: true })
  deliverySlotStart: Date | null;

  @Column({ name: 'delivery_slot_end', type: 'timestamptz', nullable: true })
  deliverySlotEnd: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @OneToOne(() => Payment, (payment) => payment.order)
  payment: Payment | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
