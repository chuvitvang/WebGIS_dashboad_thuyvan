// Data Configuration
const stations = {
    '74129': {
        id: '74129',
        name: 'Trạm Thủy văn Yên Bái',
        type: 'Trạm mặt đất',
        typeColor: 'text-emerald-600',
        dotColor: '#10b981',
        lat: 21.722, // Tọa độ thực tế khu vực Yên Bái
        lng: 104.887,
        desc: 'Quan trắc thủ công. Sông Thao. Dữ liệu có ngắt quãng và ngoại lai cần xử lý.',
        alarms: {
            bd1: 3000, // cm
            bd2: 3100, // cm
            bd3: 3200  // cm
        },
        metrics: {
            raw: { max: '3250 cm', min: '1571 cm', missing: '12 điểm', status: 'Lỗi ngoại lai' },
            clean: { max: '3250 cm', min: '2542 cm', missing: '0 điểm', status: 'Vượt Báo Động 3' }
        },
        chartData: {
            labels: ['01:00', '04:00', '07:00', '10:00', '13:00', '16:00', '19:00', '22:00', '01:00', '04:00', '07:00'],
            // Added a flood event peaking above 3200 (BD3)
            raw: [2619, null, 2807, null, 3050, null, 3250, null, 3180, null, 1571], 
            clean: [2619, 2710, 2807, 2920, 3050, 3160, 3250, 3220, 3180, 3100, 3010] 
        }
    },
    'VS-01': {
        id: 'VS-01',
        name: 'Trạm Ảo VS-01 (Jason-3)',
        type: 'Vệ tinh đo cao',
        typeColor: 'text-amber-600',
        dotColor: '#f59e0b',
        lat: 21.5,
        lng: 104.5, // Dọc hạ lưu sông
        desc: 'Dữ liệu trích xuất từ vệ tinh đo cao, phục vụ khu vực không có trạm mặt đất.',
        alarms: {
            bd1: 25.0, // meters
            bd2: 27.0, // meters
            bd3: 28.0  // meters
        },
        metrics: {
            raw: { max: '28.5 m', min: '22.1 m', missing: 'Thưa thớt', status: 'Dữ liệu bay qua' },
            clean: { max: '28.5 m', min: '22.2 m', missing: '0 điểm', status: 'Vượt Báo Động 3' }
        },
        chartData: {
            labels: ['Ngày 1', 'Ngày 4', 'Ngày 7', 'Ngày 10', 'Ngày 13', 'Ngày 16', 'Ngày 19', 'Ngày 22', 'Ngày 25', 'Ngày 28', 'Ngày 31'],
            raw: [22.1, null, null, 23.5, null, null, 26.8, null, null, 28.5, null],
            clean: [22.1, 22.5, 23.0, 23.5, 24.8, 25.9, 26.8, 27.5, 28.1, 28.5, 28.3]
        }
    }
};
