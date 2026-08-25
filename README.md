# snack-store-api

API REST para un sistema de venta de comestibles en línea construida con **NestJS 11** y **TypeScript**.

## 🚀 Stack

| Capa | Tecnología |
|------|------------|
| Framework | [NestJS 11](https://nestjs.com) + TypeScript |
| Base de datos | PostgreSQL (TypeORM) |
| Autenticación | JWT (Passport) + bcrypt + refresh tokens con rotación y revocación (logout) |
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
| `CORS_ORIGINS` | Orígenes permitidos para llamar a la API (separados por coma) | `http://localhost:4200,https://gaelectronica.free.je` |
| `PAYMENT_NEQUI_NUMBER` | Número de Nequi donde los clientes pagan (se muestra en el pedido) | `3001234567` |
| `PAYMENT_DAVIPLATA_NUMBER` | Número de Daviplata donde los clientes pagan (se muestra en el pedido) | `3011234567` |

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

La API queda disponible en `http://localhost:3000` con el prefijo global `/api`. El CORS está **restringido a los orígenes de `CORS_ORIGINS`** (default `http://localhost:4200,https://gaelectronica.free.je`); cuando subas el frontend, añade tu dominio a esa variable.

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
>
> **Si tu base ya existía antes de este cambio de pagos:** ejecuta una vez la
> migración que añade los métodos `NEQUI` y `DAVIPLATA` al enum `payment_method`
> (idempotente):
>
> ```bash
> node --env-file=.env scripts/migrate-payment-methods.mjs
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

Los endpoints de **pedidos** documentan sus respuestas con schemas completos
(`OrderResponseDto`, `SalesReportResponseDto`, etc.), así que en la doc verás
campos como `payment.walletNumber` (el número de la billetera del comercio)
y `paymentInstructions` (los números de Nequi/Daviplata del reporte de ventas).
Si el frontend genera tipos desde el OpenAPI, estas interfaces salen solas.

Para generar un archivo `openapi.json` estático (p. ej. para entregarlo al frontend):

```bash
npm run generate:openapi   # genera ./openapi.json en la raíz
```

## 🔒 Seguridad

La API incluye múltiples capas de protección:

### Headers de seguridad HTTP

- **Helmet**: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, etc.
- **Cross-Origin-Resource-Policy**: `cross-origin` para que el frontend pueda mostrar las imágenes de `/uploads`.
- **X-Content-Type-Options**: `nosniff` en archivos estáticos para prevenir MIME sniffing.

### Rate limiting

- **Global**: 100 peticiones/minuto por key (IP para no autenticados, IP+userId para autenticados).
- **Login/Register/Refresh**: 10 peticiones/minuto por key (protección contra fuerza bruta).
- **Respuesta**: `429 Too Many Requests` al superar el límite.

### Autenticación y sesiones

- **JWT con rotación**: Access tokens de 1h (configurable) + refresh tokens de 7d con rotación.
- **Refresh token cookie**: Se envía como `httpOnly`, `secure`, `sameSite=strict` (protección contra XSS y CSRF).
- **Blacklist de tokens**: Logout revoca el access token (blacklist) y el refresh token.
- **Detección de robo**: Reusar un refresh token revoca todas las sesiones del usuario.

### Validación de entrada

- **ValidationPipe global**: `whitelist=true` (elimina propiedades extra), `forbidNonWhitelisted=true` (400 si hay propiedades desconocidas), `transform=true`.
- **Contraseña fuerte**: Mínimo 8 caracteres, al menos 1 mayúscula, 1 minúscula y 1 número.
- **DTOs validados**: Todos los endpoints usan `class-validator` con decoradores.

### Protección de archivos

- **Uploads**: Solo ADMIN puede subir imágenes (JWT + RolesGuard).
- **Validación de firma**: Se verifica la firma real del archivo (magic bytes), no solo el mimetype.
- **Límite de tamaño**: 5 MB máximo por imagen.
- **Cache**: Headers `Cache-Control: public, max-age=86400` para imágenes.

### Análisis de seguridad

- **ESLint Security**: Plugins `eslint-plugin-security` y `eslint-plugin-security-node` para detección estática de vulnerabilidades.
- **npm audit**: Dependencias auditadas y actualizadas.
- **gitleaks**: Detección de secretos hardcodeados (configurado en `.gitleaks.toml`).
- **TypeScript strict**: Habilitado `strict: true` para mayor seguridad de tipos.

### Swagger (OpenAPI)

- **Protegido en producción**: Swagger UI (`/api/docs`) solo está disponible cuando `NODE_ENV !== 'production'`.
- **Desarrollo**: En desarrollo, Swagger está disponible en `http://localhost:3000/api/docs`.

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
  "refresh_token": "b7Zk…token opaco de 64 caracteres…",
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

**Respuesta `200 OK`:** `{ "access_token": "…", "refresh_token": "…", "user": { … } }`

### Renovar la sesión (refresh token)

`POST /api/auth/refresh` — canjea un refresh token por un **nuevo par** de tokens. El refresh token presentado se **rota** (queda revocado y se emite uno nuevo); reutilizar un token ya rotado se considera robo y **revoca todas las sesiones** del usuario.

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "b7Zk…token opaco…"}'
```

**Respuesta `200 OK`:** `{ "access_token": "…nuevo…", "refresh_token": "…nuevo…", "user": { … } }`

### Cerrar sesión (logout) — revocación de JWT

`POST /api/auth/logout` — revoca el **access token** actual (se añade a una blacklist hasta su expiración, ya no sirve) y, si se envía, también el **refresh token**. Requiere `Authorization: Bearer <token>`.

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "b7Zk…token opaco…"}'
```

**Respuesta `200 OK`:** sin contenido. A partir de ese momento, usar el access token revocado devuelve `401 Unauthorized`.

> Los refresh tokens son **opacos** (64 caracteres aleatorios) y se guardan **hasheados** (SHA-256) en la tabla `refresh_tokens` — nunca en claro. Su vida la controla `REFRESH_TOKEN_EXPIRES_IN` (default `7d`).
>
> **Límite conocido:** ante la detección de un token reutilizado se revocan los refresh tokens de todas las sesiones del usuario, pero los access tokens ya emitidos siguen válidos hasta su expiración (`JWT_EXPIRES_IN`, default `1h`). La rotación es atómica (UPDATE condicional), por lo que dos peticiones concurrentes con el mismo token no pueden obtener dos pares válidos.

### Perfil (endpoint protegido)

`GET /api/auth/profile` — requiere el header `Authorization: Bearer <token>`

```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer TU_TOKEN"
```

**Respuesta `200 OK`:** `{ "id": "…", "email": "…", "role": "CUSTOMER" }`

### 👤 Usuarios y perfil — `/api/users`

Cada usuario autenticado puede ver y editar **su propio perfil** y **cambiar su contraseña**. La gestión de usuarios (listar, ver detalle, cambiar rol) es **solo ADMIN**.

| Método | Endpoint | Acceso | Descripción |
|--------|----------|--------|-------------|
| `GET` | `/api/users/me` | Autenticado | Mi perfil completo |
| `PATCH` | `/api/users/me` | Autenticado | Editar mi perfil (`firstName`, `lastName`, `phone`) |
| `POST` | `/api/users/me/change-password` | Autenticado | Cambiar mi contraseña (exige la actual) |
| `GET` | `/api/users` | ADMIN | Listar usuarios paginado: `?page=&limit=&role=&search=` |
| `GET` | `/api/users/:id` | ADMIN | Detalle de un usuario |
| `PATCH` | `/api/users/:id/role` | ADMIN | Cambiar el rol de un usuario (no el propio) |

```bash
# Mi perfil
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer TU_TOKEN"

# Editar perfil (null en phone lo limpia)
curl -X PATCH http://localhost:3000/api/users/me \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"firstName": "Juan", "phone": "+56912345678"}'

# Cambiar contraseña
curl -X POST http://localhost:3000/api/users/me/change-password \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "MiClaveSegura123!", "newPassword": "MiNuevaClave456!"}'

# ADMIN: promueve a un usuario a repartidor
curl -X PATCH http://localhost:3000/api/users/ID_USUARIO/role \
  -H "Authorization: Bearer TU_TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"role": "DELIVERY"}'
```

**Respuesta `200 OK` (perfil):**

```json
{
  "id": "8b1a2d5e-…",
  "email": "juan.perez@example.com",
  "firstName": "Juan",
  "lastName": "Pérez",
  "phone": "+56912345678",
  "role": "CUSTOMER",
  "createdAt": "2026-08-07T22:00:00.000Z",
  "updatedAt": "2026-08-07T22:00:00.000Z"
}
```

> El ADMIN no puede cambiar su **propio** rol (evita dejar el sistema sin administradores) y el `email` no se puede editar por perfil.
>
> Al cambiar la contraseña, los tokens JWT **ya emitidos siguen siendo válidos** hasta su expiración (el JWT es stateless); el usuario debe volver a iniciar sesión si quiere refrescar su token.

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

**Pagos** (sin pasarela externa todavía):

| Método | Comportamiento |
|--------|----------------|
| `NEQUI` | Queda `PENDING` hasta que un ADMIN confirme el pago (pedido → `PAID`). La respuesta incluye `payment.walletNumber` con el número de Nequi del comercio |
| `DAVIPLATA` | Queda `PENDING` hasta que un ADMIN confirme el pago (pedido → `PAID`). La respuesta incluye `payment.walletNumber` con el número de Daviplata del comercio |
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
| `GET` | `/api/orders/report/sales/export` | **Solo ADMIN** | **Exportar el reporte de ventas a CSV** (descarga) |
| `PATCH` | `/api/orders/:id/status` | Según rol | Cambiar estado (ver abajo) |

```bash
# 1. Agregar al carrito
curl -X POST http://localhost:3000/api/carts/me/items \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId": "8b1a2d5e-…", "quantity": 2}'

# 2. Checkout con Nequi y dirección guardada (queda PENDING hasta confirmar el pago)
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addressId": "8b1a2d5e-…", "paymentMethod": "NEQUI"}'
```

**Respuesta `201 Created` (resumen):**

```json
{
  "id": "…",
  "orderNumber": 42,
  "status": "PENDING",
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
    "method": "NEQUI",
    "status": "PENDING",
    "transactionId": null,
    "amount": 3.98,
    "walletNumber": "3001234567"
  }
}
```

> Con `NEQUI` / `DAVIPLATA` el pedido nace `PENDING`: el cliente paga a ese número y un ADMIN confirma el cobro con `PATCH /api/orders/:id/status` → `PAID` (el pago pasa a `COMPLETED`).

**Cambios de estado (`PATCH /api/orders/:id/status`):**

| Acción | Rol | Transición |
|--------|-----|------------|
| Confirmar pago (Nequi/Daviplata) | ADMIN | `PENDING → PAID` |
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
  "byPaymentMethod": [{ "method": "NEQUI", "orders": 30, "amount": 280.1 }],
  "paymentInstructions": [
    { "method": "NEQUI", "walletNumber": "3001234567" },
    { "method": "DAVIPLATA", "walletNumber": "3011234567" },
    { "method": "CASH_ON_DELIVERY", "walletNumber": null }
  ]
}
```

**Exportar a CSV** (`GET /api/orders/report/sales/export`, **solo ADMIN**): descarga el mismo reporte como archivo `.csv` (compatible con Excel: BOM UTF-8 para los acentos y CRLF). Incluye 5 secciones: resumen, ventas por día, top productos, desglose por método de pago e **instrucciones de pago** (el número de Nequi y Daviplata del comercio para compartir con los clientes). Acepta los mismos filtros (`?from=&to=&topLimit=`).

```bash
# Descargar el CSV (guarda la respuesta como archivo)
curl "http://localhost:3000/api/orders/report/sales/export?from=2026-08-01T00:00:00.000Z" \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -o reporte-ventas.csv
```

**Respuesta `200 OK`:** archivo `text/csv` con header `Content-Disposition: attachment; filename="reporte-ventas-AAAA-MM-DD.csv"`.

```csv
Reporte de ventas
Generado,2026-08-08T12:00:00.000Z
Rango,Desde 2026-08-01T00:00:00.000Z

Resumen
Metrica,Valor
Pedidos vendidos,42
Monto total,385.20
Ticket promedio,9.17

Ventas por día
Fecha,Pedidos,Monto
2026-08-08,12,110.40

Top productos (por monto)
Producto,Unidades,Monto
Manzana Roja,28,55.70

Desglose por método de pago
Metodo,Pedidos,Monto
NEQUI,30,280.10

Instrucciones de pago
Metodo,Detalle
Nequi,3001234567
Daviplata,3011234567
Efectivo contra entrega,Se cobra al entregar
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

## 🖥️ Cambios para el Frontend

### 1. Refresh token via cookie (recomendado)

El refresh token ahora se envía como **cookie httpOnly** en login, register y refresh. El frontend puede seguir enviándolo en el body para backward compatibility, pero la cookie es la forma recomendada.

**Si usas Angular HttpClient con `withCredentials: true`:**

```typescript
// Configurar HttpClient para enviar/recibir cookies
const httpOptions = {
  withCredentials: true  // Enviar y recibir cookies
};

// Login
this.http.post('/api/auth/login', { email, password }, httpOptions)
  .subscribe(res => {
    // access_token viene en el body
    // refresh_token viene en la cookie httpOnly (automático)
    localStorage.setItem('access_token', res.access_token);
  });
```

**Si prefieres enviar el refresh token en el body (backward compatible):**

```typescript
// El endpoint acepta refreshToken en el body O en la cookie
// Si no envías refreshToken en el body, lee la cookie automáticamente
this.http.post('/api/auth/refresh', { refreshToken: token }, httpOptions)
```

**Configuración de CORS en el backend:**

```env
# En tu .env del backend
CORS_ORIGINS=http://localhost:4200,https://tu-dominio.com
```

### 2. Validación de contraseña

Las contraseñas ahora requieren:
- Mínimo 8 caracteres
- Al menos 1 letra mayúscula
- Al menos 1 letra minúscula
- Al menos 1 número

**Actualizar el formulario de registro:**

```typescript
// Validación en el frontend
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

if (!passwordPattern.test(password)) {
  // Mostrar error: "La contraseña debe tener mayúscula, minúscula y número"
}
```

### 3. Manejo de rate limiting

El backend devuelve `429 Too Many Requests` cuando se supera el límite.

**Manejar en el frontend:**

```typescript
import { HttpErrorResponse } from '@angular/common/http';

this.authService.login(credentials).subscribe({
  error: (err: HttpErrorResponse) => {
    if (err.status === 429) {
      // Mostrar: "Demasiados intentos. Espera un minuto."
      this.showError('Demasiados intentos de inicio de sesión. Espera un minuto.');
    }
  }
});
```

### 4. Headers de cache para imágenes

Las imágenes de `/uploads/` ahora tienen cache de 1 día. No necesitas cambios en el frontend, pero si necesitas forzar recarga:

```typescript
// Para bustear cache de una imagen
const imageUrl = `${baseUrl}/uploads/${filename}?t=${Date.now()}`;
```

### 5. Cambios en el logout

El logout ahora elimina la cookie del refresh token automáticamente.

```typescript
// Logout (con cookie)
this.http.post('/api/auth/logout', { refreshToken }, { withCredentials: true })
  .subscribe(() => {
    localStorage.removeItem('access_token');
    // La cookie se elimina automáticamente
  });
```

### 6. Resumen de cambios

| Cambio | Impacto en Frontend | Acción requerida |
|--------|---------------------|------------------|
| Refresh token cookie | Opcional (backward compatible) | Agregar `withCredentials: true` si usas cookie |
| Contraseña fuerte | Formulario de registro | Validar patrón de contraseña |
| Rate limiting 429 | Manejo de errores | Mostrar mensaje de espera |
| Cache imágenes | Ninguno | Opcional: bustear cache |
| Swagger protegido | Ninguno | Solo disponible en desarrollo |

---

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
├── auth/                 # Autenticación (register, login, refresh, logout, JWT, roles)
│   ├── dto/              # DTOs con validación
│   ├── refresh-token.entity.ts   # Refresh tokens opacos (hasheados) con rotación
│   ├── revoked-token.entity.ts   # Blacklist de access tokens revocados (logout)
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts   # Estrategia Passport JWT + verificación de blacklist
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
│   │   ├── order-response.dto.ts       # DTOs de respuesta (OrderResponseDto, walletNumber, …)
│   │   └── sales-report-response.dto.ts # DTO de respuesta del reporte (paymentInstructions)
│   ├── order.entity.ts
│   ├── order-item.entity.ts
│   ├── payment.entity.ts
│   ├── payments.service.ts   # Pago simulado (nequi/daviplata/contra entrega)
│   ├── orders.service.ts
│   ├── orders.controller.ts
│   ├── sales-csv.ts          # Serializa el reporte de ventas a CSV (export)
│   └── orders.module.ts
├── users/                # Perfil propio y gestión de usuarios (solo ADMIN)
│   ├── dto/              # DTOs con validación
│   ├── user.entity.ts
│   ├── users.service.ts
│   ├── users.controller.ts
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
