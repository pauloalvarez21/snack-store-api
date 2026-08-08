-- PostgreSQL Schema para Sistema de Venta de Comestibles

-- 1. Extensiones útiles (UUIDs y búsqueda por texto)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enums
CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN', 'DELIVERY');
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'CASH_ON_DELIVERY', 'TRANSFER');

-- 3. Tabla de Usuarios
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role user_role DEFAULT 'CUSTOMER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Direcciones de Envío
CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    delivery_notes TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Categorías de Productos (Soporta Subcategorías)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Productos Comestibles
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    sale_price DECIMAL(10, 2) CHECK (sale_price IS NULL OR sale_price < price),
    unit VARCHAR(20) NOT NULL, -- ej: 'kg', 'g', 'litro', 'unidad', 'pack'
    is_perishable BOOLEAN DEFAULT false, -- Indica si es perecedero
    is_organic BOOLEAN DEFAULT false,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Inventario
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_quantity DECIMAL(10, 3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0), -- Soporta decimales (ej: 2.5 kg)
    min_stock_level DECIMAL(10, 3) DEFAULT 5,
    expiration_date DATE, -- Para control de frescura/caducidad
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Carritos de Compra
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE, -- 1 carrito activo por usuario
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 3) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_cart_product UNIQUE (cart_id, product_id)
);

-- 9. Pedidos (Orders)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number SERIAL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
    status order_status DEFAULT 'PENDING',
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    delivery_slot_start TIMESTAMP WITH TIME ZONE, -- Franja horaria de entrega
    delivery_slot_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Detalle del Pedido
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL, -- Copia para mantener historial si el producto cambia
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity DECIMAL(10, 3) NOT NULL CHECK (quantity > 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0)
);

-- 11. Pagos
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method payment_method NOT NULL,
    status payment_status DEFAULT 'PENDING',
    transaction_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices recomendados para optimizar búsquedas
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_inventory_product ON inventory(product_id);