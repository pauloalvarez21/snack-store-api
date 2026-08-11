import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface UserBody {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthBody {
  access_token: string;
  user: UserBody;
}

interface PaginatedBody<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const adminEmail = `e2e.usr.admin.${marker}@snack.store`;
  const customerEmail = `e2e.usr.customer.${marker}@snack.store`;
  const targetEmail = `e2e.usr.target.${marker}@snack.store`;
  const password = 'Password123!';
  const newPassword = 'NuevaClave456!';

  let adminToken: string;
  let customerToken: string;
  let targetId: string;

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

    const login = async (email: string, pwd: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: pwd })
        .expect(200);
      return (res.body as { access_token: string }).access_token;
    };

    // Cliente autenticado normal
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: customerEmail,
        password,
        firstName: 'Cliente',
        lastName: 'Usr',
      })
      .expect(201);

    // Usuario objetivo (para cambiar rol y contraseña)
    const targetRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: targetEmail,
        password,
        firstName: 'Objetivo',
        lastName: 'Usr',
      })
      .expect(201);
    // El register devuelve { access_token, user: {...} }
    targetId = (targetRes.body as AuthBody).user.id;

    // ADMIN creado directamente en la base (igual que en el resto de e2e)
    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Admin', 'Usr', 'ADMIN')`,
      [adminEmail, hash],
    );

    adminToken = await login(adminEmail, password);
    customerToken = await login(customerEmail, password);
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query(
          'DELETE FROM users WHERE email IN ($1, $2, $3)',
          [adminEmail, customerEmail, targetEmail],
        );
      }
    } finally {
      await app.close();
    }
  });

  it('GET /api/users/me → 200 con el perfil completo', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const body = res.body as UserBody;
    expect(body.email).toBe(customerEmail);
    expect(body.role).toBe('CUSTOMER');
    expect(body.passwordHash).toBeUndefined();
    expect(body.createdAt).toBeDefined();
  });

  it('GET /api/users/me sin token → 401', async () => {
    await request(app.getHttpServer()).get('/api/users/me').expect(401);
  });

  it('PATCH /api/users/me → 200 actualiza nombre y teléfono', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ firstName: 'ClienteEditado', phone: '+56911112222' })
      .expect(200);

    const body = res.body as UserBody;
    expect(body.firstName).toBe('ClienteEditado');
    expect(body.lastName).toBe('Usr');
    expect(body.phone).toBe('+56911112222');
  });

  it('PATCH /api/users/me con campo desconocido → 400', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ email: 'no@se.puede' })
      .expect(400);
  });

  it('POST /api/users/me/change-password con contraseña actual incorrecta → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ currentPassword: 'Incorrecta123!', newPassword })
      .expect(400);
  });

  it('POST /api/users/me/change-password → 200 y permite login con la nueva', async () => {
    await request(app.getHttpServer())
      .post('/api/users/me/change-password')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);

    // El nuevo login usa la contraseña nueva
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: customerEmail, password: newPassword })
      .expect(200);
  });

  it('GET /api/users como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/users?search= como ADMIN → 200 paginado con el usuario objetivo', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users?search=${encodeURIComponent(marker)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as PaginatedBody<UserBody>;
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(body.data.some((u) => u.email === targetEmail)).toBe(true);
    expect(body.data[0].passwordHash).toBeUndefined();
  });

  it('GET /api/users/:id como ADMIN → 200 con el detalle', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect((res.body as UserBody).email).toBe(targetEmail);
  });

  it('GET /api/users/:id como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .get(`/api/users/${targetId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });

  it('GET /api/users/:id inexistente como ADMIN → 404', async () => {
    await request(app.getHttpServer())
      .get('/api/users/ffffffff-ffff-4fff-8fff-ffffffffffff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('PATCH /api/users/:id/role como CUSTOMER → 403', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${targetId}/role`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ role: 'DELIVERY' })
      .expect(403);
  });

  it('PATCH /api/users/:id/role como ADMIN → 200 y promueve a DELIVERY', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/users/${targetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'DELIVERY' })
      .expect(200);

    expect((res.body as UserBody).role).toBe('DELIVERY');
  });

  it('GET /api/users?role=DELIVERY&search= como ADMIN → filtra por rol y encuentra al promovido', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/users?role=DELIVERY&search=${encodeURIComponent(marker)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as PaginatedBody<UserBody>;
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.data.every((u) => u.role === 'DELIVERY')).toBe(true);
    expect(body.data.some((u) => u.id === targetId)).toBe(true);
  });

  it('PATCH /api/users/:id/role del propio ADMIN → 400', async () => {
    const adminRes = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/users/${(adminRes.body as UserBody).id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CUSTOMER' })
      .expect(400);
  });

  it('PATCH /api/users/:id/role con rol inválido → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${targetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'SUPERADMIN' })
      .expect(400);
  });

  it('PATCH /api/users/:id/role inexistente → 404', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/ffffffff-ffff-4fff-8fff-ffffffffffff/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CUSTOMER' })
      .expect(404);
  });
});
