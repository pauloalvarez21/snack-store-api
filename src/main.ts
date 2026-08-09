import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './uploads/uploads.constants';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  // Imágenes subidas por el front: se guardan en uploads/ y se sirven en /uploads/...
  app.useStaticAssets(UPLOADS_DIR, {
    prefix: '/uploads',
    // Evita que el navegador interprete el contenido como otro tipo (MIME sniffing)
    setHeaders: (res: Response) =>
      res.setHeader('X-Content-Type-Options', 'nosniff'),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina propiedades no declaradas en los DTOs
      forbidNonWhitelisted: true, // 400 si llega una propiedad desconocida
      transform: true, // transforma el payload según los tipos del DTO
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('snack-store-api')
    .setDescription('API REST para un sistema de venta de comestibles en línea')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Introduce tu token JWT (POST /api/auth/login)',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // UI interactiva en /api/docs · documento JSON en /api/docs-json
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  await app.listen(Number(configService.get('PORT') ?? 3000));
}
void bootstrap();
