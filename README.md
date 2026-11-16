# FreshVend

FreshVend là hệ thống máy bán trái cây tự động, gồm Backend API, PostgreSQL,
giao diện quản trị/khách hàng và IoT Simulator giao tiếp với Backend qua MQTT.

## Cấu trúc dự án

- `backend/`: backend API và các module của Sprint 1.
- `database/`: migration và dữ liệu mẫu theo ERD đã được nhóm chốt.
- `iot-simulator/`: khung mô phỏng trạng thái máy cho các bước tích hợp tiếp theo.
- `vending-client/`: giao diện khách hàng, triển khai ở sprint sau.
- `admin-dashboard/`: giao diện Admin/Operator, triển khai ở sprint sau.
- `mô tả dự án/`: tài liệu mô tả và phân công dự án hiện có.

## Chạy Backend và IoT Simulator (development)

1. Tạo `.env` ở thư mục gốc từ [.env.example](./.env.example), cấu hình PostgreSQL
   và thay tất cả secret bằng giá trị ngẫu nhiên. Không commit `.env`.
2. Cài dependency Backend: `cd backend` rồi `npm ci`.
3. Khởi tạo schema/migration: `npm run db:migrate`; chạy API: `npm start`.
4. Khởi chạy Mosquitto: `docker compose -f iot-simulator/docker-compose.dev.yml up -d`.
5. Tạo `iot-simulator/.env` từ `.env.example`, đặt cùng `IOT_DEVICE_SECRET` như
   Backend, rồi từ `iot-simulator/` chạy `python simulator.py --machine VM001`.

Backend dùng `MQTT_ENABLED=true` để kết nối broker, tạo lệnh DISPENSE bền vững
sau khi payment callback xác nhận thành công, rồi chờ kết quả simulator. Xem
[iot-simulator/README.md](./iot-simulator/README.md) để biết topic, payload,
vận hành và giới hạn kiểm thử tích hợp hiện tại.

## Kiểm thử

- Backend + PostgreSQL: `cd backend` rồi `npm test`.
- IoT Simulator: `cd iot-simulator` rồi `python -m unittest discover -s tests -v`.
- Kiểm tra migration: `cd backend` rồi `npm run db:migrate:status`.
