# IoT Simulator — Sprint 3 (Phụ trách: HẢI)

Máy bán hàng ảo của FreshVend: nhận lệnh **DISPENSE** qua MQTT, mô phỏng motor + cảm biến rơi hàng,
trả kết quả `DISPENSE_SUCCESS` / `DISPENSE_FAILED`, đồng thời gửi telemetry/cảnh báo. Chỉ mô phỏng, không điều khiển phần cứng thật.

## 1. Chạy nhanh

Yêu cầu: Python 3.9+ (đã thử 3.12).

```bash
# 0) Kiểm tra nhanh không cần broker/thư viện nào (broker giả trong bộ nhớ)
python demo.py                               # 10 kịch bản nhả thành công/thất bại, thoát mã 0 nếu đạt
python -m unittest discover -s tests -v      # unit test

# 1) Chạy với broker thật
pip install -r requirements.txt              # paho-mqtt >= 2.0
docker compose -f docker-compose.dev.yml up -d   # Mosquitto dev (hoặc dùng broker nhóm đã chốt)
cp .env.example .env                         # chỉnh nếu cần; .env bị gitignore
python simulator.py --machine VM001 --console
```

Quan sát và gửi thử lệnh bằng công cụ của Mosquitto:

```bash
mosquitto_sub -h localhost -t 'freshvend/VM001/#' -v

mosquitto_pub -h localhost -q 1 -t 'freshvend/VM001/commands/dispense' -m '{
  "commandId": "cmd_demo0001", "orderId": "demo-order-0001", "machineCode": "VM001",
  "items": [{"columnId": "A01", "quantity": 1}, {"columnId": "A02", "quantity": 2}]
}'
```

Với `--time-scale 0.1` mọi thời gian chờ nhanh gấp 10 lần; `--seed 7` làm phần ngẫu nhiên lặp lại được.

## 2. Hợp đồng MQTT

Tiền tố topic mặc định `freshvend` (`--topic-prefix` / `MQTT_TOPIC_PREFIX`). `{machineCode}` viết HOA, ví dụ `VM001`.

| Topic | Chiều | QoS | Retain | Nội dung |
| :-- | :-- | :-- | :-- | :-- |
| `freshvend/{machineCode}/commands/dispense` | Backend → Sim | 1 | không | Lệnh nhả hàng |
| `freshvend/{machineCode}/events/dispense-result` | Sim → Backend | 1 | không | Kết quả nhả hàng (đúng 1 bản tin/lệnh) |
| `freshvend/{machineCode}/telemetry` | Sim → Backend | 0 | không | Telemetry mỗi 2 giây |
| `freshvend/{machineCode}/status` | Sim → Backend | 1 | **có** | `ONLINE` khi nối; `OFFLINE` khi tắt máy hoặc qua **Last Will** khi rớt mạng |
| `freshvend/{machineCode}/events/alert` | Sim → Backend | 1 | không | Cảnh báo: kẹt hàng, nhiệt độ, cảm biến, cửa |
| `freshvend/{machineCode}/commands/control` | Backend → Sim | 1 | không | `CLEAR_FAULT` (Operator/Admin) |
| `freshvend/{machineCode}/events/control-result` | Sim → Backend | 1 | không | Xác nhận lệnh điều khiển |

Backend hiện publish DISPENSE và subscribe các topic kết quả, telemetry, trạng
thái, cảnh báo, và kết quả điều khiển. Bản tin MQTT được ký HMAC-SHA256 bằng
`IOT_DEVICE_SECRET`; cấu hình cùng một secret cho Backend và Simulator. Trong
production, Backend bắt buộc TLS, broker username/password và secret tối thiểu
32 byte.

### 2.1 Lệnh `commands/dispense`

Khớp trường `mqttDispensePayload` mà `GET /api/machines/orders/:orderId/dispense-plan` đang trả về.

```json
{
  "commandId": "cmd_ab12cd34",
  "orderId": "ab12cd34-....",
  "machineId": "<uuid máy>",
  "machineCode": "VM001",
  "timestamp": "2026-11-15T08:30:00.000Z",
  "items": [
    { "columnId": "A01", "slotId": "<uuid>", "productId": "<uuid>", "quantity": 1 }
  ]
}
```

Simulator kiểm tra: JSON object ≤ 64 KB; `commandId`, `orderId` bắt buộc (chuỗi hoặc số nguyên); `machineCode` nếu có phải trùng máy này;
`items` 1–50 dòng; `columnId` dạng `A01`/`A1` (chuẩn hóa về `A01` để so khớp); `quantity` nguyên 1–100.
`slotId`, `productId`, `machineId` chỉ được **echo lại** trong kết quả.
Backend phát `commandId`, `orderId`, `machineId`, `slotId` và `productId` theo
UUID từ database; chữ ký `signature` được thêm khi publish nên không cần đặt
trường này trong command payload lưu trong database.

### 2.2 Kết quả `events/dispense-result`

```json
{
  "eventCode": "DISPENSE_FAILED",
  "status": "FAILED",
  "commandId": "cmd_ab12cd34",
  "orderId": "ab12cd34-....",
  "machineCode": "VM001",
  "machineId": "<uuid máy>",
  "items": [
    { "columnId": "A01", "slotId": "...", "productId": "...", "quantity": 1, "dispensedQuantity": 1,
      "status": "SUCCESS", "retryCount": 0, "errorCode": null, "errorMessage": null },
    { "columnId": "A02", "slotId": "...", "productId": "...", "quantity": 1, "dispensedQuantity": 0,
      "status": "FAILED", "retryCount": 2, "errorCode": "DISPENSE_JAM", "errorMessage": "Kẹt hàng tại cột A02 ..." }
  ],
  "retryCount": 2,
  "errorCode": "DISPENSE_JAM",
  "errorMessage": "Kẹt hàng tại cột A02 sau 2 lần thử lại; cột đã bị khóa.",
  "replayed": false,
  "startedAt": "2026-11-15T08:30:00.120Z",
  "timestamp": "2026-11-15T08:30:07.950Z",
  "durationMs": 7830
}
```

- `status`/`eventCode`: `SUCCESS`/`DISPENSE_SUCCESS` chỉ khi **mọi** món nhả xong; ngược lại `FAILED`/`DISPENSE_FAILED`.
- `items[].status`: `SUCCESS` · `FAILED` (kẹt giữa chừng) · `REJECTED` (bị từ chối ở bước kiểm tra, chưa quay motor) · `SKIPPED` (chưa xử lý vì món trước lỗi).
- `replayed: true`: đây là bản gửi lại kết quả cũ do nhận lệnh trùng, **motor không quay lần hai**.
- `commandId`/`orderId`/`machineCode` luôn giữ nguyên như lệnh để Backend đối chiếu.
- Backend kiểm tra command/order/machine/slot/product/quantity trước khi ghi
  nhận kết quả. Kết quả trùng được xử lý idempotent; kết quả mâu thuẫn bị từ
  chối. Trường `replayed` của Simulator không thay đổi nội dung đối soát.

Mã lỗi `errorCode`:

| Mã | Ý nghĩa | Đã quay motor? |
| :-- | :-- | :-- |
| `DISPENSE_JAM` | Kẹt hàng sau `max_retries` (2) lần thử lại; cột bị khóa (ERR-01) | có |
| `COLUMN_LOCKED` | Cột đang bị khóa do kẹt trước đó | không |
| `OUT_OF_STOCK` | Cảm biến cột báo trống (ERR-05) | không |
| `COLUMN_NOT_FOUND` | Máy không có cột này | không |
| `MACHINE_LOCKED` | Khóa bán hàng do nhiệt độ vượt ngưỡng kéo dài (ERR-06) | không |
| `INVALID_COMMAND` | Payload sai (chỉ phản hồi nếu đọc được `commandId` hoặc `orderId`) | không |
| `MACHINE_MISMATCH` | `machineCode` trong lệnh khác máy nhận | không |
| `COMMAND_ID_CONFLICT` | `commandId` đã gắn với đơn khác | không |

Các lỗi "không quay motor" được kiểm tra cho **toàn bộ đơn trước khi quay**, nên không có chuyện nhả dở dang vì lỗi có thể đoán trước.
Chỉ lỗi kẹt giữa chừng mới cho kết quả nhả một phần (xem `items[]`).

### 2.3 Idempotency (mỗi lệnh chỉ nhả đúng một lần)

1. Cùng `commandId` + cùng `orderId` đã có kết quả → **gửi lại kết quả cũ** (`replayed: true`), không quay motor — kể cả khi kết quả cũ là thất bại.
2. Cùng `orderId` đã nhả **thành công** dưới `commandId` khác → trả lại kết quả thành công đó với `commandId` mới.
3. Cùng `orderId` từng **thất bại** rồi nhận `commandId` mới → xử lý như lệnh mới (cho phép thử lại sau khi Operator xử lý sự cố).
4. Cùng `commandId` nhưng **khác** `orderId` → `COMMAND_ID_CONFLICT`.
5. Lệnh trùng đang xử lý dở → bỏ qua; kết quả sẽ được gửi khi xong.

Kết quả (tối đa 500 lệnh gần nhất) và trạng thái khóa cột được lưu ở `.sim_state/{machineCode}.json` nên vẫn đúng sau khi khởi động lại (`--no-persist` để tắt).

### 2.4 Telemetry `telemetry`

Tương thích bản tin Sprint 1 (Backend `POST /api/machines/simulator/status` nhận được nguyên bản tin này), thêm trường bổ sung:

```json
{
  "machineCode": "VM001", "machineState": "IDLE", "internalState": "IDLE",
  "temperature": 4.6, "humidity": 68.5, "doorStatus": "CLOSED", "sensorStatus": "OK",
  "lockedSlots": [], "timestamp": "2026-11-15T08:30:00Z"
}
```

`machineState` luôn thuộc tập Backend chấp nhận (`IDLE, BUSY, DISPENSING, ERROR, MAINTENANCE, OFFLINE`); `internalState` là trạng thái chi tiết.
Khi cảm biến hỏng: `temperature: null`, `sensorStatus: "FAULT"`. Bản tin được lưu đệm khi offline và gửi bù sẽ có thêm `"buffered": true`.
MQTT telemetry có chữ ký HMAC. HTTP fallback dùng `POST
/api/machines/simulator/status`, header `x-iot-key` và cùng `IOT_DEVICE_SECRET`;
spool bền vững và retry/backoff giữ các bản tin khi Backend tạm ngừng.

### 2.5 Điều khiển `commands/control`

```json
{ "action": "CLEAR_FAULT", "columnId": "A02", "requestId": "req-1" }
```
`columnId` bỏ trống = xóa lỗi toàn máy (mở khóa mọi cột, sửa cảm biến, bỏ khóa nhiệt độ). Phản hồi ở `events/control-result`:
`{ "requestId": "req-1", "action": "CLEAR_FAULT", "status": "OK" | "REJECTED", "clearedColumns": ["A02"], ... }`.

## 3. Máy trạng thái

`IDLE → RECEIVED_COMMAND → MOTOR_RUNNING (1.5–2.0s) → DISPENSING (cảm biến rơi, cửa sổ 3s) → [RETRYING ↺ MOTOR_RUNNING, tối đa 2 lần] → SUCCESS → IDLE`
hoặc `→ JAM_LOCKED` (khóa cột, chờ `CLEAR_FAULT`). Lệnh được xếp hàng FIFO, mỗi lúc chỉ nhả một lệnh; các hộp nhả tuần tự, nghỉ 1s giữa hai hộp.

| Trạng thái nội bộ | `machineState` gửi Backend |
| :-- | :-- |
| IDLE, SUCCESS | `IDLE` |
| RECEIVED_COMMAND | `BUSY` |
| MOTOR_RUNNING, DISPENSING, RETRYING | `DISPENSING` |
| JAM_LOCKED (có cột khóa / cảm biến lỗi / khóa nhiệt độ) | `ERROR` |
| OFFLINE | `OFFLINE` |

Lưu ý: khi máy ở `ERROR`, `GET /api/machines/:id` trả `isReadyForOrder: false` (hàm `evaluateMachinePurchaseReadiness`) cho tới khi `CLEAR_FAULT`.
Tuy nhiên `POST /api/orders` hiện chỉ kiểm tra máy `lifecycle_status = ACTIVE`, **chưa** dùng `isReadyForOrder`, nên vẫn có thể tạo đơn cho cột đang khóa;
đơn đó sẽ nhận `COLUMN_LOCKED` từ simulator (xem mục 9.4). Các cột không bị khóa vẫn nhận được lệnh nhả.

Nhiệt độ: dao động tự nhiên 3.5–6.5°C. Ngoài 2–8°C → cảnh báo `TEMP_OUT_OF_RANGE`; kéo dài quá `--temp-lock-after` (mặc định 300s) → `TEMP_LOCK` + khóa bán hàng
(tự mở khi nhiệt độ về ngưỡng). Cảm biến DHT22 lỗi: 2 lần đầu giữ giá trị hợp lệ gần nhất, từ lần thứ 3 gắn `FAULT` + cảnh báo `SENSOR_FAULT` (ERR-07).
Mất kết nối broker: Last Will phát `OFFLINE`; kết quả/cảnh báo/telemetry lưu đệm (tối đa 500 mỗi loại, cũ nhất bị bỏ trước) và đẩy bù theo thứ tự khi nối lại (ERR-08).

## 4. Cấu hình

Ưu tiên: tham số CLI > biến môi trường/`.env` > mặc định. **Thông tin xác thực broker chỉ đọc từ `MQTT_USERNAME`/`MQTT_PASSWORD`, không có tham số CLI** (tránh lộ trong lịch sử shell).

| Tham số | Biến môi trường | Mặc định | Ý nghĩa |
| :-- | :-- | :-- | :-- |
| `--machine` | `MACHINE_CODE` | `VM001` | Mã máy (A-Z, 0-9, `-`, `_`) |
| `--broker-host/--broker-port` | `MQTT_HOST/MQTT_PORT` | `localhost/1883` | Broker |
| `--tls` | `MQTT_TLS` | tắt | Bật TLS |
| `--topic-prefix` | `MQTT_TOPIC_PREFIX` | `freshvend` | Tiền tố topic |
| `--telemetry-transport` | — | `mqtt` | `mqtt` \| `http` \| `both` (xem mục 9) |
| `--backend-url` / (secret) | `BACKEND_URL` / `IOT_DEVICE_SECRET` | `http://localhost:3000` | Chỉ cho telemetry HTTP; gửi header `x-iot-key` |
| `--slots` | — | `A01,A02,A03,A04` | Các cột của máy (khớp `seed_data.sql`) |
| `--jam-rate` | — | `0` | Xác suất kẹt ngẫu nhiên mỗi lần quay (thiết kế: < 2%) |
| `--jam-slot CỘT[:N]` | — | — | Ép kẹt: `A02` vĩnh viễn, `A02:1` kẹt 1 lần |
| `--temp-lock-after` | — | `300` | Giây vượt ngưỡng trước khi khóa bán hàng |
| `--time-scale` / `--seed` | — | `1` / ngẫu nhiên | Tăng tốc demo / lặp lại được |
| `--state-dir` / `--no-persist` | — | `.sim_state` | Lưu state để idempotent qua khởi động lại |
| `--console` | — | tắt | Console tiêm lỗi |

## 5. Tiêm lỗi (Fault Injection)

Console (`--console`): `jam A02 [n]`, `empty A04`, `temp 9.5|auto`, `sensor-fault on|off`, `door open|close`, `clear [cột]`, `status`.
Hoặc khởi động sẵn lỗi: `python simulator.py --jam-slot A02`.

## 6. Kịch bản demo lặp lại được

`python demo.py` (Backend giả + simulator, tự kiểm tra PASS/FAIL, thoát mã 1 nếu sai). Dùng `--broker-host localhost` cho Mosquitto thật, `--only success,jam` để chọn kịch bản, `--realtime` để giữ thời gian thật.

| # | `--only` | Kịch bản | Kỳ vọng |
| :-- | :-- | :-- | :-- |
| 1 | `success` | Đơn 2 món (3 hộp) | `DISPENSE_SUCCESS`, `retryCount 0` |
| 2 | `duplicate` | Gửi lại đúng lệnh | `replayed: true`, motor không quay lại |
| 3 | `retry` | Kẹt 1 lần | Thử lại, `SUCCESS`, `retryCount 1` |
| 4 | `jam` | Kẹt vĩnh viễn ở A02 | `DISPENSE_FAILED/DISPENSE_JAM`, `retryCount 2`, khóa A02, có alert |
| 5 | `locked` | Đơn vào cột đang khóa | `COLUMN_LOCKED`, không quay motor |
| 6 | `clear` | `CLEAR_FAULT` rồi nhả lại | Ack `OK`, `SUCCESS` |
| 7 | `stock` | Cột trống | `OUT_OF_STOCK`, món trước KHÔNG bị nhả dở |
| 8 | `invalid` | Payload sai | `INVALID_COMMAND` |
| 9 | `temp` | 9.8°C kéo dài | `MACHINE_LOCKED`, tự mở khi về bình thường |
| 10 | `offline` | Mất mạng giữa chừng | Kết quả lưu đệm rồi đồng bộ lại (chỉ broker giả) |

### Chạy cùng Backend thật

Khởi chạy PostgreSQL, chạy `backend` migrations, Mosquitto, Backend với
`MQTT_ENABLED=true`, rồi Simulator. Đảm bảo mã máy và slot codes khớp dữ liệu
database, và `IOT_DEVICE_SECRET` giống nhau ở Backend/Simulator. Sau khi tạo
đơn và thanh toán, payment provider gọi
`POST /api/orders/payments/:paymentId/callback` với header `x-payment-key` và
`{"status":"SUCCESS"}`. Chỉ khi callback xác nhận thành công, Backend tạo
outbox command; kết quả được xem qua `GET /api/orders/:orderId`.

- **Thành công:** `python simulator.py` → tạo đơn, thanh toán SUCCESS → Backend publish lệnh → simulator trả `DISPENSE_SUCCESS` → đơn `COMPLETED`.
- **Thất bại:** `python simulator.py --jam-slot A01` (hoặc `jam A01` trong console) với đơn mua sản phẩm ở khe A01 → `DISPENSE_FAILED` → đơn `FAILED`, tồn kho được hoàn.
  Sau demo: `clear` trong console (hoặc publish `CLEAR_FAULT`) để máy sẵn sàng lại.

## 6b. Cấu trúc mã

```
simulator.py            CLI
demo.py                 Backend giả + 10 kịch bản
freshvend_sim/protocol.py    topic, mã lỗi, validate lệnh   <- sửa hợp đồng ở ĐÂY
freshvend_sim/machine.py     máy trạng thái, nhả hàng, idempotency, bộ đệm offline
freshvend_sim/transport.py   PahoTransport (broker thật) + InMemoryBroker (test/demo)
freshvend_sim/faults.py, state_store.py, config.py, console.py, http_telemetry.py
tests/test_simulator.py      37 unit test
```

## 7. Trạng thái kiểm thử

- 40/40 Simulator unit tests đạt với `python -m unittest discover -s tests -v`.
- 49/49 Backend tests đạt với `npm test`; bao gồm order, payment, database
  reservation, full/partial dispense result, idempotency và tồn kho trên
  PostgreSQL đang cấu hình.
- Migration `20261115210000_dispense_mqtt_workflow.sql` và các migration
  điều chỉnh trigger fulfillment đã được áp dụng; xác minh bằng
  `npm run db:migrate:status`.
- Chưa xác minh MQTT end-to-end qua Mosquitto: Docker CLI có nhưng Docker Engine
  chưa chạy và không tìm thấy `mosquitto`/`mosquitto_pub` cài cục bộ trong môi
  trường kiểm thử này. Vì vậy không tuyên bố luồng Broker–Backend–Simulator đã
  vượt qua integration test thực tế; cũng chưa đo NFR-P05 trên broker thật.

## 8. Ngoài phạm vi Sprint này

Điều khiển phần cứng thật; nhiều máy trong một tiến trình (chạy mỗi máy một tiến trình với `--machine` khác nhau); kiểm tra độ cũ của lệnh qua `timestamp`; đếm tồn kho vật lý trong simulator (Backend mới là nguồn dữ liệu tồn kho).

## 9. Tích hợp Backend: trạng thái và giới hạn

1. Backend có MQTT adapter, đăng ký lại subscription khi reconnect và nhận
   telemetry, trạng thái máy, dispense-result, alert, control-result. Outbox
   giữ command trong PostgreSQL, publish QoS 1, kiểm tra heartbeat trước khi
   dispatch, retry timeout/publish và chuyển quá số lần thử sang `DEAD_LETTER`.
2. Payment callback SUCCESS tạo duy nhất một command cho order. Backend kiểm
   tra UUID command/order, machine, slot, product, quantity, và item-level
   status. Kết quả partial/failure chỉ hoàn tồn phần chưa nhả; payment vẫn
   `SUCCESS` vì chưa có tích hợp refund provider. Số tiền cần xử lý được lưu
   trong `refundDueAmount`.
3. API ghi dispense result và HTTP telemetry yêu cầu `x-iot-key`; production
   yêu cầu secret đủ mạnh. MQTT message dùng HMAC khi secret được cấu hình;
   production còn bắt buộc MQTT TLS và thông tin xác thực broker.
4. `CLEAR_FAULT` được Backend publish qua
   `POST /api/machines/:id/control` (role Admin/Operator); control result được
   ghi log. Giao diện Operator chưa có thao tác này thì hiện vẫn có thể dùng
   console simulator.
5. Backend unit/API tests và Simulator unit tests đạt, nhưng chưa chạy được
   integration qua Mosquitto thật tại môi trường này (Docker Engine không hoạt
   động, không có Mosquitto cục bộ). Trước khi nghiệm thu cần chạy broker thật
   và xác minh thanh toán → MQTT command → simulator → result → Database, gồm
   offline/reconnect, partial dispense, duplicate message và restart Backend.
6. Broker development chỉ bind `127.0.0.1`; không dùng anonymous dev broker
   trong môi trường chia sẻ/production.
