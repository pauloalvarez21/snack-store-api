import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressesModule } from './addresses/addresses.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CartsModule } from './carts/carts.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomThrottlerGuard } from './common/custom-throttler.guard';
import { SlowQueryLogger } from './common/slow-query.logger';
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
    // Rate limiting global: 100 peticiones/minuto por IP (los endpoints
    // sensibles como login/register tienen límites más estrictos con @Throttle)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
        // Los tests e2e levantan la app completa: se desactiva el rate
        // limiting cuando NODE_ENV=test (fijado en test/setup-e2e.js)
        skipIf: () => process.env.NODE_ENV === 'test',
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // El esquema de la base lo gestiona schema.sql: TypeORM nunca debe alterarlo
        synchronize: false,
        // Loguea queries lentas (>200ms) usando nuestro logger personalizado
        maxQueryExecutionTime: 200,
        logging: ['query', 'error'],
        logger: new SlowQueryLogger(),
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
  providers: [
    AppService,
    // Guard global de rate limiting: se ejecuta antes que los guards de cada ruta
    // Usa CustomThrottlerGuard que genera keys IP+userId para rate limiting por usuario
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
