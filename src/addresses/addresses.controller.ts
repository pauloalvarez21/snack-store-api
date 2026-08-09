import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestUser } from '../auth/jwt.strategy';
import type { AddressResponse } from './addresses.service';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('addresses')
@Controller('addresses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({
    summary: 'Mis direcciones de envío (la principal primero)',
  })
  findAll(@CurrentUser() user: RequestUser): Promise<AddressResponse[]> {
    return this.addressesService.findAll(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una dirección (la primera se vuelve la principal)',
  })
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponse> {
    return this.addressesService.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una dirección propia' })
  findOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AddressResponse> {
    return this.addressesService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una dirección propia' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponse> {
    return this.addressesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una dirección propia' })
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.addressesService.remove(user.id, id);
  }
}
