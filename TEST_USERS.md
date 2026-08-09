# Usuarios de prueba (para el front)

Credenciales demo para probar la app. Creadas con `node --env-file=.env scripts/seed-users.mjs`.

## Usuarios con credenciales conocidas

| Rol      | Email                 | Contraseña | Acceso |
|----------|-----------------------|------------|--------|
| CUSTOMER | `cliente@snack.store` | `Demo123!` | Navegar, comprar (futuro carrito/pedidos) |
| ADMIN    | `admin@snack.store`   | `Demo123!` | Crear/editar/eliminar productos y categorías, **subir imágenes** |
| DELIVERY | `repartidor@snack.store` | `Demo123!` | Futuro módulo de entregas |

> Todos con la misma contraseña `Demo123!` para simplificar las pruebas.

## Endpoints de auth

- Registro (siempre crea CUSTOMER): `POST /api/auth/register`
- Login: `POST /api/auth/login`

```json
// login
{
  "email": "admin@snack.store",
  "password": "Demo123!"
}
```

Respuesta:

```json
{
  "access_token": "eyJhbGciOi...",
  "user": { "id": "...", "email": "admin@snack.store", "role": "ADMIN", ... }
}
```

El `access_token` se envía como `Authorization: Bearer <token>` en las rutas protegidas.

## Otros usuarios en la BD (creados antes, contraseña NO conocida)

| Rol      | Email                    | Nombre     |
|----------|--------------------------|------------|
| CUSTOMER | `demo2@snackstore.local` | Demo Dos   |
| CUSTOMER | `juan.perez@example.com` | Juan Pérez |

Si el front necesita cuentas CUSTOMER adicionales con credenciales conocidas, puede registrarlas vía `POST /api/auth/register`.
