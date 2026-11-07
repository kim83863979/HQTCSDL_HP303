# Tài liệu API

Backend chạy mặc định tại `http://localhost:3000`. Các endpoint hiện được mount:

| Nhóm | Endpoint |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Products | `GET /api/products`, `GET /api/products/:id` |
| Categories | `GET /api/categories`, `GET /api/categories/:id` |
| Machines | `GET /api/machines`, `GET /api/machines/:id`, `GET /api/machines/:id/slots`, `POST /api/machines/simulator/status` |
| Inventory | `GET /api/inventory/machines/:machineId`, `GET /api/inventory/slots/:slotId` |

Auth register nhận `email`, `fullname`, `password`; vai trò mặc định là
`OPERATOR`. Login nhận `email`, `password` và trả JWT. Telemetry IoT nhận
`machineCode`, `machineState`, `temperature`, `humidity`, `doorStatus`,
`sensorStatus`; gửi header `x-iot-key` khi `IOT_DEVICE_SECRET` được cấu hình.
Các ID của máy, khe, sản phẩm và danh mục là UUID.

Postman collections:

- [Sprint 1 API](./sprint1-api.postman_collection.json) — Auth, Machines,
  Inventory.
- [Products & Categories](./product-api.postman_collection.json).

Đặt `baseUrl`, `machineId`, `slotId`, `iotDeviceSecret` trong collection trước
khi chạy. Giá trị ID mặc định lấy từ dữ liệu mẫu trong database dump.
Kiểm thử tự động: chạy `npm test` trong thư mục `backend` sau khi cấu hình DB
và cài dependency.
