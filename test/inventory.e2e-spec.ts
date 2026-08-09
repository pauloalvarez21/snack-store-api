import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface PaginatedBody<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface InventoryBody {
  id: string;
  productId: string;
  product: { id: string; sku: string; name: string; slug: string } | null;
  stockQuantity: number;
  minStockLevel: number;
  stockStatus: string;
  expirationDate: string | null;
}

interface ProductBody {
  id: string;
  inStock: boolean;
  stockStatus: string;
}

describe('Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const adminEmail = `e2e.inv.admin.${marker}@snack.store`;
  const customerEmail = `e2e.inv.customer.${marker}@snack.store`;
  const password = 'Password123!';
  const sku = `e2e-inv-${marker}-001`;

  let adminToken: string;
  let customerToken: string;
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
        lastName: 'Inv',
      })
      .expect(201);

    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Admin', 'Inv', 'ADMIN')`,
      [adminEmail, hash],
    );

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as { access_token: string }).access_token;
    };

    adminToken = await login(adminEmail);
    customerToken = await login(customerEmail);

    // Producto de prueba para asociarle el inventario
    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku, name: 'Producto Inventario', price: 1.5, unit: 'u' })
      .expect(201);
    productId = (productRes.body as ProductBody).id;
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query('DELETE FROM inventory WHERE product_id = $1', [
          productId,
        ]);
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

  it('GET /api/inventory sin token → 401', async () => {
    await request(app.getHttpServer()).get('/api/inventory').expect(401);
  });

  it('GET /api/inventory como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/inventory')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('PATCH /api/inventory/:productId como ADMIN → 200 y crea el registro (upsert)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stockQuantity: 12, minStockLevel: 5 })
      .expect(200);

    const body = res.body as InventoryBody;
    expect(body.productId).toBe(productId);
    expect(body.stockQuantity).toBe(12);
    expect(body.minStockLevel).toBe(5);
    expect(body.stockStatus).toBe('IN_STOCK');
  });

  it('GET /api/inventory/:productId → 200 con el stock exacto', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as InventoryBody;
    expect(body.product?.sku).toBe(sku);
    expect(body.stockQuantity).toBe(12);
  });

  it('POST /api/inventory/:productId/adjust con delta negativo → 200', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/inventory/${productId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: -3 })
      .expect(200);

    expect((res.body as InventoryBody).stockQuantity).toBe(9);
  });

  it('POST adjust que dejaría el stock negativo → 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/inventory/${productId}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: -100 })
      .expect(400);
  });

  it('GET /api/inventory?search= → 200 paginado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory?search=${encodeURIComponent(marker)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as PaginatedBody<InventoryBody>;
    expect(body.total).toBe(1);
    expect(body.data[0].product?.sku).toBe(sku);
  });

  it('GET /api/products/:id público → 200 con disponibilidad derivada', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .expect(200);

    const body = res.body as ProductBody;
    expect(body.inStock).toBe(true);
    expect(body.stockStatus).toBe('IN_STOCK');
  });
});
