import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Address } from '../addresses/address.entity';
import type { RequestUser } from '../auth/jwt.strategy';
import { Cart } from '../carts/cart.entity';
import { CartItem } from '../carts/cart-item.entity';
import {
  buildPaginated,
  getPaginationOptions,
  Paginated,
} from '../common/pagination';
import { Inventory } from '../inventory/inventory.entity';
import { UserRole } from '../users/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListDeliveriesDto } from './dto/list-deliveries.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { SalesReportDto } from './dto/sales-report.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderItem } from './order-item.entity';
import { Order, OrderStatus } from './order.entity';
import { Payment, PaymentMethod, PaymentStatus } from './payment.entity';
import { PaymentsService } from './payments.service';

/** Tarifa de envío plana (0 por ahora; el front puede mostrarla como "envío gratis"). */
const DELIVERY_FEE = 0;

/**
 * Transiciones válidas del ciclo de vida de un pedido.
 * CANCELLED y DELIVERED son estados terminales.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.PAID,
    OrderStatus.PREPARING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAID]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.OUT_FOR_DELIVERY],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export interface OrderItemResponse {
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderPaymentResponse {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId: string | null;
  amount: number;
}

export interface DeliveriesSummary {
  totalDelivered: number;
  totalAmount: number;
  todayDelivered: number;
  todayAmount: number;
}

/** Fila cruda del COUNT + SUM (los valores llegan como string). */
interface DeliveriesSummaryRow {
  totalDelivered: string;
  totalAmount: string;
}

/** Filas crudas del reporte de ventas. */
interface SalesSummaryRow {
  totalOrders: string;
  totalAmount: string;
}

interface SalesByDayRow {
  date: string;
  orders: string;
  amount: string;
}

interface SalesByPaymentRow {
  method: string;
  orders: string;
  amount: string;
}

interface SalesTopProductRow {
  productId: string | null;
  productName: string;
  quantity: string;
  amount: string;
}

export interface DeliveriesReport extends Paginated<OrderResponse> {
  summary: DeliveriesSummary;
}

export interface SalesReport {
  /** Rango efectivo del reporte (sin filtros → null) */
  range: { from: string | null; to: string | null };
  summary: {
    totalOrders: number;
    totalAmount: number;
    averageTicket: number;
  };
  /** Ventas agrupadas por día (más reciente primero) */
  byDay: { date: string; orders: number; amount: number }[];
  /** Productos más vendidos por monto (top N) */
  topProducts: {
    productId: string | null;
    productName: string;
    quantity: number;
    amount: number;
  }[];
  /** Desglose por método de pago */
  byPaymentMethod: { method: PaymentMethod; orders: number; amount: number }[];
}

export interface OrderShippingAddress {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  deliveryNotes: string | null;
}

export interface OrderResponse {
  id: string;
  orderNumber: number;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  /** Repartidor que confirmó la entrega (null hasta DELIVERED) */
  deliveredBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliverySlotStart: string | null;
  deliverySlotEnd: string | null;
  /** Snapshot inmutable de la dirección al momento de la compra */
  shippingAddress: OrderShippingAddress | null;
  items: OrderItemResponse[];
  payment: OrderPaymentResponse | null;
  createdAt: Date;
  updatedAt: Date;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Cart)
    private readonly cartsRepository: Repository<Cart>,
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Checkout: convierte el carrito del usuario en un pedido.
   * - Valida el stock real en este momento (no al agregar al carrito)
   * - Congela precios/nombres en order_items (historial inmutable)
   * - Descuenta inventario de forma atómica
   * - Crea el pago (simulado) y vacía el carrito
   */
  async createCheckout(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    const cart = await this.cartsRepository.findOne({
      where: { userId },
      relations: { items: { product: { inventory: true } } },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }
    const cartItems = cart.items;

    // Validación previa de productos, disponibilidad y stock
    const lines: {
      productId: string;
      productName: string;
      unitPrice: number;
      quantity: number;
    }[] = [];

    for (const item of cartItems) {
      const product = item.product;
      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }
      if (!product.isActive) {
        throw new BadRequestException(
          `El producto "${product.name}" no está disponible`,
        );
      }
      const quantity = Number(item.quantity);
      const stock = product.inventory
        ? Number(product.inventory.stockQuantity)
        : 0;
      if (quantity > stock) {
        throw new BadRequestException(
          `Stock insuficiente para "${product.name}" (disponible: ${stock})`,
        );
      }
      const unitPrice =
        product.salePrice !== null
          ? Number(product.salePrice)
          : Number(product.price);
      lines.push({
        productId: product.id,
        productName: product.name,
        unitPrice,
        quantity,
      });
    }

    // Dirección de envío (debe pertenecer al usuario). Se congela como
    // snapshot en el pedido: ya no se puede cambiar una vez confirmado.
    let shippingAddress: OrderShippingAddress | null = null;
    if (dto.addressId) {
      const address = await this.addressesRepository.findOne({
        where: { id: dto.addressId, userId },
      });
      if (!address) {
        throw new BadRequestException('Dirección de envío no encontrada');
      }
      shippingAddress = {
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        stateProvince: address.stateProvince,
        postalCode: address.postalCode,
        deliveryNotes: address.deliveryNotes,
      };
    }

    if (
      dto.deliverySlotStart &&
      dto.deliverySlotEnd &&
      new Date(dto.deliverySlotEnd) <= new Date(dto.deliverySlotStart)
    ) {
      throw new BadRequestException(
        'deliverySlotEnd debe ser posterior a deliverySlotStart',
      );
    }

    const subtotal = round(
      lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0),
      2,
    );
    const total = round(subtotal + DELIVERY_FEE, 2);

    const isCard =
      dto.paymentMethod === PaymentMethod.CREDIT_CARD ||
      dto.paymentMethod === PaymentMethod.DEBIT_CARD;

    const orderId = await this.dataSource.transaction(async (manager) => {
      const ordersRepository = manager.getRepository(Order);
      const orderItemsRepository = manager.getRepository(OrderItem);
      const inventoryRepository = manager.getRepository(Inventory);
      const paymentsRepository = manager.getRepository(Payment);
      const cartItemsRepository = manager.getRepository(CartItem);

      // El carrito se consume al inicio de la transacción: si otra petición
      // concurrente ya lo vació (affected === 0), abortamos el checkout
      // (TOCTOU) y el rollback deja todo intacto.
      const consumed = await cartItemsRepository.delete({ cartId: cart.id });
      if (consumed.affected === 0) {
        throw new BadRequestException(
          'El carrito ya fue procesado por otro checkout',
        );
      }

      const order = await ordersRepository.save(
        ordersRepository.create({
          userId,
          addressId: dto.addressId ?? null,
          shippingAddressLine1: shippingAddress?.addressLine1 ?? null,
          shippingAddressLine2: shippingAddress?.addressLine2 ?? null,
          shippingCity: shippingAddress?.city ?? null,
          shippingStateProvince: shippingAddress?.stateProvince ?? null,
          shippingPostalCode: shippingAddress?.postalCode ?? null,
          shippingDeliveryNotes: shippingAddress?.deliveryNotes ?? null,
          status: isCard ? OrderStatus.PAID : OrderStatus.PENDING,
          subtotal: subtotal.toString(),
          deliveryFee: DELIVERY_FEE.toString(),
          total: total.toString(),
          deliverySlotStart: dto.deliverySlotStart
            ? new Date(dto.deliverySlotStart)
            : null,
          deliverySlotEnd: dto.deliverySlotEnd
            ? new Date(dto.deliverySlotEnd)
            : null,
        }),
      );

      // Snapshot de los items con los precios del momento de la compra
      await orderItemsRepository.save(
        lines.map((l) =>
          orderItemsRepository.create({
            orderId: order.id,
            productId: l.productId,
            productName: l.productName,
            unitPrice: l.unitPrice.toString(),
            quantity: l.quantity.toString(),
            subtotal: round(l.unitPrice * l.quantity, 2).toString(),
          }),
        ),
      );

      // Descuento de stock atómico (evita sobrevender ante peticiones concurrentes)
      for (const l of lines) {
        const result = await inventoryRepository
          .createQueryBuilder()
          .update()
          .set({ stockQuantity: () => 'stock_quantity - :qty' })
          .where('product_id = :productId AND stock_quantity >= :qty', {
            productId: l.productId,
            qty: l.quantity,
          })
          .execute();
        if (result.affected === 0) {
          throw new BadRequestException(
            `Stock insuficiente para "${l.productName}"`,
          );
        }
      }

      // Pago simulado (tarjetas → COMPLETED al instante)
      await this.paymentsService.create(
        paymentsRepository,
        order.id,
        dto.paymentMethod,
        total,
      );

      return order.id;
    });

    return this.findOne(orderId, {
      id: userId,
      email: '',
      role: UserRole.CUSTOMER,
    });
  }

  /** Mis pedidos (paginado, opcionalmente por estado). */
  async findMyOrders(
    userId: string,
    query: ListOrdersDto,
  ): Promise<Paginated<OrderResponse>> {
    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.deliveredBy', 'deliveredBy')
      .where('order.user_id = :userId', { userId });

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    const [rows, total] = await qb
      .orderBy('order.created_at', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginated(
      rows.map((o) => this.toResponse(o)),
      total,
      page,
      limit,
    );
  }

  /** Todos los pedidos (ADMIN / DELIVERY), con filtros. */
  async findAll(query: ListOrdersDto): Promise<Paginated<OrderResponse>> {
    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.deliveredBy', 'deliveredBy');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    const [rows, total] = await qb
      .orderBy('order.created_at', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return buildPaginated(
      rows.map((o) => this.toResponse(o)),
      total,
      page,
      limit,
    );
  }

  /**
   * Reporte de entregas por repartidor.
   * - DELIVERY: solo ve sus propias entregas
   * - ADMIN: puede filtrar por cualquier repartidor (query.userId)
   * Incluye resumen agregado: total entregado, monto cobrado y entregas de hoy.
   */
  async findDeliveries(
    user: RequestUser,
    query: ListDeliveriesDto,
  ): Promise<DeliveriesReport> {
    const isAdmin = user.role === UserRole.ADMIN;
    const deliveredByUserId = isAdmin && query.userId ? query.userId : user.id;

    const { skip, take, page, limit } = getPaginationOptions(
      query.page,
      query.limit,
    );

    const base = this.ordersRepository
      .createQueryBuilder('order')
      .where('order.delivered_by_user_id = :deliveredByUserId', {
        deliveredByUserId,
      })
      .andWhere('order.status = :status', { status: OrderStatus.DELIVERED });

    if (query.from) {
      base.andWhere('order.updated_at >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      base.andWhere('order.updated_at <= :to', {
        to: new Date(query.to),
      });
    }

    const [rows, total] = await base
      .clone()
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.deliveredBy', 'deliveredBy')
      .orderBy('order.updated_at', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    // Resumen agregado con SQL (COUNT + SUM) sobre todas las entregas del
    // rango, no solo la página: evita cargar las filas en memoria.
    // Nota: el límite de "hoy" usa la zona horaria del servidor.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [rangeSummary, todaySummary] = await Promise.all([
      this.deliveriesSummaryQuery(
        base.clone(),
      ).getRawOne<DeliveriesSummaryRow>(),
      this.deliveriesSummaryQuery(
        base.clone().andWhere('order.updated_at >= :startOfToday', {
          startOfToday,
        }),
      ).getRawOne<DeliveriesSummaryRow>(),
    ]);

    return {
      data: rows.map((o) => this.toResponse(o)),
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      summary: {
        totalDelivered: Number(rangeSummary?.totalDelivered ?? 0),
        totalAmount: Number(rangeSummary?.totalAmount ?? 0),
        todayDelivered: Number(todaySummary?.totalDelivered ?? 0),
        todayAmount: Number(todaySummary?.totalAmount ?? 0),
      },
    };
  }

  /** Query agregada de COUNT + SUM para el reporte de entregas. */
  private deliveriesSummaryQuery(
    qb: SelectQueryBuilder<Order>,
  ): SelectQueryBuilder<Order> {
    return qb
      .select('COUNT(*)', 'totalDelivered')
      .addSelect('COALESCE(SUM(order.total), 0)', 'totalAmount');
  }

  /**
   * Reporte de ventas (solo ADMIN). Cuenta como venta todo pedido pagado o
   * en proceso (PAID, PREPARING, OUT_FOR_DELIVERY, DELIVERED); quedan fuera
   * PENDING (pago sin confirmar) y CANCELLED.
   */
  async getSalesReport(query: SalesReportDto): Promise<SalesReport> {
    const paidStatuses = [
      OrderStatus.PAID,
      OrderStatus.PREPARING,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
    const topLimit = query.topLimit ?? 10;

    // Base con estado + rango de fechas (si se envió)
    const base = (): SelectQueryBuilder<Order> => {
      const qb = this.ordersRepository
        .createQueryBuilder('order')
        .where('order.status IN (:...statuses)', { statuses: paidStatuses });
      if (query.from) {
        qb.andWhere('order.created_at >= :from', {
          from: new Date(query.from),
        });
      }
      if (query.to) {
        qb.andWhere('order.created_at <= :to', { to: new Date(query.to) });
      }
      return qb;
    };

    // 1) Resumen general
    const [summaryRow, dayRows, paymentRows] = await Promise.all([
      base()
        .select('COUNT(*)', 'totalOrders')
        .addSelect('COALESCE(SUM(order.total), 0)', 'totalAmount')
        .getRawOne<SalesSummaryRow>(),

      // 2) Ventas por día (fecha local en el servidor)
      base()
        .select(`TO_CHAR(order.created_at, 'YYYY-MM-DD')`, 'date')
        .addSelect('COUNT(*)', 'orders')
        .addSelect('COALESCE(SUM(order.total), 0)', 'amount')
        .groupBy(`TO_CHAR(order.created_at, 'YYYY-MM-DD')`)
        .orderBy('date', 'DESC')
        .getRawMany<SalesByDayRow>(),

      // 3) Desglose por método de pago
      base()
        .innerJoin('order.payment', 'payment')
        .select('payment.method', 'method')
        .addSelect('COUNT(*)', 'orders')
        .addSelect('COALESCE(SUM(order.total), 0)', 'amount')
        .groupBy('payment.method')
        .getRawMany<SalesByPaymentRow>(),
    ]);

    // 4) Top productos por monto (desde el snapshot de order_items), con rango
    const topQb = this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin(OrderItem, 'item', 'item.order_id = order.id')
      .where('order.status IN (:...statuses)', { statuses: paidStatuses });
    if (query.from) {
      topQb.andWhere('order.created_at >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      topQb.andWhere('order.created_at <= :to', { to: new Date(query.to) });
    }
    const topProducts = await topQb
      .select('item.product_id', 'productId')
      .addSelect('item.product_name', 'productName')
      .addSelect('SUM(item.quantity)', 'quantity')
      .addSelect('SUM(item.subtotal)', 'amount')
      .groupBy('item.product_id')
      .addGroupBy('item.product_name')
      .orderBy('amount', 'DESC')
      .limit(topLimit)
      .getRawMany<SalesTopProductRow>();

    const totalOrders = Number(summaryRow?.totalOrders ?? 0);
    const totalAmount = Number(summaryRow?.totalAmount ?? 0);

    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      summary: {
        totalOrders,
        totalAmount,
        averageTicket: totalOrders > 0 ? totalAmount / totalOrders : 0,
      },
      byDay: (dayRows ?? []).map((r) => ({
        date: r.date,
        orders: Number(r.orders),
        amount: Number(r.amount),
      })),
      topProducts: (topProducts ?? []).map((r) => ({
        productId: r.productId,
        productName: r.productName,
        quantity: Number(r.quantity),
        amount: Number(r.amount),
      })),
      byPaymentMethod: (paymentRows ?? []).map((r) => ({
        method: r.method as PaymentMethod,
        orders: Number(r.orders),
        amount: Number(r.amount),
      })),
    };
  }

  /** Detalle de un pedido (dueño, ADMIN o DELIVERY). */
  async findOne(id: string, user: RequestUser): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: { items: true, payment: true, user: true, deliveredBy: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    this.ensureCanView(order, user);
    return this.toResponse(order);
  }

  /**
   * Endpoint único para el repartidor: confirma la entrega del pedido.
   * - Solo ADMIN o DELIVERY
   * - Solo desde OUT_FOR_DELIVERY
   * - Registra quién entregó (deliveredBy) y cobra los pagos contra entrega
   */
  async deliver(id: string, user: RequestUser): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: { payment: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isDelivery = user.role === UserRole.DELIVERY;
    if (!isAdmin && !isDelivery) {
      throw new ForbiddenException(
        'Solo ADMIN o DELIVERY pueden confirmar la entrega',
      );
    }
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException(
        `Solo se puede entregar un pedido en ruta (estado actual: ${order.status})`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const ordersRepository = manager.getRepository(Order);
      const paymentsRepository = manager.getRepository(Payment);

      // Condición con el estado actual: evita doble confirmación concurrente
      const result = await ordersRepository.update(
        { id: order.id, status: OrderStatus.OUT_FOR_DELIVERY },
        {
          status: OrderStatus.DELIVERED,
          deliveredByUserId: user.id,
        },
      );
      if (result.affected === 0) {
        throw new BadRequestException(
          'El pedido ya fue entregado por otra petición',
        );
      }

      // Pago contra entrega → se cobra al entregar
      if (order.payment?.method === PaymentMethod.CASH_ON_DELIVERY) {
        await this.paymentsService.complete(paymentsRepository, order.id);
      }
    });

    return this.findOne(id, user);
  }

  /**
   * Cambia el estado del pedido con validación de transición y de rol:
   * - CUSTOMER (dueño): solo cancelar su propio pedido (PENDING/PAID)
   * - ADMIN: cualquier transición válida
   * - DELIVERY: preparar → en ruta → entregado
   */
  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    user: RequestUser,
  ): Promise<OrderResponse> {
    const order = await this.ordersRepository.findOne({
      where: { id },
      relations: { items: true, payment: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    const target = dto.status;
    this.assertTransitionAllowed(order, target, user);

    await this.dataSource.transaction(async (manager) => {
      const ordersRepository = manager.getRepository(Order);
      const paymentsRepository = manager.getRepository(Payment);
      const inventoryRepository = manager.getRepository(Inventory);

      // Condición con el estado actual: ante dos peticiones concurrentes,
      // la segunda no actualiza ninguna fila y falla.
      // Al marcar DELIVERED se registra quién confirmó la entrega.
      const result = await ordersRepository.update(
        { id: order.id, status: order.status },
        target === OrderStatus.DELIVERED
          ? { status: target, deliveredByUserId: user.id }
          : { status: target },
      );
      if (result.affected === 0) {
        throw new BadRequestException(
          `No se puede pasar de ${order.status} a ${target}`,
        );
      }

      if (target === OrderStatus.PAID) {
        // ADMIN confirma la transferencia → pago COMPLETED
        await this.paymentsService.complete(paymentsRepository, order.id);
      }

      if (
        target === OrderStatus.DELIVERED &&
        order.payment?.method === PaymentMethod.CASH_ON_DELIVERY
      ) {
        // Solo el cobro contra entrega se completa al entregar
        await this.paymentsService.complete(paymentsRepository, order.id);
      }

      if (target === OrderStatus.CANCELLED) {
        // Reembolso si ya se cobró; fallido si estaba pendiente
        await this.paymentsService.cancel(paymentsRepository, order.id);
        // Devuelve el stock al inventario
        for (const item of order.items) {
          if (!item.productId) continue;
          await inventoryRepository
            .createQueryBuilder()
            .update()
            .set({ stockQuantity: () => 'stock_quantity + :qty' })
            .where('product_id = :productId', {
              productId: item.productId,
              qty: Number(item.quantity),
            })
            .execute();
        }
      }
    });

    return this.findOne(id, user);
  }

  private assertTransitionAllowed(
    order: Order,
    target: OrderStatus,
    user: RequestUser,
  ): void {
    if (target === order.status) {
      throw new BadRequestException('El pedido ya está en ese estado');
    }

    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `No se puede pasar de ${order.status} a ${target}`,
      );
    }

    const isAdmin = user.role === UserRole.ADMIN;
    const isDelivery = user.role === UserRole.DELIVERY;
    const isOwner = order.userId === user.id;

    if (target === OrderStatus.CANCELLED) {
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException(
          'No tienes permisos para cancelar este pedido',
        );
      }
      return;
    }

    if (target === OrderStatus.PAID || target === OrderStatus.PREPARING) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Solo un ADMIN puede hacer esta transición',
        );
      }
      return;
    }

    // OUT_FOR_DELIVERY / DELIVERED
    if (!isAdmin && !isDelivery) {
      throw new ForbiddenException(
        'Solo ADMIN o DELIVERY pueden hacer esta transición',
      );
    }
  }

  private ensureCanView(order: Order, user: RequestUser): void {
    const isAdmin = user.role === UserRole.ADMIN;
    const isDelivery = user.role === UserRole.DELIVERY;
    const isOwner = order.userId === user.id;
    if (!isOwner && !isAdmin && !isDelivery) {
      throw new ForbiddenException('No tienes permisos para ver este pedido');
    }
  }

  private toResponse(order: Order): OrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      user: order.user
        ? {
            id: order.user.id,
            email: order.user.email,
            firstName: order.user.firstName,
            lastName: order.user.lastName,
          }
        : null,
      deliveredBy: order.deliveredBy
        ? {
            id: order.deliveredBy.id,
            email: order.deliveredBy.email,
            firstName: order.deliveredBy.firstName,
            lastName: order.deliveredBy.lastName,
          }
        : null,
      status: order.status,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      deliverySlotStart: order.deliverySlotStart
        ? order.deliverySlotStart.toISOString()
        : null,
      deliverySlotEnd: order.deliverySlotEnd
        ? order.deliverySlotEnd.toISOString()
        : null,
      shippingAddress: order.shippingAddressLine1
        ? {
            addressLine1: order.shippingAddressLine1,
            addressLine2: order.shippingAddressLine2,
            city: order.shippingCity as string,
            stateProvince: order.shippingStateProvince,
            postalCode: order.shippingPostalCode,
            deliveryNotes: order.shippingDeliveryNotes,
          }
        : null,
      items: (order.items ?? []).map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPrice: Number(item.unitPrice),
        quantity: Number(item.quantity),
        subtotal: Number(item.subtotal),
      })),
      payment: order.payment
        ? {
            id: order.payment.id,
            method: order.payment.method,
            status: order.payment.status,
            transactionId: order.payment.transactionId,
            amount: Number(order.payment.amount),
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
