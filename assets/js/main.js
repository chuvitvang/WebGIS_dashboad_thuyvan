let currentStation = '74129';
let currentMode = 'raw';
let chartInstance = null;
let leafletMap = null;
let mapMarkers = {};

// Initialize Leaflet Map
function initMap() {
    // Center map roughly on Yen Bai / Red River delta area
    leafletMap = L.map('gisMap').setView([21.6, 104.7], 9);

    // Add Esri World Topo Map for a nice terrain look
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 18
    }).addTo(leafletMap);

    // Add markers
    for (const key in stations) {
        const st = stations[key];

        // Cú pháp được sửa lỗi, không còn dấu gạch chéo ngược (\)
        const iconHtml = `
            <div style="position: relative;">
                ${key === currentStation ? '<div class="marker-pulse"></div>' : ''}
                <div class="marker-pin" style="background-color: ${st.dotColor}; ${key === currentStation ? 'transform: translate(-50%, -50%) scale(1.2); border-color: #0f172a;' : ''}"></div>
            </div>
        `;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'leaflet-div-icon',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker([st.lat, st.lng], { icon: customIcon }).addTo(leafletMap);

        // Add tooltip
        marker.bindTooltip(`<b>${st.id}</b><br>${st.name}`, {
            direction: 'top',
            offset: [0, -10]
        });

        // Click event
        marker.on('click', () => {
            currentStation = key;
            updateMapMarkers();
            leafletMap.panTo([st.lat, st.lng]);
            updateDateFilterOptions();
            if (!isManualFilterApplied) {
                setDefaultDateRange();
            } else {
                syncDropdownsToManualFilter();
            }
            updateDashboard();
        });

        mapMarkers[key] = marker;
    }
}

function updateMapMarkers() {
    for (const key in mapMarkers) {
        const st = stations[key];
        const marker = mapMarkers[key];

        // Cú pháp được sửa lỗi, không còn dấu gạch chéo ngược (\)
        const iconHtml = `
            <div style="position: relative;">
                ${key === currentStation ? '<div class="marker-pulse"></div>' : ''}
                <div class="marker-pin" style="background-color: ${st.dotColor}; ${key === currentStation ? 'transform: translate(-50%, -50%) scale(1.3); border-color: #0f172a;' : ''}"></div>
            </div>
        `;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'leaflet-div-icon',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        marker.setIcon(customIcon);
    }
}

let filteredStartDate = null;
let filteredEndDate = null;
let isManualFilterApplied = false;

// Hàm định dạng đối tượng Date thành chuỗi YYYY-MM-DD
function formatDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Hàm chuẩn hóa chuỗi tiếng Việt không dấu làm ID trạm
function cleanAccents(str) {
    if (!str) return 'unknown';
    return str.normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d")
              .replace(/Đ/g, "D")
              .replace(/[^a-zA-Z0-9]/g, "_")
              .replace(/_+/g, "_")
              .toLowerCase()
              .trim();
}

let dateOptions = {}; // Lưu trữ cấu trúc năm/tháng có dữ liệu của trạm hiện tại

// Hàm thiết lập khoảng ngày mặc định (30 ngày gần nhất tính từ ngày mới nhất có dữ liệu của trạm)
function setDefaultDateRange() {
    const st = stations[currentStation];
    if (!st || !st.chartData || !st.chartData.dates || st.chartData.dates.length === 0) {
        const today = new Date();
        const past30Days = new Date();
        past30Days.setDate(today.getDate() - 30);
        
        filteredEndDate = formatDate(today);
        filteredStartDate = formatDate(past30Days);
    } else {
        const dates = st.chartData.dates;
        let latest = null;
        for (const d of dates) {
            if (d) {
                if (!latest || d > latest) {
                    latest = d;
                }
            }
        }
        
        if (!latest) {
            const today = new Date();
            const past30Days = new Date();
            past30Days.setDate(today.getDate() - 30);
            
            filteredEndDate = formatDate(today);
            filteredStartDate = formatDate(past30Days);
        } else {
            const parts = latest.split('-');
            const maxDateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            
            const minDateObj = new Date(maxDateObj);
            minDateObj.setDate(maxDateObj.getDate() - 30);
            
            filteredEndDate = formatDate(maxDateObj);
            filteredStartDate = formatDate(minDateObj);
        }
    }
}

// Cập nhật dropdown chọn Năm và Tháng dựa trên dữ liệu thực tế của trạm đang chọn
function updateDateFilterOptions() {
    const st = stations[currentStation];
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    
    if (!yearSelect || !monthSelect) return;
    
    yearSelect.innerHTML = '';
    monthSelect.innerHTML = '';
    dateOptions = {};
    
    if (!st || !st.chartData || !st.chartData.dates || st.chartData.dates.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Không có dữ liệu';
        yearSelect.appendChild(opt);
        monthSelect.disabled = true;
        return;
    }
    
    // Gom nhóm năm/tháng từ dữ liệu thực tế
    st.chartData.dates.forEach(d => {
        if (d) {
            const parts = d.split('-');
            const y = parts[0];
            const m = parseInt(parts[1]);
            if (!dateOptions[y]) {
                dateOptions[y] = new Set();
            }
            dateOptions[y].add(m);
        }
    });
    
    // Thêm option mặc định "30 ngày gần nhất"
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'default';
    defaultOpt.textContent = '30 ngày gần nhất';
    yearSelect.appendChild(defaultOpt);
    
    // Sắp xếp các năm giảm dần
    const years = Object.keys(dateOptions).sort((a, b) => b - a);
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `Năm ${y}`;
        yearSelect.appendChild(opt);
    });
    
    if (isManualFilterApplied) {
        syncDropdownsToManualFilter();
    } else {
        yearSelect.value = 'default';
        monthSelect.innerHTML = '<option value="">--</option>';
        monthSelect.disabled = true;
    }
}

function onYearChange() {
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    const year = yearSelect.value;
    
    if (year === 'default') {
        isManualFilterApplied = false;
        monthSelect.innerHTML = '<option value="">--</option>';
        monthSelect.disabled = true;
        setDefaultDateRange();
        updateDashboard();
        return;
    }
    
    monthSelect.disabled = false;
    monthSelect.innerHTML = '';
    
    const months = Array.from(dateOptions[year] || []).sort((a, b) => a - b);
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `Tháng ${m}`;
        monthSelect.appendChild(opt);
    });
    
    if (months.length > 0) {
        monthSelect.value = months[0];
        applyDropdownFilter(year, months[0]);
    }
}

function onMonthChange() {
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    const year = yearSelect.value;
    const month = monthSelect.value;
    
    if (year && month) {
        applyDropdownFilter(year, month);
    }
}

function applyDropdownFilter(year, month) {
    isManualFilterApplied = true;
    const mStr = String(month).padStart(2, '0');
    filteredStartDate = `${year}-${mStr}-01`;
    filteredEndDate = `${year}-${mStr}-31`;
    updateDashboard();
}

function resetDateFilter() {
    isManualFilterApplied = false;
    const yearSelect = document.getElementById('filterYear');
    if (yearSelect) {
        yearSelect.value = 'default';
        onYearChange();
    }
}

function syncDropdownsToManualFilter() {
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    if (!yearSelect || !monthSelect || !filteredStartDate) return;
    
    const parts = filteredStartDate.split('-');
    const currentYear = parts[0];
    const currentMonth = parseInt(parts[1]);
    
    if (dateOptions[currentYear]) {
        yearSelect.value = currentYear;
        monthSelect.disabled = false;
        monthSelect.innerHTML = '';
        const months = Array.from(dateOptions[currentYear]).sort((a, b) => a - b);
        months.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = `Tháng ${m}`;
            monthSelect.appendChild(opt);
        });
        
        if (dateOptions[currentYear].has(currentMonth)) {
            monthSelect.value = currentMonth;
        } else {
            monthSelect.value = months[0];
            applyDropdownFilter(currentYear, months[0]);
        }
    } else {
        isManualFilterApplied = false;
        yearSelect.value = 'default';
        monthSelect.innerHTML = '<option value="">--</option>';
        monthSelect.disabled = true;
        setDefaultDateRange();
    }
}

function initChart() {
    const ctx = document.getElementById('timeSeriesChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top' },
                annotation: {
                    annotations: {} // Will be injected dynamically
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Mực nước' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Lượng mưa (mm)' },
                    grid: { drawOnChartArea: false }, // avoid grid overlaps
                    min: 0,
                    max: 150
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateDashboard() {
    const st = stations[currentStation];
    if (!st) return;

    // 1. Lọc dữ liệu theo khoảng ngày đã chọn
    const labels = [];
    const waterData = [];
    const rainData = [];
    
    const rawLabels = st.chartData.labels || [];
    const rawWater = st.chartData.raw || [];
    const rawRain = st.chartData.rainfallRaw || [];
    const rawDates = st.chartData.dates || [];

    for (let i = 0; i < rawLabels.length; i++) {
        const dateStr = rawDates[i]; // e.g. "2008-03-01"
        
        if (filteredStartDate && dateStr && dateStr < filteredStartDate) continue;
        if (filteredEndDate && dateStr && dateStr > filteredEndDate) continue;
        
        labels.push(rawLabels[i]);
        waterData.push(rawWater[i]);
        rainData.push(rawRain[i]);
    }

    // 2. Cập nhật thông tin chi tiết trạm (Left Panel)
    let detailHtml = '';
    
    // Thêm địa bàn
    if (st.location) {
        detailHtml += `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="text-xs text-slate-500 uppercase tracking-wide">Địa bàn</span>
                <span class="font-medium text-slate-800 text-right text-xs">${st.location}</span>
            </div>
        `;
    }
    
    // Thêm tọa độ địa lý
    detailHtml += `
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <span class="text-xs text-slate-500 uppercase tracking-wide">Tọa độ</span>
            <span class="font-mono text-xs text-slate-750">${st.lat.toFixed(4)}, ${st.lng.toFixed(4)}</span>
        </div>
    `;

    // Tính toán số liệu đo đạc (KPIs) dựa trên kết quả lọc
    const validWater = waterData.filter(v => v !== null && v !== undefined);
    const maxW = validWater.length > 0 ? Math.max(...validWater) : 0;
    const minW = validWater.length > 0 ? Math.min(...validWater) : 0;

    const validRain = rainData.filter(v => v !== null && v !== undefined);
    const totalRain = validRain.reduce((a, b) => a + b, 0);
    const maxRain = validRain.length > 0 ? Math.max(...validRain) : 0;

    const isMeter = maxW > 0 && maxW < 100;
    const unit = st.type === 'Trạm đo mưa' || st.type.includes('mưa') ? 'mm' : (isMeter ? 'm' : 'cm');

    const isOverBD3 = st.alarms.bd3 > 0 && maxW >= st.alarms.bd3;

    // Thêm cao độ thiết kế
    if (st.elevations && (st.elevations.peak > 0 || st.elevations.bed !== 0)) {
        detailHtml += `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="text-xs text-slate-500 uppercase tracking-wide">Đỉnh thiết kế</span>
                <span class="font-medium text-slate-800">${st.elevations.peak} ${unit}</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="text-xs text-slate-500 uppercase tracking-wide">Chân thiết kế</span>
                <span class="font-medium text-slate-800">${st.elevations.bed} ${unit}</span>
            </div>
        `;
    }

    // Thêm các ngưỡng báo động
    if (st.alarms && st.alarms.bd1 > 0) {
        detailHtml += `
            <div class="flex justify-between items-center border-b border-slate-100 pb-2 bg-slate-50 px-1 py-1 rounded">
                <span class="text-xs text-slate-500 uppercase tracking-wide">Ngưỡng BĐ 1/2/3</span>
                <span class="font-bold text-xs text-slate-800">${st.alarms.bd1} / ${st.alarms.bd2} / ${st.alarms.bd3} ${unit}</span>
            </div>
        `;
    }

    const infoHtml = `
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <span class="text-xs text-slate-500 uppercase tracking-wide">Mã Trạm</span>
            <span class="font-bold text-slate-800">${st.id}</span>
        </div>
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <span class="text-xs text-slate-500 uppercase tracking-wide">Tên Trạm</span>
            <span class="font-medium text-slate-800 text-right">${st.name}</span>
        </div>
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <span class="text-xs text-slate-500 uppercase tracking-wide">Loại Trạm</span>
            <span class="font-bold ${st.typeColor}">${st.type}</span>
        </div>
        ${detailHtml}
        <div class="pt-2">
            <p class="text-xs text-slate-600 leading-relaxed"><strong>Mô tả:</strong> ${st.desc}</p>
        </div>
    `;
    document.getElementById('stationInfoPanel').innerHTML = infoHtml;

    // Thiết lập màu sắc cảnh báo nguy hiểm
    const alertBg = document.getElementById('alertBg');
    if (isOverBD3) {
        alertBg.classList.remove('opacity-0');
        alertBg.classList.add('opacity-100');
    } else {
        alertBg.classList.remove('opacity-100');
        alertBg.classList.add('opacity-0');
    }

    let statusColor = 'text-emerald-600';
    let statusText = 'Bình thường';
    if (isOverBD3) {
        statusColor = 'text-rose-600 animate-pulse';
        statusText = 'Vượt Báo Động 3';
    } else if (st.alarms.bd2 > 0 && maxW >= st.alarms.bd2) {
        statusColor = 'text-orange-500';
        statusText = 'Vượt Báo Động 2';
    } else if (st.alarms.bd1 > 0 && maxW >= st.alarms.bd1) {
        statusColor = 'text-amber-500';
        statusText = 'Vượt Báo Động 1';
    }

    const maxWStr = maxW > 0 ? `${maxW} ${unit}` : '--';
    const minWStr = minW > 0 ? `${minW} ${unit}` : '--';
    const totalRainStr = totalRain > 0 ? `${Math.round(totalRain)} mm` : '--';
    const rainStatus = totalRain > 150 ? 'Mưa lũ tích lũy lớn' : totalRain > 50 ? 'Mưa to' : totalRain > 0 ? 'Mưa nhỏ' : 'Không mưa';

    const kpiHtml = `
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 ${isOverBD3 ? 'border-rose-300 bg-rose-50' : ''}">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Đỉnh</div>
            <div class="text-2xl font-bold ${isOverBD3 ? 'text-rose-700' : 'text-slate-800'}">${maxWStr}</div>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Đáy</div>
            <div class="text-2xl font-bold text-slate-800">${minWStr}</div>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Lượng mưa tích lũy</div>
            <div class="text-2xl font-bold text-sky-600">${totalRainStr}</div>
            <div class="text-xs text-slate-500 mt-1">${rainStatus}</div>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Tình trạng</div>
            <div class="text-lg font-bold flex items-center gap-2 ${statusColor}">
                ${isOverBD3 ? '⚠️' : ''} ${statusText}
            </div>
        </div>
    `;
    document.getElementById('kpiContainer').innerHTML = kpiHtml;

    // 4. Vẽ biểu đồ hỗn hợp (Mực nước: Line màu xanh lá, Lượng mưa: Bar màu xanh dương)
    chartInstance.data.labels = labels;
    chartInstance.data.datasets = [
        {
            type: 'line',
            label: `Mực nước (${unit})`,
            data: waterData,
            borderColor: '#10b981', // Màu xanh lá cho Mực nước
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: '#10b981',
            tension: 0.4,
            spanGaps: true,
            fill: true,
            yAxisID: 'y'
        },
        {
            type: 'bar',
            label: 'Lượng mưa (mm)',
            data: rainData,
            borderColor: '#0ea5e9', // Màu xanh dương cho Lượng mưa
            backgroundColor: 'rgba(14, 165, 233, 0.35)',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'y1',
            spanGaps: true
        }
    ];

    // Thiết lập giới hạn tự động cho trục Mực nước
    let yMin = 0;
    let yMax = 100;
    if (validWater.length > 0) {
        const minVal = Math.min(...validWater);
        const maxVal = Math.max(...validWater);
        const diff = maxVal - minVal;
        yMin = minVal - (diff * 0.1 || 1);
        yMax = maxVal + (diff * 0.1 || 1);
        if (yMin < 0 && minVal >= 0) yMin = 0;
    } else {
        yMin = 0;
        yMax = 10;
    }

    chartInstance.options.scales.y.title.text = `Mực nước (${unit})`;
    chartInstance.options.scales.y.min = Math.floor(yMin);
    chartInstance.options.scales.y.max = Math.ceil(yMax);

    // Thiết lập giới hạn tự động cho trục Lượng mưa (trục phải)
    chartInstance.options.scales.y1.max = Math.ceil((maxRain * 1.2 || 10) / 10) * 10;

    // Vẽ động các ngưỡng báo động lũ (nếu lớn hơn 0)
    const annotations = {};
    const labelBg1 = 'rgba(245, 158, 11, 0.8)';
    const labelBg2 = 'rgba(234, 88, 12, 0.8)';
    const labelBg3 = 'rgba(225, 29, 72, 0.8)';

    if (st.alarms.bd1 && st.alarms.bd1 > 0) {
        annotations.bd1 = {
            type: 'line',
            yMin: st.alarms.bd1,
            yMax: st.alarms.bd1,
            borderColor: '#f59e0b',
            borderWidth: 1.5,
            borderDash: [5, 5],
            label: { content: 'Báo động 1', display: true, position: 'start', backgroundColor: labelBg1 }
        };
    }
    if (st.alarms.bd2 && st.alarms.bd2 > 0) {
        annotations.bd2 = {
            type: 'line',
            yMin: st.alarms.bd2,
            yMax: st.alarms.bd2,
            borderColor: '#ea580c',
            borderWidth: 1.5,
            borderDash: [5, 5],
            label: { content: 'Báo động 2', display: true, position: 'start', backgroundColor: labelBg2 }
        };
    }
    if (st.alarms.bd3 && st.alarms.bd3 > 0) {
        annotations.bd3 = {
            type: 'line',
            yMin: st.alarms.bd3,
            yMax: st.alarms.bd3,
            borderColor: '#e11d48',
            borderWidth: 1.5,
            borderDash: [5, 5],
            label: { content: 'Báo động 3', display: true, position: 'start', backgroundColor: labelBg3 }
        };
    }
    chartInstance.options.plugins.annotation.annotations = annotations;
    chartInstance.update();
}

// Khởi tạo Dashboard khi DOM load xong
window.onload = () => {
    initMap();
    initChart();
    setTimeout(() => {
        if (stations[currentStation]) {
            updateDateFilterOptions();
            setDefaultDateRange();
        }
        updateDashboard();
    }, 100);
};

// ====================================================
// CẤU HÌNH KẾT NỐI SUPABASE (DATABASE CONNECTION)
// ====================================================
// ĐIỀN THÔNG TIN SUPABASE CỦA BẠN DƯỚI ĐÂY ĐỂ ĐỒNG BỘ CSDL POSTGRESQL + POSTGIS:
// Lấy thông tin cấu hình Supabase từ tệp config.js để đảm bảo bảo mật và không bị lộ key trên github
const SUPABASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_URL : ''; 
const SUPABASE_ANON_KEY = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_ANON_KEY : '';

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase Client đã được khởi tạo thành công!");

        // Chờ Bản đồ & Biểu đồ khởi tạo xong rồi tải dữ liệu từ CSDL
        setTimeout(() => {
            loadDataFromSupabase();
        }, 500);
    } catch (err) {
        console.error("Không thể khởi tạo Supabase Client:", err.message);
    }
}

// Tải dữ liệu chi tiết cho trạm được chọn từ Supabase (hỗ trợ lấy tối đa 25.000 dòng để vượt qua giới hạn 1000 dòng mặc định)
async function loadStationData(stId) {
    const st = stations[stId];
    if (!st || !supabaseClient) return;
    
    // Nếu trạm đã được load đầy đủ dữ liệu từ trước, dùng luôn
    if (st.loaded) return;
    
    console.log(`Đang tải toàn bộ dữ liệu quan trắc cho trạm: ${st.name}...`);
    try {
        if (st.id.startsWith('MN_')) {
            const { data, error } = await supabaseClient
                .from('tram_thuy_van')
                .select('ngay, gio, mucNuoc')
                .eq('tenTram', st.name)
                .order('ngay', { ascending: true })
                .order('gio', { ascending: true })
                .limit(25000); // Lấy tối đa 25.000 dòng (quá đủ cho trạm Phú An/Nhà Bè đo hàng ngày trong 15 năm)
                
            if (error) throw error;
            
            st.chartData.labels = [];
            st.chartData.dates = [];
            st.chartData.raw = [];
            st.chartData.rainfallRaw = [];
            
            data.forEach(row => {
                const label = `${row.gio || ''} ${row.ngay ? row.ngay.substring(5) : ''}`.trim();
                st.chartData.labels.push(label);
                st.chartData.dates.push(row.ngay);
                st.chartData.raw.push(row.mucNuoc);
                st.chartData.rainfallRaw.push(null);
            });
        } else if (st.id.startsWith('MUA_')) {
            const { data, error } = await supabaseClient
                .from('tram_luong_mua')
                .select('ngay, gio, luongMua')
                .eq('tenTram', st.name)
                .order('ngay', { ascending: true })
                .order('gio', { ascending: true })
                .limit(25000);
                
            if (error) throw error;
            
            st.chartData.labels = [];
            st.chartData.dates = [];
            st.chartData.raw = [];
            st.chartData.rainfallRaw = [];
            
            data.forEach(row => {
                const label = `${row.gio || ''} ${row.ngay ? row.ngay.substring(5) : ''}`.trim();
                st.chartData.labels.push(label);
                st.chartData.dates.push(row.ngay);
                st.chartData.raw.push(null);
                st.chartData.rainfallRaw.push(row.luongMua);
            });
        }
        st.loaded = true;
        console.log(`Đã tải thành công ${st.chartData.dates.length} bản ghi của trạm ${st.name}`);
    } catch (err) {
        console.error(`Lỗi tải dữ liệu chi tiết của trạm ${st.name}:`, err.message);
    }
}

async function loadDataFromSupabase() {
    if (!supabaseClient) return;
    try {
        console.log("Đang đồng bộ dữ liệu thực địa từ Supabase...");

        // Khởi tạo lại trạng thái loaded của các trạm
        for (const key in stations) {
            stations[key].loaded = false;
            stations[key].chartData = { labels: [], dates: [], raw: [], rainfallRaw: [] };
        }

        // Chọn trạm mặc định đầu tiên
        currentStation = Object.keys(stations)[0];
        
        // Tải toàn bộ dữ liệu lịch sử cho trạm mặc định đầu tiên
        await loadStationData(currentStation);

        const firstSt = stations[currentStation];
        if (leafletMap && firstSt) {
            leafletMap.setView([firstSt.lat, firstSt.lng], 10);
        }

        updateDateFilterOptions();
        if (!isManualFilterApplied) {
            setDefaultDateRange();
        }

        // Vẽ marker lên bản đồ
        if (leafletMap) {
            // Xóa marker cũ
            leafletMap.eachLayer((layer) => {
                if (layer instanceof L.Marker) {
                    leafletMap.removeLayer(layer);
                }
            });

            mapMarkers = {};
            for (const key in stations) {
                const st = stations[key];

                const iconHtml = `
                    <div style="position: relative;">
                        ${key === currentStation ? '<div class="marker-pulse"></div>' : ''}
                        <div class="marker-pin" style="background-color: ${st.dotColor}; ${key === currentStation ? 'transform: translate(-50%, -50%) scale(1.2); border-color: #0f172a;' : ''}"></div>
                    </div>
                `;

                const customIcon = L.divIcon({
                    html: iconHtml,
                    className: 'leaflet-div-icon',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                const marker = L.marker([st.lat, st.lng], { icon: customIcon }).addTo(leafletMap);
                marker.bindTooltip(`<b>${st.id}</b><br>${st.name}`, { direction: 'top', offset: [0, -10] });

                marker.on('click', async () => {
                    currentStation = key;
                    updateMapMarkers();
                    leafletMap.panTo([st.lat, st.lng]);
                    
                    // Tải dữ liệu chi tiết của trạm này (nếu chưa tải)
                    await loadStationData(key);
                    
                    updateDateFilterOptions();
                    if (!isManualFilterApplied) {
                        setDefaultDateRange();
                    } else {
                        syncDropdownsToManualFilter();
                    }
                    updateDashboard();
                });

                mapMarkers[key] = marker;
            }
        }

        updateDashboard();
        console.log("Đã vẽ đầy đủ 16 trạm đo thực tế lên bản đồ và tải xong dữ liệu trạm mặc định!");
    } catch (e) {
        console.error("Lỗi đồng bộ dữ liệu Supabase:", e.message);
    }
}

