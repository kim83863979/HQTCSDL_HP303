# Module San pham va Danh muc (Nghia) - Sprint 1 - Node.js

API chi doc du lieu tu PostgreSQL. Bang: `categories`, `products` (theo ERD cua nhom).
Cong nghe: Node.js (>= 20.6), Express 5, `pg` (node-postgres), truy van SQL truc tiep, khong dung ORM.

## Cau truc
```
src/modules/product/   routes -> service -> repository (SQL)
src/modules/category/  routes -> service -> repository (SQL)
src/shared/            loi chung, kiem tra tham so
src/config/db.js       ket noi PostgreSQL (DATABASE_URL)
db/                    migration de xuat cho Kim + du lieu mau
test/                  test tich hop
docs/                  bo request Postman
```

## Chay thu doc lap
1. Tao database, chay `db/V2__categories_products.sql`, sau do `db/sample-data.sql`.
2. Sao chep `.env.example` thanh `.env`, sua `DATABASE_URL` (giu `APP_PORT=3000`).
3. `npm install`
4. `npm start` (tu doc file `.env`). Neu khong ket noi duoc PostgreSQL, server dung lai va in loi ro rang.
5. `npm test` de chay test (can database da co du lieu mau).

## Ghep vao backend cua Kim
- Copy `src/modules/product`, `src/modules/category`, `src/shared` (neu Kim chua co file tuong duong).
- Trong app chung: `app.use('/api/products', productRoutes)` va `app.use('/api/categories', categoryRoutes)`.
- Dung chung pool ket noi cua Kim thay cho `src/config/db.js` neu da co.
- Dua `db/V2__categories_products.sql` cho Kim dat vao quy trinh migration chung (doi so phien ban cho dung thu tu).

## API
| Method | Duong dan | Mo ta |
| --- | --- | --- |
| GET | /api/categories | Danh sach danh muc, xep theo ten |
| GET | /api/categories/:id | Chi tiet danh muc |
| GET | /api/products | Danh sach san pham co phan trang |
| GET | /api/products/:id | Chi tiet san pham kem danh muc |

Tham so cua `GET /api/products` (tuy chon): `categoryId` (UUID), `status`, `page` (tu 0, mac dinh 0), `size` (1 den 100, mac dinh 20).

| Ma | Khi nao |
| --- | --- |
| 200 | Thanh cong. Danh sach rong van la 200 voi `items` rong |
| 400 | id khong phai UUID, hoac `page`/`size` ngoai khoang cho phep |
| 404 | Khong tim thay san pham hoac danh muc |
| 503 | Mat ket noi database |

Dinh dang loi:
```json
{ "timestamp": "2026-10-29T09:30:00.000Z", "status": 404, "error": "Not Found",
  "message": "Khong tim thay san pham co id ...", "path": "/api/products/..." }
```

Vi du `GET /api/products/aaaaaaaa-0000-0000-0000-000000000001`:
```json
{
  "id": "aaaaaaaa-0000-0000-0000-000000000001",
  "name": "Tao do",
  "description": "Tao do nhap khau, 1 qua",
  "unitPrice": 15000,
  "status": "ACTIVE",
  "category": { "id": "11111111-1111-1111-1111-111111111111", "name": "Trai cay tuoi" },
  "createdAt": "2026-10-29T02:30:00.000Z",
  "updatedAt": "2026-10-29T02:30:00.000Z"
}
```

## Postman
Import `docs/product-api.postman_collection.json`, dat bien `baseUrl` (vi du `http://localhost:3000`).

## Diem can Kim xac nhan
- Gia tri `status` (hien dung `ACTIVE`, `INACTIVE`).
- Format loi chung (thay `src/shared/errorHandler.js` khi co).
- Dung JavaScript hay TypeScript cho backend.
- Cach bao ve API bang xac thuc cua Huy (hien tai API doc cong khai).
