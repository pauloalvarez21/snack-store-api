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
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
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
import { SalesReportDto } from './dto/sales-report.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import type {
  DeliveriesReport,
  OrderResponse,
  SalesReport,
} from './orders.service';
import { OrdersService } from './orders.service';
import {
  DeliveriesReportDto,
  OrderResponseDto,
  PaginatedOrderResponseDto,
} from './dto/order-response.dto';
import { SalesReportResponseDto } from './dto/sales-report-response.dto';
import { buildSalesCsv } from './sales-csv';

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
      'Valida stock, congela precios, descuenta inventario y crea el pago simulado. Nequi/Daviplata y contra entrega quedan PENDING hasta que el ADMIN confirma el cobro (order → PAID) o se entrega el pedido.',
  })
  @ApiCreatedResponse({
    type: OrderResponseDto,
    description:
      'Pedido creado (incluye payment.walletNumber si usa Nequi/Daviplata)',
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
  @ApiOkResponse({ type: PaginatedOrderResponseDto })
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
  @ApiOkResponse({ type: DeliveriesReportDto })
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
  @ApiOkResponse({ type: DeliveriesReportDto })
  findAllDeliveries(
    @CurrentUser() user: RequestUser,
    @Query() query: ListDeliveriesDto,
  ): Promise<DeliveriesReport> {
    return this.ordersService.findDeliveries(user, query);
  }

  @Get('report/sales')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reporte de ventas (solo ADMIN)',
    description:
      'Métricas globales: resumen (pedidos, monto, ticket promedio), ventas por día, top productos, desglose por método de pago e instrucciones de pago (número de billetera del comercio). Filtros: from, to, topLimit. Cuenta ventas pagadas o en proceso (PAID → DELIVERED).',
  })
  @ApiOkResponse({
    type: SalesReportResponseDto,
    description:
      'Reporte con paymentInstructions (números de billetera del comercio)',
  })
  salesReport(@Query() query: SalesReportDto): Promise<SalesReport> {
    return this.ordersService.getSalesReport(query);
  }

  @Get('report/sales/export')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Exportar reporte de ventas a CSV (solo ADMIN)',
    description:
      'Descarga el reporte de ventas como archivo CSV (compatible con Excel) con las mismas métricas y filtros que /report/sales: resumen, ventas por día, top productos, desglose por método de pago e instrucciones de pago (números de Nequi/Daviplata para compartir con los clientes).',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Archivo CSV',
    schema: { type: 'string', format: 'binary' },
  })
  async salesReportExport(
    @Query() query: SalesReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const report = await this.ordersService.getSalesReport(query);
    const now = new Date();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte-ventas-${now
        .toISOString()
        .slice(0, 10)}.csv"`,
    );
    res.send(buildSalesCsv(report, now));
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.DELIVERY)
  @ApiOperation({ summary: 'Listar todos los pedidos (solo ADMIN/DELIVERY)' })
  @ApiOkResponse({ type: PaginatedOrderResponseDto })
  findAll(@Query() query: ListOrdersDto): Promise<Paginated<OrderResponse>> {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de un pedido (dueño, ADMIN o DELIVERY)',
  })
  @ApiOkResponse({ type: OrderResponseDto })
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
  @ApiOkResponse({ type: OrderResponseDto })
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
  @ApiOkResponse({ type: OrderResponseDto })
  updateStatus(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponse> {
    return this.ordersService.updateStatus(id, dto, user);
  }
}
