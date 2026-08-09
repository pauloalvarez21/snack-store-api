import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface OrderBody {
  id: string;
  orderNumber: number;
  userId: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: {
    productId: string | null;
    productName: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[];
  payment: {
    id: string;
    method: string;
    status: string;
    transactionId: string | null;
    amount: number;
  } | null;
  shippingAddress: {
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    stateProvince: string | null;
    postalCode: string | null;
    deliveryNotes: string | null;
  } | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  deliveredBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface DeliveriesReportBody {
  data: OrderBody[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalDelivered: number;
    totalAmount: number;
    todayDelivered: number;
    todayAmount: number;
  };
}

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const customerEmail = `e2e.order.customer.${marker}@snack.store`;
  const adminEmail = `e2e.order.admin.${marker}@snack.store`;
  const deliveryEmail = `e2e.order.delivery.${marker}@snack.store`;
  const strangerEmail = `e2e.order.stranger.${marker}@snack.store`;
  const password = 'Password123!';
  const sku = `e2e-order-${marker}-001`;

  let customerToken: string;
  let adminToken: string;
  let deliveryToken: string;
  let strangerToken: string;
  let productId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return (res.body as { access_token: string }).access_token;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);

    for (const email of [customerEmail, strangerEmail]) {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, firstName: 'Cliente', lastName: 'Pedidos' })
        .expect(201);
    }

    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Admin', 'Pedidos', 'ADMIN')`,
      [adminEmail, hash],
    );
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Delivery', 'Pedidos', 'DELIVERY')`,
      [deliveryEmail, hash],
    );

    customerToken = await login(customerEmail);
    adminToken = await login(adminEmail);
    deliveryToken = await login(deliveryEmail);
    strangerToken = await login(strangerEmail);

    // Producto de prueba con stock
    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku,
        name: 'Producto Pedidos',
        price: 10,
        salePrice: 8,
        unit: 'u',
      })
      .expect(201);
    productId = (productRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .patch(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stockQuantity: 50 })
      .expect(200);
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query(
          `DELETE FROM payments WHERE order_id IN
           (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
          [customerEmail],
        );
        await dataSource.query(
          `DELETE FROM order_items WHERE order_id IN
           (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
          [customerEmail],
        );
        await dataSource.query(
          `DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
          [customerEmail],
        );
        await dataSource.query(
          `DELETE FROM cart_items WHERE cart_id IN
           (SELECT id FROM carts WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
          [customerEmail],
        );
        await dataSource.query(
          `DELETE FROM carts WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
          [customerEmail],
        );
        await dataSource.query('DELETE FROM inventory WHERE product_id = $1', [
          productId,
        ]);
        await dataSource.query(
          `DELETE FROM addresses WHERE user_id IN
           (SELECT id FROM users WHERE email IN ($1, $2))`,
          [customerEmail, strangerEmail],
        );
        await dataSource.query('DELETE FROM products WHERE sku = $1', [sku]);
        await dataSource.query(
          'DELETE FROM users WHERE email IN ($1, $2, $3, $4)',
          [adminEmail, deliveryEmail, strangerEmail, customerEmail],
        );
      }
    } finally {
      await app.close();
    }
  });

  it('POST /api/orders sin carrito → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(400);
  });

  it('POST /api/orders con tarjeta → 201, order PAID y payment COMPLETED', async () => {
    // Agregar al carrito
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(201);

    const body = res.body as OrderBody;
    expect(body.status).toBe('PAID'); // tarjeta → pago confirmado al instante
    expect(body.subtotal).toBe(16); // 2 × 8 (salePrice)
    expect(body.deliveryFee).toBe(0);
    expect(body.total).toBe(16);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].productName).toBe('Producto Pedidos');
    expect(body.items[0].unitPrice).toBe(8);
    expect(body.items[0].quantity).toBe(2);
    expect(body.items[0].subtotal).toBe(16);
    expect(body.payment).not.toBeNull();
    expect(body.payment?.method).toBe('CREDIT_CARD');
    expect(body.payment?.status).toBe('COMPLETED');
    expect(body.payment?.transactionId).toMatch(/^SIM-/);
  });

  it('POST /api/orders con addressId → 201 y guarda el snapshot de la dirección', async () => {
    // Crear dirección del cliente
    const addrRes = await request(app.getHttpServer())
      .post('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressLine1: 'Av. Providencia 1234', city: 'Santiago' })
      .expect(201);
    const addressId = (addrRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId, paymentMethod: 'CREDIT_CARD' })
      .expect(201);

    const body = res.body as OrderBody;
    expect(body.shippingAddress).not.toBeNull();
    expect(body.shippingAddress?.addressLine1).toBe('Av. Providencia 1234');
    expect(body.shippingAddress?.city).toBe('Santiago');
  });

  it('POST /api/orders con addressId de otro usuario → 400', async () => {
    // Crear dirección con el stranger y usar su id con el customer
    const addrRes = await request(app.getHttpServer())
      .post('/api/addresses')
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ addressLine1: 'Casa del extraño', city: 'Valparaíso' })
      .expect(201);
    const strangerAddressId = (addrRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressId: strangerAddressId, paymentMethod: 'CREDIT_CARD' })
      .expect(400);
  });

  it('POST /api/orders con transferencia → 201, order PENDING y payment PENDING', async () => {
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);

    const body = res.body as OrderBody;
    expect(body.status).toBe('PENDING');
    expect(body.payment?.method).toBe('TRANSFER');
    expect(body.payment?.status).toBe('PENDING');
  });

  it('POST /api/orders descuenta el stock del inventario', async () => {
    const invRes = await request(app.getHttpServer())
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // Stock inicial 50 → pedidos previos: 2 (tarjeta) + 1 (snapshot) + 1 (transferencia)
    expect((invRes.body as { stockQuantity: number }).stockQuantity).toBe(46);
  });

  it('POST /api/orders con carrito que excede stock → 400', async () => {
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 100 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'CASH_ON_DELIVERY' })
      .expect(400);

    // Deja el carrito limpio para los siguientes tests
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
  });

  it('POST /api/orders sin token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/orders')
      .send({ paymentMethod: 'CREDIT_CARD' })
      .expect(401);
  });

  it('GET /api/orders/me → 200 lista solo mis pedidos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const body = res.body as { data: OrderBody[]; total: number };
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    for (const order of body.data) {
      expect(order.userId).not.toBeUndefined();
      expect(order.items.length).toBeGreaterThan(0);
    }
  });

  it('GET /api/orders como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/orders como ADMIN → 200 con el pedido del cliente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as { data: OrderBody[]; total: number };
    const mine = body.data.find((o) => o.userId !== undefined);
    expect(mine).toBeDefined();
    expect(body.data[0].payment).not.toBeNull();
  });

  it('GET /api/orders/me con filter status=PAID → 200 solo PAID', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/me?status=PAID')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const body = res.body as { data: OrderBody[] };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((o) => o.status === 'PAID')).toBe(true);
  });

  it('PATCH /api/orders/:id/status como ADMIN PENDING → PAID confirma el pago', async () => {
    // Crear pedido con transferencia (queda PENDING)
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);

    const orderId = (created.body as OrderBody).id;

    const res = await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PAID' })
      .expect(200);

    const body = res.body as OrderBody;
    expect(body.status).toBe('PAID');
    expect(body.payment?.status).toBe('COMPLETED');
  });

  it('PATCH /api/orders/:id/status con transición inválida → 400', async () => {
    // Pedido PAID no puede volver a PENDING
    const res = await request(app.getHttpServer())
      .get('/api/orders/me?status=PAID')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const orderId = (res.body as { data: OrderBody[] }).data[0].id;

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PENDING' })
      .expect(400);
  });

  it('PATCH /api/orders/:id/status como DELIVERY entrega un pedido preparado', async () => {
    // Flujo completo: PAID → PREPARING (ADMIN) → OUT_FOR_DELIVERY (DELIVERY) → DELIVERED (DELIVERY)
    const res = await request(app.getHttpServer())
      .get('/api/orders/me?status=PAID')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderId = (res.body as { data: OrderBody[] }).data[0].id;

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' })
      .expect(200);

    const out = await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    expect((out.body as OrderBody).status).toBe('OUT_FOR_DELIVERY');

    const delivered = await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send({ status: 'DELIVERED' })
      .expect(200);
    const deliveredBody = delivered.body as OrderBody;
    expect(deliveredBody.status).toBe('DELIVERED');
    // Vía PATCH también se registra quién entregó
    expect(deliveredBody.deliveredBy?.email).toBe(deliveryEmail);
  });

  it('POST /api/orders/:id/deliver como DELIVERY → 200 y registra al repartidor', async () => {
    // Flujo: PENDING → PREPARING (ADMIN) → OUT_FOR_DELIVERY (DELIVERY) → deliver (DELIVERY)
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    // Contra entrega: al entregar debe cobrarse el pago
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'CASH_ON_DELIVERY' })
      .expect(201);
    const orderId = (created.body as OrderBody).id;

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(200);

    const body = res.body as OrderBody;
    expect(body.status).toBe('DELIVERED');
    expect(body.deliveredBy).not.toBeNull();
    expect(body.deliveredBy?.email).toBe(deliveryEmail);
    // El pago contra entrega se cobró al entregar
    expect(body.payment?.method).toBe('CASH_ON_DELIVERY');
    expect(body.payment?.status).toBe('COMPLETED');
  });

  it('POST /api/orders/:id/deliver de un pedido no en ruta → 400', async () => {
    // Pedido fresco en PENDING
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);
    const orderId = (created.body as OrderBody).id;

    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(400);
  });

  it('POST /api/orders/:id/deliver como CUSTOMER → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderId = (res.body as { data: OrderBody[] }).data[0].id;

    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/orders/deliveries/me como DELIVERY → 200 con entregas y resumen', async () => {
    // Preparar un pedido entregado por el repartidor
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);
    const orderId = (created.body as OrderBody).id;

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PAID' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PREPARING' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/api/orders/deliveries/me')
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(200);

    const body = res.body as DeliveriesReportBody;
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((o) => o.deliveredBy?.email === deliveryEmail)).toBe(
      true,
    );
    expect(body.summary.totalDelivered).toBe(body.total);
    expect(body.summary.todayDelivered).toBeGreaterThanOrEqual(1);
    expect(body.summary.totalAmount).toBeGreaterThan(0);
    expect(body.summary.todayAmount).toBeGreaterThan(0);
  });

  it('GET /api/orders/report/sales como ADMIN → 200 con métricas agregadas', async () => {
    // Hay pedidos pagados de tests anteriores (tarjetas, transferencias)
    const res = await request(app.getHttpServer())
      .get('/api/orders/report/sales')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as {
      summary: {
        totalOrders: number;
        totalAmount: number;
        averageTicket: number;
      };
      byDay: { date: string; orders: number; amount: number }[];
      topProducts: { productName: string; quantity: number; amount: number }[];
      byPaymentMethod: { method: string; orders: number; amount: number }[];
    };

    expect(body.summary.totalOrders).toBeGreaterThan(0);
    expect(body.summary.totalAmount).toBeGreaterThan(0);
    expect(body.summary.averageTicket).toBeGreaterThan(0);
    expect(body.byDay.length).toBeGreaterThan(0);
    expect(body.topProducts.length).toBeGreaterThan(0);
    expect(body.topProducts[0].productName).toBe('Producto Pedidos');
    expect(body.byPaymentMethod.length).toBeGreaterThan(0);
  });

  it('GET /api/orders/report/sales como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/report/sales')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/orders/report/sales como DELIVERY → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/report/sales')
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(403);
  });

  it('GET /api/orders/report/sales/export como ADMIN → 200 CSV con secciones', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/report/sales/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect('Content-Type', /text\/csv/);

    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');
    // BOM UTF-8 para Excel
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('Reporte de ventas');
    expect(res.text).toContain('Resumen');
    expect(res.text).toContain('Pedidos vendidos');
    expect(res.text).toContain('Ventas por día');
    expect(res.text).toContain('Fecha,Pedidos,Monto');
    expect(res.text).toContain('Top productos (por monto)');
    expect(res.text).toContain('Desglose por método de pago');
    expect(res.text).toContain('Producto Pedidos');
  });

  it('GET /api/orders/report/sales/export como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/report/sales/export')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/orders/report/sales/export como DELIVERY → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/report/sales/export')
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(403);
  });

  it('GET /api/orders/deliveries como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/orders/deliveries')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/orders/deliveries?userId= como ADMIN → 200 con entregas del repartidor', async () => {
    // Buscar el id del repartidor en una entrega previa
    const me = await request(app.getHttpServer())
      .get('/api/orders/deliveries/me')
      .set('Authorization', `Bearer ${deliveryToken}`)
      .expect(200);
    const deliveryUserId = (me.body as DeliveriesReportBody).data[0].deliveredBy
      ?.id;
    expect(deliveryUserId).toBeDefined();

    const res = await request(app.getHttpServer())
      .get(`/api/orders/deliveries?userId=${deliveryUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as DeliveriesReportBody;
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.summary.totalDelivered).toBe(body.total);
  });

  it('PATCH /api/orders/:id/status como DELIVERY a PREPARING → 403', async () => {
    // Pedido fresco en PENDING (transición PENDING→PREPARING es válida,
    // pero el rol DELIVERY no tiene permiso para hacerla)
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);
    const orderId = (created.body as OrderBody).id;

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send({ status: 'PREPARING' })
      .expect(403);
  });

  it('PATCH /api/orders/:id/status CUSTOMER cancela su pedido PENDING → 200 y stock devuelto', async () => {
    // Pedido nuevo con transferencia (PENDING)
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);
    const orderId = (created.body as OrderBody).id;

    const beforeInv = await request(app.getHttpServer())
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const stockBefore = (beforeInv.body as { stockQuantity: number })
      .stockQuantity;

    const res = await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ status: 'CANCELLED' })
      .expect(200);

    expect((res.body as OrderBody).status).toBe('CANCELLED');
    expect((res.body as OrderBody).payment?.status).toBe('FAILED');

    const afterInv = await request(app.getHttpServer())
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // El stock se devuelve al cancelar
    expect((afterInv.body as { stockQuantity: number }).stockQuantity).toBe(
      stockBefore + 2,
    );
  });

  it('PATCH /api/orders/:id/status como CUSTOMER no dueño → 403', async () => {
    // Pedido fresco en PENDING: la transición es válida pero el extraño no es dueño
    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ paymentMethod: 'TRANSFER' })
      .expect(201);
    const orderId = (created.body as OrderBody).id;

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ status: 'CANCELLED' })
      .expect(403);
  });

  it('GET /api/orders/:id como CUSTOMER no dueño → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderId = (res.body as { data: OrderBody[] }).data[0].id;

    await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);
  });

  it('GET /api/orders/:id como ADMIN → 200 con items y pago', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const orderId = (res.body as { data: OrderBody[] }).data[0].id;

    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = detail.body as OrderBody;
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.payment).not.toBeNull();
    expect(body.user).not.toBeNull();
  });
});
