# snack-store-api

API REST para un sistema de venta de comestibles en línea construida con **NestJS 11** y **TypeScript**.

## 🚀 Stack

| Capa | Tecnología |
|------|------------|
| Framework | [NestJS 11](https://nestjs.com) + TypeScript |
| Base de datos | PostgreSQL (TypeORM) |
| Autenticación | JWT (Passport) + bcrypt |
| Autorización | Roles (ADMIN / CUSTOMER / DELIVERY) vía `@Roles` + `RolesGuard` |
| Validación | class-validator / class-transformer |
| Tests | Jest (unitarios) + Supertest (e2e) |

## 📋 Requisitos

- **Node.js ≥ 20**
- Una base de datos **PostgreSQL** (local o en la nube, p. ej. [Neon](https://neon.tech))
- El esquema de base de datos está en [`schema.sql`](./schema.sql) y debe ejecutarse una vez contra tu base

## 🔧 Configuración

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el .env a partir de la plantilla
cp .env.example .env

# 3. Completar las variables (ver tabla abajo)

# 4. Ejecutar schema.sql contra tu base de datos
#    (SQL Editor de Neon, pgAdmin o psql)
```

## 📄 Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `JWT_SECRET` | Secreto para firmar los tokens JWT | `6fb3d4f…` (aleatorio, 64 chars) |
| `JWT_EXPIRES_IN` | Expiración del token | `1h` |
| `PORT` | Puerto del servidor | `3000` |

Para generar un `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> El archivo `.env` no se sube al repositorio (está en `.gitignore`). La plantilla con valores de ejemplo está en `.env.example`.

## ▶️ Ejecución

```bash
# desarrollo (watch mode)
npm run start:dev

# build y producción
npm run build
npm run start:prod
```

La API queda disponible en `http://localhost:3000` con el prefijo global `/api` y CORS habilitado.

## 🗄️ Datos de ejemplo (seed)

El esquema está en `schema.sql` y hay un juego de datos demo reutilizable:

```bash
# 1. Aplicar el esquema una vez (SQL Editor de Neon, pgAdmin o psql): schema.sql

# 2. Poblar categorías y productos (13 categorías + 26 productos con fotos reales de Unsplash;
#    24 con imagen y 2 sin imagen para probar el caso "sin imagen" en el front)
node --env-file=.env scripts/seed.mjs

# 3. Crear usuarios demo por rol (CUSTOMER / ADMIN / DELIVERY) — idempotente
node --env-file=.env scripts/seed-users.mjs
```

Los seeds son **idempotentes** (`ON CONFLICT DO NOTHING`): se pueden re-ejecutar sin duplicar datos.
Al re-ejecutar `seed.mjs`, en productos solo se refresca `image_url`.

> **Si tu base ya existía antes de los módulos de pedidos/direcciones:** ejecuta una vez
> la migración que añade las columnas de envío y de entrega a la tabla `orders`
> (idempotente, también incluida al final de `schema.sql`):
>
> ```bash
> node --env-file=.env scripts/migrate-orders-shipping.mjs
> ```

### 👤 Usuarios demo

| Rol | Email | Contraseña |
|-----|-------|------------|
| CUSTOMER | `cliente@snack.store` | `Demo123!` |
| ADMIN | `admin@snack.store` | `Demo123!` |
| DELIVERY | `repartidor@snack.store` | `Demo123!` |

> Tabla completa y detalles de uso en [`TEST_USERS.md`](./TEST_USERS.md).

## 📖 Documentación de la API (Swagger / OpenAPI)

La API expone documentación interactiva generada con `@nestjs/swagger`:

- **Swagger UI** (explorar y probar los endpoints): `http://localhost:3000/api/docs`
- **Documento JSON**: `http://localhost:3000/api/docs-json`

Para generar un archivo `openapi.json` estático (p. ej. para entregarlo al frontend):

```bash
npm run generate:openapi   # genera ./openapi.json en la raíz
```

## 🔐 Autenticación

Todos los endpoints de autenticación viven bajo `/api/auth`.

### Registrar usuario

`POST /api/auth/register`

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan.perez@example.com",
    "password": "MiClaveSegura123!",
    "firstName": "Juan",
    "lastName": "Pérez",
    "phone": "+56912345678"
  }'
```

**Respuesta `201 Created`:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs…",
  "user": {
    "id": "8b1a2d5e-…",
    "email": "juan.perez@example.com",
    "firstName": "Juan",
    "lastName": "Pérez",
    "phone": "+56912345678",
    "role": "CUSTOMER"
  }
}
```

### Iniciar sesión

`POST /api/auth/login`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "juan.perez@example.com", "password": "MiClaveSegura123!"}'
```

**Respuesta `200 OK`:** `{ "access_token": "…", "user": { … } }`

### Perfil (endpoint protegido)

`GET /api/auth/profile` — requiere el header `Authorization: Bearer <token>`

```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer TU_TOKEN"
```

**Respuesta `200 OK`:** `{ "id": "…", "email": "…", "role": "CUSTOMER" }`

### Códigos de error comunes

| Código | Caso |
|--------|------|
| `400` | Payload inválido (no pasa la validación de class-validator) |
| `401` | Credenciales inválidas, token ausente, inválido o vencido |
| `403` | Token válido pero sin el rol requerido (p. ej. CUSTOMER en rutas de ADMIN) |
| `404` | Recurso no encontrado |
| `409` | Conflicto (email, SKU o slug duplicados) |

## 🏷️ Categorías y productos

Las **lecturas son públicas** (catálogo de la tienda); las **escrituras** (`POST`, `PATCH`, `DELETE`) requieren un token de un usuario con rol **ADMIN**.

```bash
# Obtener un token de admin (solo a modo de ejemplo: el registro crea CUSTOMER)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "…"}'
```

### Categorías — `/api/categories`

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| `GET` | `/api/categories` | Público | Lista paginada: `?page=&limit=&parentId=&active=` |
| `GET` | `/api/categories/:id` | Público | Detalle de una categoría |
| `POST` | `/api/categories` | ADMIN | Crear categoría (slug auto-generado si no se envía) |
| `PATCH` | `/api/categories/:id` | ADMIN | Actualizar categoría |
| `DELETE` | `/api/categories/:id` | ADMIN | Eliminar (204) |

```bash
# Listar (público)
curl "http://localhost:3000/api/categories?page=1&limit=20"

# Crear (ADMIN) — slug se genera solo: "frutas-frescas"
curl -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -d '{"name": "Frutas Frescas", "description": "Frutas de temporada"}'
```

**Respuesta `201 Created`:**

```json
{
  "id": "8b1a2d5e-…",
  "name": "Frutas Frescas",
  "slug": "frutas-frescas",
  "description": "Frutas de temporada",
  "parentId": null,
  "isActive": true,
  "createdAt": "2026-08-07T22:00:00.000Z"
}
```

### Productos — `/api/products`

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| `GET` | `/api/products` | Público | Lista paginada con filtros y búsqueda |
| `GET` | `/api/products/:id` | Público | Detalle con categoría incluida |
| `POST` | `/api/products` | ADMIN | Crear producto |
| `PATCH` | `/api/products/:id` | ADMIN | Actualizar producto |
| `DELETE` | `/api/products/:id` | ADMIN | Eliminar (204) |

**Filtros de `GET /api/products`:** `?page=&limit=&categoryId=&active=&search=` — `search` busca por nombre o SKU (case-insensitive).

```bash
# Listar con filtros (público)
curl "http://localhost:3000/api/products?categoryId=8b1a2d5e-…&search=manzana&page=1&limit=20"

# Crear (ADMIN)
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -d '{
    "sku": "MANZ-001",
    "name": "Manzana Roja",
    "categoryId": "8b1a2d5e-…",
    "price": 2.5,
    "salePrice": 1.99,
    "unit": "kg",
    "isPerishable": true
  }'
```

**Respuesta `201 Created`:**

```json
{
  "id": "f9463ea6-…",
  "categoryId": "8b1a2d5e-…",
  "category": { "id": "8b1a2d5e-…", "name": "Frutas Frescas", "slug": "frutas-frescas" },
  "sku": "MANZ-001",
  "name": "Manzana Roja",
  "slug": "manzana-roja",
  "description": null,
  "price": 2.5,
  "salePrice": 1.99,
  "unit": "kg",
  "isPerishable": true,
  "isOrganic": false,
  "imageUrl": null,
  "isActive": true,
  "createdAt": "2026-08-07T22:00:00.000Z",
  "updatedAt": "2026-08-07T22:00:00.000Z"
}
```

> Notas: `salePrice` debe ser menor que `price`. Enviar `null` en campos opcionales los limpia (p. ej. `salePrice` o `imageUrl`).

### 📤 Subida de imágenes — `/api/uploads/images`

`POST /api/uploads/images` (multipart/form-data, **ADMIN**): sube una imagen de producto, la guarda en `uploads/` y devuelve la `imageUrl` pública lista para enviarse al crear o editar un producto. Es **opcional**: los productos pueden crearse sin imagen.

- Campo del formulario: `image` (jpg, png, webp, gif o avif · máx. 5 MB)
- Se valida el mimetype **y la firma real del archivo** (magic bytes)
- La API sirve los archivos en `http://localhost:3000/uploads/<archivo>` con header `X-Content-Type-Options: nosniff`

```bash
curl -X POST http://localhost:3000/api/uploads/images \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -F "image=@/ruta/manzana.jpg"
```

**Respuesta `201 Created`:**

```json
{
  "imageUrl": "http://localhost:3000/uploads/3f2a9c….png",
  "fileName": "3f2a9c….png",
  "mimeType": "image/jpeg",
  "size": 48213
}
```

> Flujo típico del front: 1) subir la imagen → 2) usar la `imageUrl` devuelta como `imageUrl` al crear/editar el producto.

### 📦 Inventario — `/api/inventory`

Las **cantidades exactas de stock son privadas** (solo ADMIN). El catálogo público expone la **disponibilidad derivada** de cada producto: `inStock` (boolean) + `stockStatus` (`IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK`), calculada a partir del stock y del nivel mínimo.

```bash
# Productos públicos: incluyen inStock + stockStatus (sin cantidades exactas)
curl "http://localhost:3000/api/products?inStock=true"

# Inventario (ADMIN) — listar con stock exacto
curl http://localhost:3000/api/inventory \
  -H "Authorization: Bearer TU_TOKEN_ADMIN"

# Fijar stock (crea el registro si no existe)
curl -X PATCH http://localhost:3000/api/inventory/PRODUCT_ID \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"stockQuantity": 50, "minStockLevel": 5}'

# Ajustar por delta (suma o resta; no puede quedar negativo)
curl -X POST http://localhost:3000/api/inventory/PRODUCT_ID/adjust \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"quantity": -3}'
```

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| `GET` | `/api/inventory` | ADMIN | Lista paginada con producto y stock (`?page=&limit=&search=`) |
| `GET` | `/api/inventory/:productId` | ADMIN | Stock exacto de un producto |
| `PATCH` | `/api/inventory/:productId` | ADMIN | Fijar stock (upsert) |
| `POST` | `/api/inventory/:productId/adjust` | ADMIN | Ajustar por delta (200) |

> El seed carga stock variado a propósito: 2 productos agotados y 3 en nivel bajo para probar los tres estados en el front.

### 📍 Direcciones de envío — `/api/addresses`

Cada usuario tiene su propia libreta de direcciones. La primera que crea se vuelve la **principal** (`isDefault`); al marcar una nueva como principal, las demás se desmarcan. Todo endpoint requiere autenticación y **solo opera sobre las direcciones del propio usuario** (las ajenas dan `404`).

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/addresses` | Mis direcciones (la principal primero) |
| `POST` | `/api/addresses` | Crear dirección (la primera → principal) |
| `GET` | `/api/addresses/:id` | Detalle de una dirección propia |
| `PATCH` | `/api/addresses/:id` | Actualizar (puede marcarse como principal) |
| `DELETE` | `/api/addresses/:id` | Eliminar (204); si era la principal, la más antigua la sucede |

```bash
curl -X POST http://localhost:3000/api/addresses \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addressLine1": "Av. Providencia 1234", "city": "Santiago", "isDefault": true}'
```

### 🧾 Pedidos y pagos — `/api/orders`

El checkout convierte el carrito en un pedido: valida el stock real en ese momento, **congela los precios** en `order_items` (historial inmutable aunque el producto cambie), **congela la dirección de envío** elegida (`shippingAddress` snapshot), descuenta el inventario de forma atómica y crea el **pago simulado**.

**Pagos simulados** (sin pasarela externa todavía):

| Método | Comportamiento |
|--------|----------------|
| `CREDIT_CARD` / `DEBIT_CARD` | Se "cobra" al instante → `payment COMPLETED` y pedido `PAID` |
| `TRANSFER` | Queda `PENDING` hasta que un ADMIN confirme el pago (pedido → `PAID`) |
| `CASH_ON_DELIVERY` | Queda `PENDING` y se marca `COMPLETED` al entregar |

**Ciclo de vida del pedido:** `PENDING → PAID → PREPARING → OUT_FOR_DELIVERY → DELIVERED` (o `CANCELLED`).

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| `POST` | `/api/orders` | Autenticado | Checkout: convierte el carrito en pedido y crea el pago |
| `GET` | `/api/orders/me` | Autenticado | Mis pedidos (`?page=&limit=&status=`) |
| `GET` | `/api/orders` | ADMIN/DELIVERY | Todos los pedidos, paginado y filtrable por estado |
| `GET` | `/api/orders/:id` | Dueño/ADMIN/DELIVERY | Detalle con items, pago y quién entregó |
| `POST` | `/api/orders/:id/deliver` | ADMIN/DELIVERY | **Confirmar la entrega** (endpoint único del repartidor) |
| `GET` | `/api/orders/deliveries/me` | ADMIN/DELIVERY | **Reporte de mis entregas** con resumen agregado |
| `GET` | `/api/orders/deliveries` | ADMIN | Reporte de entregas de cualquier repartidor (`?userId=`) |
| `GET` | `/api/orders/report/sales` | **Solo ADMIN** | **Reporte de ventas** (resumen, por día, top productos, por método de pago) |
| `PATCH` | `/api/orders/:id/status` | Según rol | Cambiar estado (ver abajo) |

```bash
# 1. Agregar al carrito
curl -X POST http://localhost:3000/api/carts/me/items \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId": "8b1a2d5e-…", "quantity": 2}'

# 2. Checkout con tarjeta y dirección guardada (pago simulado, queda PAID)
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addressId": "8b1a2d5e-…", "paymentMethod": "CREDIT_CARD"}'
```

**Respuesta `201 Created` (resumen):**

```json
{
  "id": "…",
  "orderNumber": 42,
  "status": "PAID",
  "subtotal": 3.98,
  "deliveryFee": 0,
  "total": 3.98,
  "shippingAddress": {
    "addressLine1": "Av. Providencia 1234",
    "addressLine2": null,
    "city": "Santiago",
    "stateProvince": null,
    "postalCode": null,
    "deliveryNotes": null
  },
  "items": [
    {
      "productId": "…",
      "productName": "Manzana Roja",
      "unitPrice": 1.99,
      "quantity": 2,
      "subtotal": 3.98
    }
  ],
  "payment": {
    "id": "…",
    "method": "CREDIT_CARD",
    "status": "COMPLETED",
    "transactionId": "SIM-1A2B3C4D",
    "amount": 3.98
  }
}
```

**Cambios de estado (`PATCH /api/orders/:id/status`):**

| Acción | Rol | Transición |
|--------|-----|------------|
| Confirmar pago por transferencia | ADMIN | `PENDING → PAID` |
| Empezar a preparar | ADMIN | `PENDING/PAID → PREPARING` |
| En ruta de reparto | ADMIN o DELIVERY | `PREPARING → OUT_FOR_DELIVERY` |
| Entregado (cobra el pago contra entrega) | ADMIN o DELIVERY | `OUT_FOR_DELIVERY → DELIVERED` |
| Cancelar pedido (reembolso si ya se cobró; devuelve el stock) | Dueño (PENDING/PAID) o ADMIN | `→ CANCELLED` |

**Confirmar la entrega con un clic** (`POST /api/orders/:id/deliver`): el repartidor cierra el pedido cuando lo entrega. Solo funciona en pedidos `OUT_FOR_DELIVERY`, **registra quién lo entregó** (`deliveredBy`) y cobra los pagos contra entrega.

```bash
# El repartidor confirma la entrega
curl -X POST http://localhost:3000/api/orders/ID_PEDIDO/deliver \
  -H "Authorization: Bearer TOKEN_REPARTIDOR"
```

**Respuesta `200 OK`:** el pedido queda `DELIVERED` con el repartidor registrado:

```json
{
  "id": "…",
  "orderNumber": 42,
  "status": "DELIVERED",
  "deliveredBy": { "id": "…", "email": "repartidor@snack.store", "firstName": "…", "lastName": "…" },
  "total": 3.98,
  "payment": { "method": "CASH_ON_DELIVERY", "status": "COMPLETED", "amount": 3.98 }
}
```

> Al cancelar, el stock vuelve al inventario y el pago pasa a `REFUNDED` (si estaba `COMPLETED`) o `FAILED`.

> **La dirección es fija al confirmar:** si el pedido incluye `addressId`, se guarda una copia (`shippingAddress`) en el pedido. Editar o borrar la dirección de la libreta después no afecta al pedido ya creado.

> **Quién entregó:** al marcar `DELIVERED` (vía `/deliver` o `PATCH status`), el pedido queda asociado al usuario que confirmó la entrega (`deliveredBy`).

**Reporte de ventas** (`GET /api/orders/report/sales`, **solo ADMIN**): métricas globales del negocio para el panel de administración. Cuenta como venta todo pedido pagado o en proceso (`PAID → DELIVERED`); quedan fuera `PENDING` (pago sin confirmar) y `CANCELLED`. Filtros: `?from=&to=&topLimit=`.

```bash
curl "http://localhost:3000/api/orders/report/sales?from=2026-08-01T00:00:00.000Z&topLimit=5" \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

**Respuesta `200 OK`:**

```json
{
  "range": { "from": "2026-08-01T00:00:00.000Z", "to": null },
  "summary": { "totalOrders": 42, "totalAmount": 385.2, "averageTicket": 9.17 },
  "byDay": [{ "date": "2026-08-08", "orders": 12, "amount": 110.4 }],
  "topProducts": [{ "productId": "…", "productName": "Manzana Roja", "quantity": 28, "amount": 55.7 }],
  "byPaymentMethod": [{ "method": "CREDIT_CARD", "orders": 30, "amount": 280.1 }]
}
```

**Reporte de entregas** (`GET /api/orders/deliveries/me`): el repartidor ve su historial paginado de entregas con un **resumen agregado** (total entregado, monto cobrado y entregas de hoy). Filtros opcionales: `?page=&limit=&from=&to=`. El ADMIN puede ver las entregas de cualquier repartidor con `GET /api/orders/deliveries?userId=ID`.

```bash
# Repartidor: mi historial con resumen
curl "http://localhost:3000/api/orders/deliveries/me?from=2026-08-01T00:00:00.000Z" \
  -H "Authorization: Bearer TOKEN_REPARTIDOR"
```

**Respuesta `200 OK`:**

```json
{
  "data": [{ "id": "…", "status": "DELIVERED", "total": 3.98, "deliveredBy": { … } }],
  "total": 12,
  "page": 1,
  "limit": 20,
  "totalPages": 1,
  "summary": {
    "totalDelivered": 12,
    "totalAmount": 47.85,
    "todayDelivered": 3,
    "todayAmount": 11.94
  }
}
```

### 🛒 Carrito de compras — `/api/carts`

El carrito es **por usuario autenticado** (cualquier rol; el front usa la cuenta CUSTOMER). Se crea automáticamente la primera vez que se accede. Cada item incluye el producto con su **precio efectivo** (usa `salePrice` si existe) y el subtotal calculado.

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| `GET` | `/api/carts/me` | Autenticado | Ver mi carrito (se crea si no existe) |
| `POST` | `/api/carts/me/items` | Autenticado | Agregar producto `{productId, quantity}` (si ya está, suma la cantidad) |
| `PATCH` | `/api/carts/me/items/:productId` | Autenticado | Fijar la cantidad `{quantity}` |
| `DELETE` | `/api/carts/me/items/:productId` | Autenticado | Quitar un producto (204) |
| `DELETE` | `/api/carts/me` | Autenticado | Vaciar el carrito (204) |

```bash
# Agregar al carrito (con el token de cliente@snack.store)
curl -X POST http://localhost:3000/api/carts/me/items \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId": "8b1a2d5e-0001-4f00-8000-000000000001", "quantity": 2}'
```

**Respuesta `201 Created` (resumen):**

```json
{
  "id": "…",
  "items": [
    {
      "productId": "8b1a2d5e-…",
      "quantity": 2,
      "product": { "name": "Manzana Roja", "price": 2.5, "salePrice": 1.99, "inStock": true, "stockStatus": "IN_STOCK", "imageUrl": "…" },
      "subtotal": 3.98
    }
  ],
  "itemsCount": 1,
  "subtotal": 3.98
}
```

> El stock exacto se valida al momento de crear el pedido (checkout), no al agregar al carrito.

## 🧪 Tests

```bash
# tests unitarios (Jest)
npm test

# tests e2e (requieren .env con DATABASE_URL)
npm run test:e2e

# cobertura
npm run test:cov

# lint
npm run lint
```

> Los tests **e2e** se ejecutan contra la base de datos real definida en `DATABASE_URL` y limpian sus propios datos de prueba al finalizar.

## 🗂️ Estructura del proyecto

```
src/
├── auth/                 # Autenticación (register, login, profile, JWT, roles)
│   ├── dto/              # DTOs con validación
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts   # Estrategia Passport JWT
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts    # Autorización por rol (ADMIN)
│   └── roles.decorator.ts
├── categories/           # Categorías (público + ADMIN)
│   ├── dto/
│   ├── category.entity.ts
│   ├── categories.service.ts
│   ├── categories.controller.ts
│   └── categories.module.ts
├── products/             # Productos (público + ADMIN)
│   ├── dto/
│   ├── product.entity.ts
│   ├── products.service.ts
│   ├── products.controller.ts
│   └── products.module.ts
├── uploads/              # Subida de imágenes de producto (solo ADMIN)
│   ├── uploads.controller.ts
│   ├── uploads.module.ts
│   ├── uploads.constants.ts
│   └── image.validator.ts  # Valida la firma real (magic bytes) de la imagen
├── inventory/            # Inventario y disponibilidad (solo ADMIN)
│   ├── dto/
│   ├── inventory.entity.ts
│   ├── inventory.service.ts
│   ├── inventory.controller.ts
│   ├── inventory.module.ts
│   └── inventory.utils.ts   # Derivación de IN_STOCK / LOW_STOCK / OUT_OF_STOCK
├── carts/                # Carrito de compras por usuario (autenticado)
│   ├── dto/
│   ├── cart.entity.ts
│   ├── cart-item.entity.ts
│   ├── carts.service.ts
│   ├── carts.controller.ts
│   └── carts.module.ts
├── addresses/            # Libreta de direcciones de envío por usuario
│   ├── dto/
│   ├── address.entity.ts
│   ├── addresses.service.ts
│   ├── addresses.controller.ts
│   └── addresses.module.ts
├── orders/               # Pedidos y pagos (checkout desde el carrito)
│   ├── dto/
│   ├── order.entity.ts
│   ├── order-item.entity.ts
│   ├── payment.entity.ts
│   ├── payments.service.ts   # Pago simulado (tarjeta/transferencia/contra entrega)
│   ├── orders.service.ts
│   ├── orders.controller.ts
│   └── orders.module.ts
├── users/                # Entidad User y módulo de usuarios
│   ├── user.entity.ts
│   └── users.module.ts
├── common/               # Helpers compartidos (slugify, pagination, db-errors)
├── app.module.ts         # ConfigModule + TypeOrmModule
└── main.ts               # Bootstrap (prefijo /api, CORS, ValidationPipe)
schema.sql                # Esquema de la base de datos
seed.sql                  # Datos demo (categorías y productos con fotos)
scripts/                  # Scripts auxiliares (seed, usuarios demo, openapi, migraciones)
├── migrate-orders-shipping.mjs   # Migración idempotente de columnas de envío/entrega
test/                     # Tests e2e
```

## 🌿 Flujo de trabajo (Git Flow)

- `main` — rama de producción
- `develop` — rama de integración
- `feature/*` — una rama por funcionalidad, integrada a `develop` vía Pull Request

## 🗺️ Roadmap

- [x] Autenticación (registro / login / JWT)
- [x] Categorías y productos (CRUD con roles)
- [x] Inventario (stock con disponibilidad pública y gestión solo ADMIN)
- [x] Carrito de compras (agregar / actualizar / quitar items)
- [x] Pedidos y pagos (checkout con pago simulado y ciclo de estados)
- [x] Direcciones de envío (libreta por usuario + snapshot inmutable en el pedido)
- [x] Reporte de ventas y entregas (solo ADMIN / repartidor)
- [ ] Pasarela de pago real (Stripe / Mercado Pago / Transbank)
