import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { unlinkSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/user.entity';
import { isValidImageSignature, readFileHeader } from './image.validator';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_SIZE,
  MIME_TO_EXT,
  UPLOADS_DIR,
  UPLOADS_PUBLIC_PREFIX,
} from './uploads.constants';

interface UploadedImage {
  filename: string;
  mimetype: string;
  size: number;
  path: string;
}

export interface UploadImageResponse {
  /** URL pública de la imagen lista para enviar como imageUrl del producto */
  imageUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  /**
   * Subida opcional de imagen: el front llama a este endpoint y usa la
   * imageUrl devuelta al crear/editar un producto (POST/PATCH /api/products).
   */
  @Post('images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Subir imagen de producto (solo ADMIN)',
    description:
      'Devuelve la imageUrl pública que luego se envía al crear o editar un producto. ' +
      'Es opcional: los productos pueden crearse sin imagen.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description:
            'Archivo de imagen (jpg, png, webp, gif o avif). Máximo 5 MB.',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      dest: UPLOADS_DIR,
      limits: { fileSize: MAX_IMAGE_SIZE },
      fileFilter: (_req, file, cb) => {
        // Primer filtro por mimetype declarado (file queda undefined si no pasa)
        cb(null, ALLOWED_IMAGE_MIMES.has(file.mimetype));
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: UploadedImage | undefined,
    @Req() req: Request,
  ): Promise<UploadImageResponse> {
    if (!file) {
      throw new BadRequestException(
        'Debes enviar un archivo de imagen válido (jpg, png, webp, gif o avif)',
      );
    }

    const ext = MIME_TO_EXT[file.mimetype];
    if (!ext) {
      // No debería ocurrir: fileFilter ya restringe los mimetypes permitidos
      unlinkSync(file.path);
      throw new BadRequestException('Formato de imagen no soportado');
    }

    // El mimetype declarado es falseable: validamos la firma real del archivo
    if (!isValidImageSignature(file.mimetype, readFileHeader(file.path))) {
      unlinkSync(file.path);
      throw new BadRequestException('El archivo no es una imagen válida');
    }

    // multer genera un nombre sin extensión: se la agregamos según el mimetype
    // para que el navegador la sirva con el Content-Type correcto.
    const finalName = `${file.filename}${ext}`;
    await rename(file.path, join(UPLOADS_DIR, finalName));

    const baseUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
    return {
      imageUrl: `${baseUrl}${UPLOADS_PUBLIC_PREFIX}/${finalName}`,
      fileName: finalName,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
