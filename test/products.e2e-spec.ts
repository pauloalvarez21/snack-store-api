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

interface CategoryBody {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ProductBody {
  id: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  unit: string;
  isPerishable: boolean;
  category: { id: string; name: string; slug: string } | null;
}

describe('Products & Categories (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const customerEmail = `e2e.customer.${marker}@snack.store`;
  const adminEmail = `e2e.admin.${marker}@snack.store`;
  const password = 'Password123!';

  let customerToken: string;
  let adminToken: string;
  let categoryId: string;
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

    // Cliente (CUSTOMER) vía API
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: customerEmail,
        password,
        firstName: 'Cliente',
        lastName: 'E2E',
      })
      .expect(201);

    // Admin (ADMIN) creado directo en BD — el registro siempre crea CUSTOMER
    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Admin', 'E2E', 'ADMIN')`,
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
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query('DELETE FROM products WHERE sku LIKE $1', [
          `e2e-${marker}%`,
        ]);
        await dataSource.query('DELETE FROM categories WHERE slug LIKE $1', [
          `e2e-${marker}%`,
        ]);
        await dataSource.query('DELETE FROM users WHERE email IN ($1, $2)', [
          customerEmail,
          adminEmail,
        ]);
      }
    } finally {
      await app.close();
    }
  });

  it('GET /api/categories público → 200 paginado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories')
      .expect(200);

    const body = res.body as PaginatedBody<CategoryBody>;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/categories sin token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/categories')
      .send({ name: 'X' })
      .expect(401);
  });

  it('POST /api/categories como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'X' })
      .expect(403);
  });

  it('POST /api/categories como ADMIN → 201 con slug generado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `E2E Frutas ${marker}`, description: 'Frutas frescas' })
      .expect(201);

    const body = res.body as CategoryBody;
    categoryId = body.id;
    expect(body.slug).toContain('e2e-frutas');
    expect(body.isActive).toBe(true);
  });

  it('GET /api/categories/:id → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/categories/${categoryId}`)
      .expect(200);

    expect((res.body as CategoryBody).id).toBe(categoryId);
  });

  it('POST /api/products como ADMIN → 201 con slug y precios', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `e2e-${marker}-001`,
        name: `Manzana ${marker}`,
        categoryId,
        price: 2.5,
        salePrice: 1.99,
        unit: 'kg',
        isPerishable: true,
      })
      .expect(201);

    const body = res.body as ProductBody;
    productId = body.id;
    expect(body.slug).toContain('manzana');
    expect(body.price).toBe(2.5);
    expect(body.salePrice).toBe(1.99);
    expect(body.category?.id).toBe(categoryId);
  });

  it('POST /api/products con salePrice >= price → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `e2e-${marker}-x`,
        name: 'Invalido',
        price: 5,
        salePrice: 7,
        unit: 'u',
      })
      .expect(400);
  });

  it('POST /api/products con slug explícito duplicado → 409', async () => {
    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `e2e-${marker}-002`,
        name: 'Duplicado',
        slug: `manzana-${marker}`,
        price: 3,
        unit: 'kg',
      })
      .expect(409);
  });

  it('GET /api/products con búsqueda → 200 y filtra', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/products?search=${encodeURIComponent(marker)}`)
      .expect(200);

    const body = res.body as PaginatedBody<ProductBody>;
    expect(body.total).toBe(1);
    expect(body.data[0].sku).toBe(`e2e-${marker}-001`);
  });

  it('GET /api/products/:id → 200 con categoría', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .expect(200);

    const body = res.body as ProductBody;
    expect(body.id).toBe(productId);
    expect(body.category).not.toBeNull();
  });

  it('PATCH /api/products/:id como ADMIN → 200 actualiza el precio', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 3.2 })
      .expect(200);

    expect((res.body as ProductBody).price).toBe(3.2);
  });

  it('DELETE /api/categories/:id como ADMIN → 204', async () => {
    await request(app.getHttpServer())
      .delete(`/api/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });
});
