import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface AuthBody {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: string;
  };
}

/** Extrae el jti (JWT ID) del payload de un access token. */
function getJti(token: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { jti?: unknown };
    return typeof payload.jti === 'string' ? payload.jti : null;
  } catch {
    return null;
  }
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

  it('POST /api/auth/login → 200 con access_token y refresh_token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const body = res.body as AuthBody;
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(typeof body.refresh_token).toBe('string');
    expect(body.user.email).toBe(email);
  });

  it('POST /api/auth/refresh → 200 rota el refresh token y emite un nuevo par', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const { access_token, refresh_token } = loginRes.body as AuthBody;

    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh_token })
      .expect(200);

    const body = res.body as AuthBody;
    expect(body.access_token).toBeDefined();
    expect(body.access_token).not.toBe(access_token);
    expect(body.refresh_token).toBeDefined();
    expect(body.refresh_token).not.toBe(refresh_token);
    expect(body.user.email).toBe(email);

    // El token presentado quedó rotado: reutilizarlo debe fallar
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: refresh_token })
      .expect(401);
  });

  it('POST /api/auth/refresh con token inválido → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'token-invalido' })
      .expect(401);
  });

  it('POST /api/auth/logout → 200 y revoca access + refresh tokens', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const body = loginRes.body as AuthBody;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${body.access_token}`)
      .send({ refreshToken: body.refresh_token })
      .expect(200);

    // El access token quedó blacklisteado → 401
    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(401);

    // El refresh token quedó revocado → 401
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: body.refresh_token })
      .expect(401);

    // Limpieza: la blacklist de este jti (la tabla no tiene FK a users)
    const jti = getJti(body.access_token);
    if (dataSource && jti) {
      await dataSource.query('DELETE FROM revoked_tokens WHERE jti = $1', [
        jti,
      ]);
    }
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
