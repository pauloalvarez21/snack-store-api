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
import type { CartResponse } from './carts.service';
import { CartsService } from './carts.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('carts')
@Controller('carts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Ver mi carrito (se crea automáticamente si no existe)',
  })
  getMyCart(@CurrentUser() user: RequestUser): Promise<CartResponse> {
    return this.cartsService.getMyCart(user.id);
  }

  @Post('me/items')
  @ApiOperation({
    summary: 'Agregar producto al carrito (si ya está, suma la cantidad)',
  })
  addItem(
    @CurrentUser() user: RequestUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponse> {
    return this.cartsService.addItem(user.id, dto);
  }

  @Patch('me/items/:productId')
  @ApiOperation({ summary: 'Fijar la cantidad de un producto en el carrito' })
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    return this.cartsService.updateItem(user.id, productId, dto);
  }

  @Delete('me/items/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar un producto del carrito' })
  removeItem(
    @CurrentUser() user: RequestUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<void> {
    return this.cartsService.removeItem(user.id, productId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vaciar el carrito' })
  clearCart(@CurrentUser() user: RequestUser): Promise<void> {
    return this.cartsService.clearCart(user.id);
  }
}
