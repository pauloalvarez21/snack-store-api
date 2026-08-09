import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../addresses/address.entity';
import { CartItem } from '../carts/cart-item.entity';
import { Cart } from '../carts/cart.entity';
import { Inventory } from '../inventory/inventory.entity';
import { User } from '../users/user.entity';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Payment } from './payment.entity';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Payment,
      Cart,
      CartItem,
      Inventory,
      User,
      Address,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentsService],
  exports: [OrdersService],
})
export class OrdersModule {}
