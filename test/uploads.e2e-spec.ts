import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { UPLOADS_DIR } from './../src/uploads/uploads.constants';

jest.setTimeout(60_000);

interface UploadBody {
  imageUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface ProductBody {
  id: string;
  imageUrl: string | null;
}

describe('Uploads (e2e)', () => {
  let app: NestExpressApplication<App>;
  let dataSource: DataSource;

  const marker = Date.now().toString(36);
  const adminEmail = `e2e.upload.admin.${marker}@snack.store`;
  const customerEmail = `e2e.upload.customer.${marker}@snack.store`;
  const password = 'Password123!';
  const createdFiles: string[] = [];

  // PNG 1x1 transparente válido
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  let adminToken: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return (res.body as { access_token: string }).access_token;
  };

  const upload = (
    token: string,
    file: { name: string; contentType: string; buffer: Buffer },
  ) =>
    request(app.getHttpServer())
      .post('/api/uploads/images')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', file.buffer, {
        filename: file.name,
        contentType: file.contentType,
      });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication<App>>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Misma configuración de estáticos que main.ts
    app.useStaticAssets(UPLOADS_DIR, {
      prefix: '/uploads',
      setHeaders: (res: Response) =>
        res.setHeader('X-Content-Type-Options', 'nosniff'),
    });
    await app.init();

    dataSource = app.get(DataSource);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: customerEmail,
        password,
        firstName: 'Cliente',
        lastName: 'Upload',
      })
      .expect(201);

    // Admin creado directo en BD — el registro siempre crea CUSTOMER
    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, 'Admin', 'Upload', 'ADMIN')`,
      [adminEmail, hash],
    );

    adminToken = await login(adminEmail);
  });

  afterAll(async () => {
    try {
      for (const name of createdFiles) {
        const path = join(UPLOADS_DIR, name);
        if (existsSync(path)) {
          unlinkSync(path);
        }
      }
      if (dataSource) {
        await dataSource.query('DELETE FROM products WHERE sku LIKE $1', [
          `e2e-upload-${marker}-%`,
        ]);
        await dataSource.query('DELETE FROM users WHERE email IN ($1, $2)', [
          adminEmail,
          customerEmail,
        ]);
      }
    } finally {
      await app.close();
    }
  });

  it('POST /api/uploads/images sin token → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads/images')
      .attach('image', tinyPng, { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
  });

  it('POST /api/uploads/images como CUSTOMER → 403', async () => {
    const customerToken = await login(customerEmail);
    await upload(customerToken, {
      name: 'a.png',
      contentType: 'image/png',
      buffer: tinyPng,
    }).expect(403);
  });

  it('POST /api/uploads/images como ADMIN → 201 y devuelve imageUrl pública', async () => {
    const res = await upload(adminToken, {
      name: 'test.png',
      contentType: 'image/png',
      buffer: tinyPng,
    }).expect(201);

    const body = res.body as UploadBody;
    createdFiles.push(body.fileName);
    expect(body.mimeType).toBe('image/png');
    expect(body.size).toBeGreaterThan(0);
    expect(body.imageUrl).toMatch(/^http:\/\/.*\/uploads\/.+/);
    expect(body.imageUrl).toContain(`/uploads/${body.fileName}`);
  });

  it('GET de la imageUrl devuelta → 200 y sirve la imagen', async () => {
    const res = await upload(adminToken, {
      name: 'b.png',
      contentType: 'image/png',
      buffer: tinyPng,
    }).expect(201);

    const body = res.body as UploadBody;
    createdFiles.push(body.fileName);

    const url = new URL(body.imageUrl);
    await request(app.getHttpServer())
      .get(url.pathname)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect('X-Content-Type-Options', 'nosniff');
  });

  it('crea un producto con la imageUrl subida (flujo opcional) → 201', async () => {
    const res = await upload(adminToken, {
      name: 'c.png',
      contentType: 'image/png',
      buffer: tinyPng,
    }).expect(201);

    const body = res.body as UploadBody;
    createdFiles.push(body.fileName);

    const productRes = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `e2e-upload-${marker}-001`,
        name: 'Producto con imagen',
        price: 2.5,
        unit: 'kg',
        imageUrl: body.imageUrl,
      })
      .expect(201);

    const product = productRes.body as ProductBody;
    expect(product.imageUrl).toBe(body.imageUrl);
  });

  it('POST /api/uploads/images con archivo no-imagen → 400', async () => {
    await upload(adminToken, {
      name: 'nota.txt',
      contentType: 'text/plain',
      buffer: Buffer.from('hola mundo'),
    }).expect(400);
  });

  it('POST /api/uploads/images sin archivo → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads/images')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
