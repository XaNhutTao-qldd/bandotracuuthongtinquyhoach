# WebGIS Nhựt Tảo — Quy hoạch 11-11-2026

Giao diện tra cứu thửa đất & quy hoạch xã Nhựt Tảo (Tây Ninh).

**Dữ liệu:** lấy nguyên từ file **QH MOI11-11-2026** (không chỉnh sửa thuộc tính).

## Cách mở

1. Giải nén thư mục này.
2. Mở bằng web server tĩnh (khuyến nghị, vì file dữ liệu ~23MB):

```bash
python -m http.server 8080
```

rồi vào http://localhost:8080

3. Bấm **Mở bản đồ** để vào `map.html`.

> Không nên mở trực tiếp bằng `file://` (có thể lỗi CORS / chậm).

## Cấu trúc

| Thư mục / file | Mô tả |
|----------------|--------|
| `index.html` | Trang giới thiệu |
| `map.html` | Bản đồ OpenLayers |
| `js/config.js` | Cấu hình tên trường, tâm bản đồ, màu |
| `js/app.js` | Logic bản đồ, tìm kiếm, popup |
| `js/style_aggregated.js` | Màu thửa theo MDSD |
| `data/Aggregated_0.js` | Thửa đất (hiện trạng + DTtong) — **nguyên bản từ QH MOI** |
| `data/VungNhutTao_1.js` | Vùng quy hoạch — **nguyên bản từ QH MOI** |

## Trường dữ liệu chính (Aggregated)

- `soto`, `sothua` — số tờ / số thửa  
- `TenChu`, `DiaChiThua` — chủ sử dụng / địa chỉ  
- `MDSD`, `HienTrang` — mã & tên hiện trạng  
- `DienTich`, `DTQH` — diện tích thửa / diện tích quy hoạch  
- `DTtong` — chi tiết quy hoạch dạng `ONT: 380.1m2, LUC: 50m2`

## Logic hiển thị quy hoạch

- Ưu tiên dữ liệu thuộc tính `DTtong` / `DTQH` (đã tính overlay từ QGIS).
- Nếu có mã quy hoạch hợp lệ (ONT, DGT, SKC, TMD, …) với diện tích > 0 → hiển thị **chi tiết m²**.
- Kiểm tra giao hình học nới lỏng (nhiều điểm mẫu).
- Dòng tóm tắt **Quy hoạch: xxx m²** hiện ngay trong khối thông tin thửa.

Thông tin chỉ mang tính tham khảo. Vui lòng xác minh tại cơ quan nhà nước có thẩm quyền.
