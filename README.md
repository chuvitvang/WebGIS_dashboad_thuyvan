# 🌊 WebGIS Giám Sát Mực Nước Thủy Văn & Lượng Mưa (TP. Hồ Chí Minh)

Dự án WebGIS Dashboard giúp giám sát, phân tích và trực quan hóa dữ liệu mực nước sông và lượng mưa thực tế tại khu vực TP. Hồ Chí Minh. Hệ thống tích hợp bản đồ không gian địa lý, biểu đồ thời gian hỗn hợp, bộ lọc thời gian động thông minh và kết nối trực tiếp cơ sở dữ liệu đám mây **Supabase (PostgreSQL + PostGIS)**.

---

## 🚀 Các tính năng chính

* **Bản đồ Không gian Địa lý (WebGIS)**: Sử dụng `Leaflet.js` hiển thị bản đồ Topo địa hình. Định vị chính xác tọa độ thực địa của **16 trạm đo** (gồm 2 trạm mực nước sông lớn là Phú An, Nhà Bè và 14 trạm đo lượng mưa quanh TP.HCM).
* **Biểu đồ hỗn hợp (Mixed Chart - Dual Y-Axis)**:
  * **Mực nước (Line)**: Màu xanh lá (`#10b981`), trục tung trái tự co giãn.
  * **Lượng mưa (Bar)**: Màu xanh dương (`#0ea5e9`), trục tung phải hiển thị lượng mưa (mm).
  * **Cảnh báo lũ**: Tự động vẽ các ngưỡng báo động lũ (BĐ1, BĐ2, BĐ3) trực tiếp lên biểu đồ bằng nét đứt đỏ/cam.
* **Bộ lọc thời gian Dropdown động thông minh**:
  * Tự động lọc và hiển thị danh sách các năm/tháng **thực tế có dữ liệu** đo đạc của riêng trạm đó, tự động loại bỏ các khoảng thời gian trống.
  * Hỗ trợ tùy chọn mặc định hiển thị **30 ngày gần nhất** tính từ mốc đo đạc mới nhất của trạm đó để tránh làm quá tải biểu đồ.
  * Duy trì thông minh khoảng ngày lọc thủ công khi người dùng click chuyển đổi giữa các trạm để so sánh chéo dữ liệu.
* **Tải dữ liệu phân tán (Lazy Load & Cache)**:
  * Trang Web load ban đầu siêu nhẹ vì chỉ tải danh sách trạm tĩnh để vẽ marker.
  * Khi chọn trạm đo nào, client mới thực hiện truy vấn tải toàn bộ dữ liệu lịch sử đo đạc của riêng trạm đó (kéo đầy đủ dữ liệu qua nhiều năm lên đến hàng chục nghìn dòng đo bằng cách thiết lập limit 25.000 dòng để vượt qua giới hạn 1000 dòng mặc định của Supabase).
  * Dữ liệu tải về sẽ được cache lại để hiển thị tức thì cho các lần click sau.

---

## 📂 Cấu trúc thư mục dự án

```text
WebGIS_dashboad_thuyvan/
├── index.html            # Khung giao diện Dashboard chính
├── vercel.json           # Cấu hình triển khai lên Vercel
├── package.json          # Metadata dự án
├── .gitignore            # Loại bỏ các tệp tin thừa khi đẩy git
├── README.md             # Hướng dẫn dự án chi tiết
└── assets/               # Thư mục chứa tài nguyên tĩnh
    ├── css/
    │   └── style.css     # CSS tuỳ chỉnh & Hiệu ứng hoạt họa (Pulse, Pin, custom-scroll)
    └── js/
        ├── data.js       # Tọa độ và cấu hình tĩnh của 16 trạm thực địa quanh TP.HCM
        └── main.js       # Logic điều khiển WebGIS (Leaflet, Chart.js, Supabase Integration)
```

---

## ⚙️ Hướng dẫn cấu hình Cơ sở dữ liệu Supabase

Để kết nối dữ liệu thực tế từ các file Excel/CSV đo đạc của bạn, thực hiện theo các bước thiết lập CSDL PostgreSQL + PostGIS trên Supabase như sau:

### Bước 1: Kích hoạt PostGIS và Tạo bảng
Truy cập mục **SQL Editor** trong dự án Supabase của bạn, tạo một query mới và thực thi câu lệnh SQL sau:

```sql
-- 1. Kích hoạt PostGIS phục vụ bản đồ không gian địa lý
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tạo bảng trạm thủy văn (Mực nước sông)
CREATE TABLE tram_thuy_van (
    "FID" SERIAL PRIMARY KEY,
    "IDtramMucN" VARCHAR(100),
    "tenTram" VARCHAR(255),
    "gio" VARCHAR(50),
    "ngay" DATE,
    "toaDoX" DOUBLE PRECISION,
    "toaDoY" DOUBLE PRECISION,
    "mucNuoc" DOUBLE PRECISION,
    "doCaoDinhT" DOUBLE PRECISION,
    "doCaoChanT" DOUBLE PRECISION,
    "baoDongI" DOUBLE PRECISION,
    "baoDongII" DOUBLE PRECISION,
    "baoDongIII" DOUBLE PRECISION,
    "maXa" VARCHAR(100),
    "maHuyen" VARCHAR(100),
    "maXaHuyen" VARCHAR(100),
    "ghiChu" TEXT,
    "kinhDo" DOUBLE PRECISION,
    "viDo" DOUBLE PRECISION,
    "day" INTEGER,
    "month" INTEGER,
    "year" INTEGER
);

-- Trigger tự động tính toán hình học PostGIS (geom) từ kinhDo/viDo cho trạm thủy văn
ALTER TABLE tram_thuy_van ADD COLUMN geom GEOMETRY(Point, 4326);
CREATE OR REPLACE FUNCTION update_geom_from_coordinates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."kinhDo" IS NOT NULL AND NEW."viDo" IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_Point(NEW."kinhDo", NEW."viDo"), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_geom
BEFORE INSERT OR UPDATE ON tram_thuy_van
FOR EACH ROW EXECUTE FUNCTION update_geom_from_coordinates();

-- 3. Tạo bảng trạm lượng mưa
CREATE TABLE tram_luong_mua (
    "FID" SERIAL PRIMARY KEY,
    "IDtramMua" VARCHAR(100),
    "tenTram" VARCHAR(255),
    "capTram" VARCHAR(100),
    "viTriTram" VARCHAR(255),
    "gio" VARCHAR(50),
    "ngay" DATE,
    "toaDoX" DOUBLE PRECISION,
    "toaDoY" DOUBLE PRECISION,
    "luongMua" DOUBLE PRECISION,
    "maXa" VARCHAR(100),
    "maHuyen" VARCHAR(100),
    "ghiChu" TEXT,
    "kinhDo" DOUBLE PRECISION,
    "viDo" DOUBLE PRECISION,
    "day" INTEGER,
    "month" INTEGER,
    "year" INTEGER
);

-- Trigger tự động tính toán hình học PostGIS (geom) từ kinhDo/viDo cho trạm lượng mưa
ALTER TABLE tram_luong_mua ADD COLUMN geom GEOMETRY(Point, 4326);
CREATE OR REPLACE FUNCTION update_geom_rain_coordinates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."kinhDo" IS NOT NULL AND NEW."viDo" IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_Point(NEW."kinhDo", NEW."viDo"), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_geom_rain
BEFORE INSERT OR UPDATE ON tram_luong_mua
FOR EACH ROW EXECUTE FUNCTION update_geom_rain_coordinates();
```

### Bước 2: Tắt chính sách bảo mật RLS để cho phép kéo dữ liệu về client
Mặc định, Supabase bật Row Level Security (RLS) bảo mật khiến dữ liệu tải về bị mảng rỗng `[]`. Thực hiện chạy câu lệnh SQL này trong **SQL Editor** để cho phép ứng dụng WebGIS truy xuất dữ liệu công khai:

```sql
ALTER TABLE tram_thuy_van DISABLE ROW LEVEL SECURITY;
ALTER TABLE tram_luong_mua DISABLE ROW LEVEL SECURITY;
```

### Bước 3: Import dữ liệu từ Excel / CSV
* Chuyển đổi tệp bảng tính Excel lượng mưa và mực nước của bạn sang dạng định dạng `.csv` (ngăn cách bằng dấu phẩy).
* Vào mục **Table Editor** của Supabase Dashboard, chọn bảng tương ứng (`tram_thuy_van` hoặc `tram_luong_mua`).
* Bấm **Insert** -> **Import data from CSV** và tải tệp của bạn lên để hoàn tất quá trình đồng bộ hóa cơ sở dữ liệu đám mây.

---

## 🔗 Hướng dẫn tích hợp API Supabase vào WebGIS

1. Trong dự án Supabase, vào mục **Project Settings (Răng cưa)** -> **API**.
2. Tìm và sao chép **Project URL** và **Anon Public API Key**.
3. Mở file [assets/js/main.js](file:///assets/js/main.js), cuộn xuống dòng cấu hình kết nối ở cuối và điền thông tin của bạn vào:

```javascript
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI5IkpXVCJ9...';
```

---

## 🏃 Hướng dẫn chạy dự án

* **Chạy cục bộ (Local)**: Bạn có thể mở trực tiếp file `index.html` trên trình duyệt hoặc sử dụng extension **Live Server** trên VS Code.
* **Triển khai lên Web (Deploy)**: Dự án đã được cấu hình tối ưu hóa tệp tĩnh trong `vercel.json`, bạn có thể đẩy mã nguồn lên **GitHub** và import trực tiếp vào trang **Vercel** để deploy miễn phí chỉ trong 1 phút.
