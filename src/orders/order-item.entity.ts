import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../products/product.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  // Copia del nombre en el momento de la compra (historial si el producto cambia)
  @Column({ name: 'product_name', type: 'varchar', length: 200 })
  productName: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  quantity: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: string;
}
