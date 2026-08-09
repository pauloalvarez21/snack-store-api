import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { RequestUser } from '../auth/jwt.strategy';
import type { Paginated } from '../common/pagination';
import { UserRole } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListDeliveriesDto } from './dto/list-deliveries.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import type { DeliveriesReport, OrderResponse } from './orders.service';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un pedido a partir del carrito (checkout)',
    description:
      'Valida stock, congela precios, descuenta inventario y crea el pago simulado. Las tarjetas se cobran al instante (order → PAID); transferencia y contra entrega quedan PENDING.',
  })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    return this.ordersService.createCheckout(user.id, dto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Mis pedidos (paginado, opcionalmente por estado)',
  })
  findMy(
    @CurrentUser() user: RequestUser,
    @Query() query: ListOrdersDto,
  ): Promise<Paginated<OrderResponse>> {
    return this.ordersService.findMyOrders(user.id, query);
  }

  @Get('deliveries/me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DELIVERY)
  @ApiOperation({
    summary: 'Reporte de mis entregas (repartidor) con resumen agregado',
    description:
      'Historial paginado de los pedidos que el repartidor autenticado entregó, con resumen: total entregado, monto cobrado y entregas de hoy. Filtros: page, limit, from, to.',
  })
  findMyDeliveries(
    @CurrentUser() user: RequestUser,
    @Query() query: ListDeliveriesDto,
  ): Promise<DeliveriesReport> {
    return this.ordersService.findDeliveries(user, query);
  }

  @Get('deliveries')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reporte de entregas de cualquier repartidor (solo ADMIN)',
    description:
      'Igual que /deliveries/me pero permite filtrar por repartidor con ?userId=. Sin userId usa el repartidor autenticado.',
  })
  findAllDeliveries(
    @CurrentUser() user: RequestUser,
    @Query() query: ListDeliveriesDto,
  ): Promise<DeliveriesReport> {
    return this.ordersService.findDeliveries(user, query);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DELIVERY)
  @ApiOperation({ summary: 'Listar todos los pedidos (solo ADMIN/DELIVERY)' })
  findAll(@Query() query: ListOrdersDto): Promise<Paginated<OrderResponse>> {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un pedido (dueño, ADMIN o DELIVERY)',
  })
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.ordersService.findOne(id, user);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar la entrega de un pedido (solo ADMIN/DELIVERY)',
    description:
      'Endpoint único del repartidor: pasa el pedido de OUT_FOR_DELIVERY a DELIVERED, registra quién lo entregó (deliveredBy) y cobra los pagos contra entrega.',
  })
  deliver(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.ordersService.deliver(id, user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Actualizar el estado de un pedido',
    description:
      'CUSTOMER (dueño) puede cancelar su pedido. ADMIN avanza el flujo (PAID, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED). DELIVERY marca PREPARING→OUT_FOR_DELIVERY→DELIVERED.',
  })
  updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponse> {
    return this.ordersService.updateStatus(id, dto, user);
  }
}
