import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';

jest.setTimeout(60_000);

interface AddressBody {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  deliveryNotes: string | null;
  isDefault: boolean;
}

describe('Addresses (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const customerEmail = `e2e.addr.customer.${marker}@snack.store`;
  const strangerEmail = `e2e.addr.stranger.${marker}@snack.store`;
  const password = 'Password123!';

  let customerToken: string;
  let strangerToken: string;
  let addressId: string;

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
        .send({
          email,
          password,
          firstName: 'Cliente',
          lastName: 'Direcciones',
        })
        .expect(201);
    }

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return (res.body as { access_token: string }).access_token;
    };

    customerToken = await login(customerEmail);
    strangerToken = await login(strangerEmail);
  });

  afterAll(async () => {
    try {
      if (dataSource) {
        await dataSource.query(
          `DELETE FROM addresses WHERE user_id IN
           (SELECT id FROM users WHERE email IN ($1, $2))`,
          [customerEmail, strangerEmail],
        );
        await dataSource.query('DELETE FROM users WHERE email IN ($1, $2)', [
          customerEmail,
          strangerEmail,
        ]);
      }
    } finally {
      await app.close();
    }
  });

  it('GET /api/addresses sin token → 401', async () => {
    await request(app.getHttpServer()).get('/api/addresses').expect(401);
  });

  it('POST /api/addresses → 201, la primera es la principal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        addressLine1: 'Av. Providencia 1234, Depto 501',
        city: 'Santiago',
        stateProvince: 'Región Metropolitana',
        postalCode: '7500000',
        deliveryNotes: 'Llamar al llegar',
      })
      .expect(201);

    const body = res.body as AddressBody;
    addressId = body.id;
    expect(body.addressLine1).toBe('Av. Providencia 1234, Depto 501');
    expect(body.city).toBe('Santiago');
    expect(body.isDefault).toBe(true);
  });

  it('POST /api/addresses inválida → 400 (sin city)', async () => {
    await request(app.getHttpServer())
      .post('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressLine1: 'Calle X 1' })
      .expect(400);
  });

  it('GET /api/addresses → 200 con mis direcciones', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const body = res.body as AddressBody[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(addressId);
    expect(body[0].isDefault).toBe(true);
  });

  it('POST segunda dirección → 201 y no es la principal', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        addressLine1: 'Av. Los Leones 200',
        city: 'Santiago',
      })
      .expect(201);

    expect((res.body as AddressBody).isDefault).toBe(false);
  });

  it('PATCH /api/addresses/:id → 200 actualiza y puede marcar como principal', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/addresses/${addressId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ city: 'Providencia', isDefault: true })
      .expect(200);

    const body = res.body as AddressBody;
    expect(body.city).toBe('Providencia');
    expect(body.isDefault).toBe(true);

    // La otra dirección quedó desmarcada
    const list = await request(app.getHttpServer())
      .get('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const others = (list.body as AddressBody[]).filter(
      (a) => a.id !== addressId,
    );
    expect(others.every((a) => a.isDefault === false)).toBe(true);
  });

  it('GET /api/addresses/:id como otro usuario → 404', async () => {
    await request(app.getHttpServer())
      .get(`/api/addresses/${addressId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(404);
  });

  it('PATCH /api/addresses/:id como otro usuario → 404', async () => {
    await request(app.getHttpServer())
      .patch(`/api/addresses/${addressId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ city: 'Valparaíso' })
      .expect(404);
  });

  it('DELETE /api/addresses/:id → 204 y desaparece de la lista', async () => {
    await request(app.getHttpServer())
      .delete(`/api/addresses/${addressId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get('/api/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const body = res.body as AddressBody[];
    expect(body.some((a) => a.id === addressId)).toBe(false);
  });
});
