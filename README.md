# 🌊 Hệ thống Giám sát Mực nước WebGIS

Đây là đồ án môn học xây dựng một hệ thống WebGIS Dashboard giúp giám sát, phân tích và trực quan hóa dữ liệu mực nước thủy văn tại các trạm đo lường. Hệ thống tích hợp bản đồ không gian và biểu đồ chuỗi thời gian, đồng thời có khả năng tự động cảnh báo ngập lụt khi mực nước vượt các ngưỡng báo động.

## 🚀 Các tính năng chính

- **Bản đồ Không gian (WebGIS):** Sử dụng thư viện `Leaflet.js` hiển thị bản đồ địa hình (Terrain BaseMap). Định vị tọa độ thực tế của các trạm đo (Trạm mặt đất và Trạm vệ tinh).
- **Tương tác trực quan:** Marker trên bản đồ có hiệu ứng nhấp nháy cảnh báo (Pulse) đối với các trạm đang có mực nước nguy hiểm.
- **Biểu đồ Chuỗi thời gian:** Tích hợp `Chart.js` để vẽ đồ thị diễn biến mực nước theo thời gian.
- **Hệ thống Cảnh báo (Alerts):** Cấu hình sẵn các mức Báo động 1, 2, 3 hiển thị trực tiếp trên biểu đồ (`chartjs-plugin-annotation`). Tự động đổi màu giao diện sang đỏ cảnh báo nếu dữ liệu vượt ngưỡng BĐ3.
- **Phân tích Dữ liệu:** Cho phép chuyển đổi linh hoạt giữa việc xem Dữ liệu Thô (có nhiễu, ngắt quãng) và Dữ liệu Đã chuẩn hóa (đã được làm trơn/nội suy).
- **Giao diện Hiện đại (UI/UX):** Xây dựng hoàn toàn bằng `Tailwind CSS`, thiết kế Responsive (tương thích đa màn hình) chuyên nghiệp cho các phòng điều hành (Control Room).

## 🛠️ Công nghệ sử dụng

- **Frontend Core:** HTML5, CSS3, Vanilla JavaScript.
- **CSS Framework:** [Tailwind CSS](https://tailwindcss.com/) (thông qua CDN).
- **Thư viện Bản đồ:** [Leaflet.js](https://leafletjs.com/) kết hợp Esri World Topo Map.
- **Thư viện Biểu đồ:** [Chart.js](https://www.chartjs.org/) cùng plugin `chartjs-plugin-annotation`.
- **Hosting / Deployment:** Tối ưu hóa sẵn cấu hình tĩnh để triển khai trên [Vercel](https://vercel.com).

## 📂 Cấu trúc thư mục

```text
gis-dashboard/
├── index.html            # Khung giao diện chính và điểm vào (entry point)
├── vercel.json           # Cấu hình triển khai cho Vercel (Cache, Routing)
├── package.json          # File định nghĩa metadata dự án
└── assets/               # Thư mục chứa tài nguyên tĩnh
    ├── css/
    │   └── style.css     # CSS tuỳ chỉnh (Custom styling & Animations)
    └── js/
        ├── data.js       # Database mô phỏng (tọa độ trạm, mức cảnh báo, dữ liệu thô)
        └── main.js       # Logic xử lý (Khởi tạo Bản đồ, Biểu đồ, Điều hướng UI)
```

## ⚙️ Hướng dẫn Cài đặt & Chạy

Vì dự án này là Static Web thuần túy, bạn không cần cài đặt môi trường phức tạp:

1. **Chạy trên máy cá nhân (Local):**
   - Mở thư mục dự án trên VS Code.
   - Cài đặt và sử dụng extension **Live Server** (hoặc mở trực tiếp file `index.html` bằng trình duyệt).

2. **Triển khai thực tế (Deploy) lên Vercel:**
   - Cập nhật thư mục dự án lên **GitHub**.
   - Truy cập **Vercel**, chọn Import Repository.
   - Nhờ có cấu hình `vercel.json` sẵn có, hệ thống sẽ tự động đưa dự án của bạn lên mạng hoàn toàn miễn phí.
