-- DE XUAT cho KIM: bang categories va products theo ERD.
-- KIM quan ly migration chung; dat lai so phien ban (V2) cho dung thu tu migration cua nhom.
-- Quy uoc ERD: PK/FK dung UUID, ten bang so nhieu, snake_case, thoi gian co hau to _at.

CREATE TABLE categories (
    category_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    product_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id  UUID NOT NULL REFERENCES categories (category_id),
    product_name VARCHAR(150) NOT NULL,
    description  TEXT,
    unit_price   NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category_id ON products (category_id);
