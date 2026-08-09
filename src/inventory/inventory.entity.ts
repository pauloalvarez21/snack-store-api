import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid', unique: true })
  productId: string;

  @OneToOne(() => Product, (product) => product.inventory)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({
    name: 'stock_quantity',
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 0,
  })
  stockQuantity: string;

  @Column({
    name: 'min_stock_level',
    type: 'decimal',
    precision: 10,
    scale: 3,
    default: 5,
  })
  minStockLevel: string;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
