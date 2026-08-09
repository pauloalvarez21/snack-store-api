import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesModule } from './addresses/addresses.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CartsModule } from './carts/carts.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // El esquema de la base lo gestiona schema.sql: TypeORM nunca debe alterarlo
        synchronize: false,
        // Reintentos para tolerar el DNS intermitente de la red
        retryAttempts: 5,
        retryDelay: 3000,
      }),
    }),
    UsersModule,
    AuthModule,
    AddressesModule,
    CartsModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
