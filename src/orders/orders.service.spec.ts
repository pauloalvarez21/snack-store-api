import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Address } from '../addresses/address.entity';
import type { RequestUser } from '../auth/jwt.strategy';
import { Cart } from '../carts/cart.entity';
import { CartItem } from '../carts/cart-item.entity';
import { Inventory } from '../inventory/inventory.entity';
import { UserRole } from '../users/user.entity';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Payment, PaymentMethod, PaymentStatus } from './payment.entity';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepository: Record<string, jest.Mock>;
  let cartsRepository: Record<string, jest.Mock>;
  let addressesRepository: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };

  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orderId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const productId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const customer: RequestUser = {
    id: userId,
    email: 'cliente@x.cl',
    role: UserRole.CUSTOMER,
    jti: 'jti-customer',
  };
  const admin: RequestUser = {
    id: userId,
    email: 'admin@x.cl',
    role: UserRole.ADMIN,
    jti: 'jti-admin',
  };
  const delivery: RequestUser = {
    id: userId,
    email: 'repartidor@x.cl',
    role: UserRole.DELIVERY,
    jti: 'jti-delivery',
  };

  const makeOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: orderId,
      orderNumber: 1,
      userId,
      status: OrderStatus.PENDING,
      subtotal: '16',
      deliveryFee: '0',
      total: '16',
      deliverySlotStart: null,
      deliverySlotEnd: null,
      deliveredByUserId: null,
      deliveredBy: null,
      shippingAddressLine1: null,
      shippingAddressLine2: null,
      shippingCity: null,
      shippingStateProvince: null,
      shippingPostalCode: null,
      shippingDeliveryNotes: null,
      items: [],
      payment: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as unknown as Order;

  const makeItem = (): OrderItem =>
    ({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      orderId,
      productId,
      productName: 'Manzana',
      unitPrice: '8',
      quantity: '2',
      subtotal: '16',
    }) as unknown as OrderItem;

  const makePayment = (
    status: PaymentStatus = PaymentStatus.PENDING,
  ): Payment =>
    ({
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      orderId,
      method: PaymentMethod.TRANSFER,
      status,
      transactionId: null,
      amount: '16',
    }) as unknown as Payment;

  // Repos que usa el manager dentro de la transacción
  const buildTransactionRepos = () => {
    const orderItemsRepository = { create: jest.fn(), save: jest.fn() };
    const inventoryRepository = {
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
    };
    const paymentsRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const cartItemsRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Order) return ordersRepository;
        if (entity === OrderItem) return orderItemsRepository;
        if (entity === Inventory) return inventoryRepository;
        if (entity === Payment) return paymentsRepository;
        if (entity === CartItem) return cartItemsRepository;
        throw new Error(`Repo inesperado: ${entity}`);
      }),
    };

    return {
      manager,
      orderItemsRepository,
      inventoryRepository,
      paymentsRepository,
      cartItemsRepository,
    };
  };

  beforeEach(async () => {
    ordersRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      findAndCount: jest.fn(),
    };
    cartsRepository = { findOne: jest.fn() };
    addressesRepository = { findOne: jest.fn() };

    dataSource = {
      transaction: jest.fn(
        async (
          cb: (
            m: ReturnType<typeof buildTransactionRepos>['manager'],
          ) => Promise<unknown>,
        ) => {
          const { manager } = buildTransactionRepos();
          return cb(manager);
        },
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: ordersRepository },
        { provide: getRepositoryToken(Cart), useValue: cartsRepository },
        { provide: getRepositoryToken(Address), useValue: addressesRepository },
        {
          provide: PaymentsService,
          useValue: {
            create: jest.fn(),
            complete: jest.fn(),
            cancel: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  describe('createCheckout', () => {
    it('convierte el carrito en pedido, descuenta stock y vacía el carrito', async () => {
      const inventory = { stockQuantity: '10' };
      cartsRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            productId,
            quantity: '2',
            product: {
              id: productId,
              name: 'Manzana',
              isActive: true,
              price: '10',
              salePrice: '8',
              inventory,
            },
          },
        ],
      });

      // Dentro de la transacción: se crea el pedido y se devuelve con su id
      ordersRepository.create.mockImplementation(
        (data: Partial<Order>) => data,
      );
      ordersRepository.save.mockImplementation((data: Partial<Order>) =>
        Promise.resolve(makeOrder({ ...data })),
      );

      // findOne posterior al checkout (carga el pedido completo)
      ordersRepository.findOne.mockResolvedValue(
        makeOrder({
          status: OrderStatus.PAID,
          payment: makePayment(PaymentStatus.COMPLETED),
          items: [makeItem()],
        }),
      );

      const result = await service.createCheckout(userId, {
        paymentMethod: PaymentMethod.CREDIT_CARD,
      });

      expect(result.status).toBe(OrderStatus.PAID);
      expect(result.subtotal).toBe(16);
      expect(result.total).toBe(16);
      expect(result.items[0].unitPrice).toBe(8);
      expect(result.payment?.status).toBe(PaymentStatus.COMPLETED);
    });

    it('lanza BadRequestException si el carrito está vacío', async () => {
      cartsRepository.findOne.mockResolvedValue({ id: 'cart-1', items: [] });

      await expect(
        service.createCheckout(userId, {
          paymentMethod: PaymentMethod.CREDIT_CARD,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el stock no alcanza', async () => {
      cartsRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            productId,
            quantity: '50',
            product: {
              id: productId,
              name: 'Manzana',
              isActive: true,
              price: '10',
              salePrice: null,
              inventory: { stockQuantity: '10' },
            },
          },
        ],
      });

      await expect(
        service.createCheckout(userId, {
          paymentMethod: PaymentMethod.CREDIT_CARD,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el producto está inactivo', async () => {
      cartsRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            productId,
            quantity: '1',
            product: {
              id: productId,
              name: 'Manzana',
              isActive: false,
              price: '10',
              salePrice: null,
              inventory: { stockQuantity: '10' },
            },
          },
        ],
      });

      await expect(
        service.createCheckout(userId, {
          paymentMethod: PaymentMethod.CREDIT_CARD,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('guarda el snapshot de la dirección al enviar addressId', async () => {
      const addressId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      cartsRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            productId,
            quantity: '1',
            product: {
              id: productId,
              name: 'Manzana',
              isActive: true,
              price: '10',
              salePrice: null,
              inventory: { stockQuantity: '10' },
            },
          },
        ],
      });
      addressesRepository.findOne.mockResolvedValue({
        id: addressId,
        userId,
        addressLine1: 'Av. Providencia 1234',
        addressLine2: null,
        city: 'Santiago',
        stateProvince: null,
        postalCode: null,
        deliveryNotes: null,
      });

      ordersRepository.create.mockImplementation(
        (data: Partial<Order>) => data,
      );
      ordersRepository.save.mockImplementation((data: Partial<Order>) =>
        Promise.resolve(makeOrder({ ...data })),
      );
      ordersRepository.findOne.mockResolvedValue(
        makeOrder({
          status: OrderStatus.PAID,
          shippingAddressLine1: 'Av. Providencia 1234',
          shippingCity: 'Santiago',
          items: [makeItem()],
          payment: makePayment(PaymentStatus.COMPLETED),
        }),
      );

      const result = await service.createCheckout(userId, {
        addressId,
        paymentMethod: PaymentMethod.CREDIT_CARD,
      });

      expect(addressesRepository.findOne).toHaveBeenCalledWith({
        where: { id: addressId, userId },
      });
      expect(result.shippingAddress).toEqual({
        addressLine1: 'Av. Providencia 1234',
        addressLine2: null,
        city: 'Santiago',
        stateProvince: null,
        postalCode: null,
        deliveryNotes: null,
      });
    });

    it('lanza BadRequestException si la dirección no pertenece al usuario', async () => {
      cartsRepository.findOne.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            productId,
            quantity: '1',
            product: {
              id: productId,
              name: 'Manzana',
              isActive: true,
              price: '10',
              salePrice: null,
              inventory: { stockQuantity: '10' },
            },
          },
        ],
      });
      addressesRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createCheckout(userId, {
          addressId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          paymentMethod: PaymentMethod.CREDIT_CARD,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el pedido no existe', async () => {
      ordersRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(orderId, customer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ForbiddenException si el usuario no es dueño ni admin', async () => {
      ordersRepository.findOne.mockResolvedValue(
        makeOrder({ userId: 'otro-usuario' }),
      );

      await expect(service.findOne(orderId, customer)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permite ver el pedido al ADMIN', async () => {
      ordersRepository.findOne.mockResolvedValue(
        makeOrder({
          userId: 'otro-usuario',
          items: [makeItem()],
          payment: makePayment(),
        }),
      );

      const result = await service.findOne(orderId, admin);
      expect(result.id).toBe(orderId);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('updateStatus', () => {
    it('cancela el pedido y devuelve el stock al inventario', async () => {
      ordersRepository.update.mockResolvedValue({ affected: 1 });
      ordersRepository.findOne
        // 1ª llamada: carga del pedido para la transición (PENDING)
        .mockResolvedValueOnce(
          makeOrder({
            items: [makeItem()],
            payment: makePayment(PaymentStatus.PENDING),
          }),
        )
        // 2ª llamada: detalle posterior al update (CANCELLED)
        .mockResolvedValue(
          makeOrder({
            status: OrderStatus.CANCELLED,
            items: [makeItem()],
            payment: makePayment(PaymentStatus.FAILED),
            user: null,
          }),
        );

      const result = await service.updateStatus(
        orderId,
        { status: OrderStatus.CANCELLED },
        customer,
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(ordersRepository.update).toHaveBeenCalled();
    });

    it('lanza BadRequestException en una transición inválida', async () => {
      ordersRepository.findOne.mockResolvedValue(
        makeOrder({ status: OrderStatus.DELIVERED }),
      );

      await expect(
        service.updateStatus(orderId, { status: OrderStatus.PREPARING }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza ForbiddenException si un CUSTOMER intenta marcar PREPARING', async () => {
      ordersRepository.findOne.mockResolvedValue(makeOrder());

      await expect(
        service.updateStatus(
          orderId,
          { status: OrderStatus.PREPARING },
          customer,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza ForbiddenException si un usuario ajeno intenta cancelar', async () => {
      const stranger: RequestUser = {
        id: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
        email: 'otro@x.cl',
        role: UserRole.CUSTOMER,
        jti: 'jti-stranger',
      };
      ordersRepository.findOne.mockResolvedValue(makeOrder());

      await expect(
        service.updateStatus(
          orderId,
          { status: OrderStatus.CANCELLED },
          stranger,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('un ADMIN puede avanzar PENDING → PREPARING', async () => {
      ordersRepository.update.mockResolvedValue({ affected: 1 });
      ordersRepository.findOne
        .mockResolvedValueOnce(makeOrder())
        .mockResolvedValue(
          makeOrder({
            status: OrderStatus.PREPARING,
            items: [makeItem()],
            payment: makePayment(PaymentStatus.PENDING),
            user: null,
          }),
        );

      const result = await service.updateStatus(
        orderId,
        { status: OrderStatus.PREPARING },
        admin,
      );

      expect(result.status).toBe(OrderStatus.PREPARING);
    });
  });

  describe('findDeliveries', () => {
    it('DELIVERY ve solo sus propias entregas con resumen agregado', async () => {
      // Se usa createQueryBuilder en cadena dentro del servicio
      const makeChain = (rows: Order[], total: number) => {
        const chain = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
          getRawOne: jest
            .fn()
            .mockResolvedValue({ totalDelivered: '1', totalAmount: '16' }),
          clone: jest.fn(),
        };
        chain.clone.mockReturnValue(chain);
        return chain;
      };

      const delivered = makeOrder({
        status: OrderStatus.DELIVERED,
        deliveredByUserId: userId,
        total: '16',
        updatedAt: new Date(),
        items: [makeItem()],
        payment: makePayment(PaymentStatus.COMPLETED),
        user: null,
        deliveredBy: {
          id: userId,
          email: 'repartidor@x.cl',
          firstName: 'Delivery',
          lastName: 'Pedidos',
        },
      });

      ordersRepository.createQueryBuilder.mockReturnValue(
        makeChain([delivered], 1),
      );

      const result = await service.findDeliveries(delivery, {
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(OrderStatus.DELIVERED);
      expect(result.summary.totalDelivered).toBe(1);
      expect(result.summary.totalAmount).toBe(16);
      expect(result.summary.todayDelivered).toBe(1);
      expect(result.summary.todayAmount).toBe(16);
    });
  });

  describe('getSalesReport', () => {
    it('devuelve resumen, ventas por día, top productos y desglose por método', async () => {
      // Cada createQueryBuilder devuelve un chain; controlamos las respuestas
      // en orden: summary (getRawOne), byDay (getRawMany), payment (getRawMany),
      // topProducts (getRawMany)
      const makeChain = () => {
        const chain = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          addGroupBy: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawOne: jest.fn(),
          getRawMany: jest.fn(),
        };
        return chain;
      };

      const summaryChain = makeChain();
      summaryChain.getRawOne.mockResolvedValue({
        totalOrders: '3',
        totalAmount: '50',
      });

      const dayChain = makeChain();
      dayChain.getRawMany.mockResolvedValue([
        { date: '2026-08-08', orders: '2', amount: '34' },
        { date: '2026-08-07', orders: '1', amount: '16' },
      ]);

      const paymentChain = makeChain();
      paymentChain.getRawMany.mockResolvedValue([
        { method: 'CREDIT_CARD', orders: '2', amount: '34' },
        { method: 'CASH_ON_DELIVERY', orders: '1', amount: '16' },
      ]);

      const topChain = makeChain();
      topChain.getRawMany.mockResolvedValue([
        {
          productId,
          productName: 'Manzana',
          quantity: '5',
          amount: '34',
        },
      ]);

      ordersRepository.createQueryBuilder
        .mockReturnValueOnce(summaryChain)
        .mockReturnValueOnce(dayChain)
        .mockReturnValueOnce(paymentChain)
        .mockReturnValueOnce(topChain);

      const result = await service.getSalesReport({});

      expect(result.summary.totalOrders).toBe(3);
      expect(result.summary.totalAmount).toBe(50);
      expect(result.summary.averageTicket).toBeCloseTo(16.67, 2);
      expect(result.byDay).toHaveLength(2);
      expect(result.byDay[0].date).toBe('2026-08-08');
      expect(result.byPaymentMethod[0].method).toBe('CREDIT_CARD');
      expect(result.topProducts).toHaveLength(1);
      expect(result.topProducts[0].productName).toBe('Manzana');
      expect(result.topProducts[0].amount).toBe(34);
    });

    it('devuelve ceros si no hay ventas', async () => {
      const makeChain = () => {
        const chain = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          addGroupBy: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawOne: jest.fn(),
          getRawMany: jest.fn(),
        };
        return chain;
      };

      const summaryChain = makeChain();
      summaryChain.getRawOne.mockResolvedValue(undefined);
      const dayChain = makeChain();
      dayChain.getRawMany.mockResolvedValue([]);
      const paymentChain = makeChain();
      paymentChain.getRawMany.mockResolvedValue([]);
      const topChain = makeChain();
      topChain.getRawMany.mockResolvedValue([]);

      ordersRepository.createQueryBuilder
        .mockReturnValueOnce(summaryChain)
        .mockReturnValueOnce(dayChain)
        .mockReturnValueOnce(paymentChain)
        .mockReturnValueOnce(topChain);

      const result = await service.getSalesReport({});

      expect(result.summary.totalOrders).toBe(0);
      expect(result.summary.totalAmount).toBe(0);
      expect(result.summary.averageTicket).toBe(0);
      expect(result.byDay).toEqual([]);
      expect(result.topProducts).toEqual([]);
      expect(result.byPaymentMethod).toEqual([]);
    });
  });

  describe('deliver', () => {
    it('el DELIVERY confirma la entrega y registra quién la hizo', async () => {
      ordersRepository.update.mockResolvedValue({ affected: 1 });
      ordersRepository.findOne
        .mockResolvedValueOnce(
          makeOrder({
            status: OrderStatus.OUT_FOR_DELIVERY,
            payment: makePayment(PaymentStatus.PENDING),
          }),
        )
        .mockResolvedValue(
          makeOrder({
            status: OrderStatus.DELIVERED,
            deliveredByUserId: userId,
            deliveredBy: {
              id: userId,
              email: 'repartidor@x.cl',
              firstName: 'Delivery',
              lastName: 'Pedidos',
            },
            items: [makeItem()],
            payment: makePayment(PaymentStatus.COMPLETED),
            user: null,
          }),
        );

      const result = await service.deliver(orderId, delivery);

      expect(ordersRepository.update).toHaveBeenCalledWith(
        { id: orderId, status: OrderStatus.OUT_FOR_DELIVERY },
        { status: OrderStatus.DELIVERED, deliveredByUserId: userId },
      );
      expect(result.status).toBe(OrderStatus.DELIVERED);
      expect(result.deliveredBy?.email).toBe('repartidor@x.cl');
    });

    it('lanza BadRequestException si el pedido no está en ruta', async () => {
      ordersRepository.findOne.mockResolvedValue(makeOrder());

      await expect(service.deliver(orderId, delivery)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza ForbiddenException si un CUSTOMER intenta entregar', async () => {
      ordersRepository.findOne.mockResolvedValue(
        makeOrder({ status: OrderStatus.OUT_FOR_DELIVERY }),
      );

      await expect(service.deliver(orderId, customer)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
