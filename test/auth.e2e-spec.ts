import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface AuthBody {
  access_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: string;
  };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const email = `e2e.${Date.now().toString(36)}@snack.store`;
  const password = 'Password123!';
  const firstName = 'E2E';
  const lastName = 'Test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Réplica de la configuración de src/main.ts
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
  });

  afterAll(async () => {
    try {
      // Limpieza: elimina el usuario de prueba creado durante el flujo
      if (dataSource) {
        await dataSource.query('DELETE FROM users WHERE email = $1', [email]);
      }
    } finally {
      await app.close();
    }
  });

  it('POST /api/auth/register → 201 con access_token y sin password_hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, firstName, lastName })
      .expect(201);

    const body = res.body as AuthBody;
    expect(body.access_token).toBeDefined();
    expect(body.user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe('CUSTOMER');
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('POST /api/auth/register con email duplicado → 409', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, firstName, lastName })
      .expect(409);
  });

  it('POST /api/auth/register con payload inválido → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'no-es-un-email',
        password: 'corta',
        firstName: '',
        lastName: '',
      })
      .expect(400);
  });

  it('POST /api/auth/login → 200 con access_token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const body = res.body as AuthBody;
    expect(body.access_token).toBeDefined();
    expect(body.user.email).toBe(email);
  });

  it('POST /api/auth/login con contraseña incorrecta → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword123!' })
      .expect(401);
  });

  it('GET /api/auth/profile con token → 200 y devuelve el usuario del JWT', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const loginBody = loginRes.body as AuthBody;
    const token = loginBody.access_token;

    const res = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const profileBody = res.body as { id: string; email: string; role: string };
    expect(profileBody.email).toBe(email);
    expect(profileBody.role).toBe('CUSTOMER');
  });

  it('GET /api/auth/profile sin token → 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/profile').expect(401);
  });

  it('GET /api/auth/profile con token inválido → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });
});
