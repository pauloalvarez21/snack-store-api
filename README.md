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
├── users/                # Entidad User y módulo de usuarios
│   ├── user.entity.ts
│   └── users.module.ts
├── common/               # Helpers compartidos (slugify, pagination, db-errors)
├── app.module.ts         # ConfigModule + TypeOrmModule
└── main.ts               # Bootstrap (prefijo /api, CORS, ValidationPipe)
schema.sql                # Esquema de la base de datos
test/                     # Tests e2e
```

## 🌿 Flujo de trabajo (Git Flow)

- `main` — rama de producción
- `develop` — rama de integración
- `feature/*` — una rama por funcionalidad, integrada a `develop` vía Pull Request

## 🗺️ Roadmap

- [x] Autenticación (registro / login / JWT)
- [x] Categorías y productos (CRUD con roles)
- [ ] Inventario
- [ ] Carrito de compras
- [ ] Pedidos y pagos
- [ ] Direcciones de envío
