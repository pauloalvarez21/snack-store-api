import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'categoryId debe ser un UUID válido' })
  categoryId?: string;

  @IsString()
  @Length(1, 50, { message: 'El SKU debe tener entre 1 y 50 caracteres' })
  sku: string;

  @IsString()
  @Length(1, 200, { message: 'El nombre debe tener entre 1 y 200 caracteres' })
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'El slug solo puede contener minúsculas, números y guiones',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'price debe ser un número con hasta 2 decimales' },
  )
  @Min(0, { message: 'price no puede ser negativo' })
  @Max(99_999_999, { message: 'price es demasiado alto' })
  price: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'salePrice debe ser un número con hasta 2 decimales' },
  )
  @Min(0, { message: 'salePrice no puede ser negativo' })
  @Max(99_999_999, { message: 'salePrice es demasiado alto' })
  salePrice?: number;

  @IsString()
  @Length(1, 20, { message: 'La unidad debe tener entre 1 y 20 caracteres' })
  unit: string;

  @IsOptional()
  @IsBoolean()
  isPerishable?: boolean;

  @IsOptional()
  @IsBoolean()
  isOrganic?: boolean;

  @IsOptional()
  @IsUrl({}, { message: 'imageUrl debe ser una URL válida' })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
