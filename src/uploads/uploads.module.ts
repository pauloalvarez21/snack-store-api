import { Module } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { UploadsController } from './uploads.controller';
import { UPLOADS_DIR } from './uploads.constants';

// Se asegura de que la carpeta de subidas exista en producción y en tests
mkdirSync(UPLOADS_DIR, { recursive: true });

@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
