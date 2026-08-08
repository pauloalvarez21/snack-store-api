import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina propiedades no declaradas en los DTOs
      forbidNonWhitelisted: true, // 400 si llega una propiedad desconocida
      transform: true, // transforma el payload según los tipos del DTO
    }),
  );

  const configService = app.get(ConfigService);
  await app.listen(Number(configService.get('PORT') ?? 3000));
}
void bootstrap();
