import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface CartItemBody {
  productId: string;
  quantity: number;
  product: {
    id: string;
    sku: string;
    name: string;
    price: number;
    salePrice: number | null;
    inStock: boolean;
    stockStatus: string;
  } | null;
  subtotal: number;
}

interface CartBody {
  id: string;
  items: CartItemBody[];
  itemsCount: number;
  subtotal: number;
}

describe('Carts (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const customerEmail = `e2e.cart.customer.${marker}@snack.store`;
  const adminEmail = `e2e.cart.admin.${marker}@snack.store`;
  const password = 'Password123!';
  const sku = `e2e-cart-${marker}-001`;
  const missingProductId = '99999999-9999-4999-8999-999999999999';

  let customerToken: string;
  let adminToken: string;
  let productId: string;

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

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: customerEmail,
        password,
        firstName: 'Cliente',
        lastName: 'Carrito',
      })
      .expect(201);

    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Admin', 'Carrito', 'ADMIN')`,
      [adminEmail, hash],
    );

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as { access_token: string }).access_token;
    };

    customerToken = await login(customerEmail);
    adminToken = await login(adminEmail);

    // Producto de prueba con descuento (salePrice) para validar el precio efectivo
    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku,
        name: 'Producto Carrito',
        price: 2.5,
        salePrice: 1.99,
        unit: 'u',
      })
      .expect(201);
    productId = (productRes.body as { id: string }).id;

    // Le damos stock para que aparezca como disponible en el carrito
    await request(app.getHttpServer())
      .patch(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stockQuantity: 10 })
      .expect(200);
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query(
          `DELETE FROM cart_items
           WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
          [customerEmail],
        );
        await dataSource.query(
          `DELETE FROM carts WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
          [customerEmail],
        );
        await dataSource.query('DELETE FROM products WHERE sku = $1', [sku]);
        await dataSource.query('DELETE FROM users WHERE email IN ($1, $2)', [
          adminEmail,
          customerEmail,
        ]);
      }
    } finally {
      await app.close();
    }
  });

  it('GET /api/carts/me sin token → 401', async () => {
    await request(app.getHttpServer()).get('/api/carts/me').expect(401);
  });

  it('GET /api/carts/me como CUSTOMER → 200 y crea el carrito vacío', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const body = res.body as CartBody;
    expect(body.itemsCount).toBe(0);
    expect(body.subtotal).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('POST /api/carts/me/items → 201 con subtotal usando salePrice', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 2 })
      .expect(201);

    const body = res.body as CartBody;
    expect(body.itemsCount).toBe(1);
    expect(body.items[0].quantity).toBe(2);
    expect(body.items[0].subtotal).toBe(3.98); // 2 × 1.99
    expect(body.subtotal).toBe(3.98);
    expect(body.items[0].product?.salePrice).toBe(1.99);
    expect(body.items[0].product?.inStock).toBe(true);
  });

  it('POST /api/carts/me/items del mismo producto → 201 y suma la cantidad', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    expect((res.body as CartBody).items[0].quantity).toBe(3);
  });

  it('PATCH /api/carts/me/items/:productId → 200 fija la cantidad', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/carts/me/items/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quantity: 4 })
      .expect(200);

    const body = res.body as CartBody;
    expect(body.items[0].quantity).toBe(4);
    expect(body.subtotal).toBe(7.96); // 4 × 1.99
  });

  it('POST /api/carts/me/items con quantity 0 → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 0 })
      .expect(400);
  });

  it('POST /api/carts/me/items con producto inexistente → 404', async () => {
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId: missingProductId, quantity: 1 })
      .expect(404);
  });

  it('DELETE /api/carts/me/items/:productId → 204 y el carrito queda vacío', async () => {
    await request(app.getHttpServer())
      .delete(`/api/carts/me/items/${productId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect((res.body as CartBody).itemsCount).toBe(0);
  });

  it('DELETE /api/carts/me → 204 vacía el carrito', async () => {
    await request(app.getHttpServer())
      .post('/api/carts/me/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/api/carts/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect((res.body as CartBody).itemsCount).toBe(0);
  });
});
