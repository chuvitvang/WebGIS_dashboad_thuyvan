let currentStation = '';
let currentMode = 'raw';
let chartInstance = null;
let leafletMap = null;
let mapMarkers = {};
let stations = {};

// Initialize Leaflet Map (Khởi tạo bản đồ trống quanh khu vực TP. Hồ Chí Minh)
function initMap() {
    leafletMap = L.map('gisMap').setView([10.77, 106.70], 10);

    // Add Esri World Topo Map for a nice terrain look
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 18
    }).addTo(leafletMap);
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

// Hàm thiết lập khoảng ngày mặc định (30 ngày gần nhất tính từ ngày mới nhất có dữ liệu của trạm trong CSDL)
async function setDefaultDateRange() {
    const st = stations[currentStation];
    if (!st || !supabaseClient) {
        const today = new Date();
        const past30Days = new Date();
        past30Days.setDate(today.getDate() - 30);
        
        filteredEndDate = formatDate(today);
        filteredStartDate = formatDate(past30Days);
        return;
    }

    try {
        const tableName = st.id.startsWith('MN_') ? 'tram_thuy_van' : 'tram_luong_mua';
        
        // Lấy ngày mới nhất có dữ liệu của trạm trong database
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('ngay')
            .eq('tenTram', st.name)
            .order('ngay', { ascending: false })
            .limit(1);

        if (error) throw error;

        let latest = null;
        if (data && data.length > 0 && data[0].ngay) {
            latest = data[0].ngay;
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
    } catch (err) {
        console.error("Lỗi xác định khoảng ngày mặc định:", err.message);
        const today = new Date();
        const past30Days = new Date();
        past30Days.setDate(today.getDate() - 30);
        
        filteredEndDate = formatDate(today);
        filteredStartDate = formatDate(past30Days);
    }
}

// Cập nhật dropdown chọn Năm và Tháng dựa trên dữ liệu thực tế của trạm đang chọn
async function updateDateFilterOptions() {
    const st = stations[currentStation];
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    
    if (!yearSelect || !monthSelect) return;
    
    yearSelect.innerHTML = '';
    monthSelect.innerHTML = '';
    dateOptions = {};
    
    if (!st || !supabaseClient) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Không có dữ liệu';
        yearSelect.appendChild(opt);
        monthSelect.disabled = true;
        return;
    }
    
    try {
        const tableName = st.id.startsWith('MN_') ? 'tram_thuy_van' : 'tram_luong_mua';
        
        // Truy vấn năm nhỏ nhất và năm lớn nhất của trạm để dựng bộ lọc
        const [minRes, maxRes] = await Promise.all([
            supabaseClient.from(tableName).select('year').eq('tenTram', st.name).order('year', { ascending: true }).limit(1),
            supabaseClient.from(tableName).select('year').eq('tenTram', st.name).order('year', { ascending: false }).limit(1)
        ]);

        let minYear = 2008;
        let maxYear = new Date().getFullYear();

        if (minRes.data && minRes.data.length > 0 && minRes.data[0].year) {
            minYear = minRes.data[0].year;
        }
        if (maxRes.data && maxRes.data.length > 0 && maxRes.data[0].year) {
            maxYear = maxRes.data[0].year;
        }

        // Tạo mảng năm tháng giả định (từ minYear đến maxYear, mỗi năm đầy đủ 12 tháng)
        for (let y = minYear; y <= maxYear; y++) {
            dateOptions[y] = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        }
        
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
    } catch (err) {
        console.error("Lỗi khi tải bộ lọc năm tháng từ Supabase:", err.message);
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Lỗi nạp năm';
        yearSelect.appendChild(opt);
        monthSelect.disabled = true;
    }
}

async function onYearChange() {
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    const year = yearSelect.value;
    
    if (year === 'default') {
        isManualFilterApplied = false;
        monthSelect.innerHTML = '<option value="">--</option>';
        monthSelect.disabled = true;
        await setDefaultDateRange();
        await loadStationData(currentStation, filteredStartDate, filteredEndDate);
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
        await applyDropdownFilter(year, months[0]);
    }
}

async function onMonthChange() {
    const yearSelect = document.getElementById('filterYear');
    const monthSelect = document.getElementById('filterMonth');
    const year = yearSelect.value;
    const month = monthSelect.value;
    
    if (year && month) {
        await applyDropdownFilter(year, month);
    }
}

async function applyDropdownFilter(year, month) {
    isManualFilterApplied = true;
    const mStr = String(month).padStart(2, '0');
    filteredStartDate = `${year}-${mStr}-01`;
    // Tính ngày cuối cùng của tháng đó một cách chính xác (28, 29, 30 hoặc 31 ngày)
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    filteredEndDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
    
    // Tải lại dữ liệu quan trắc cho khoảng ngày mới
    await loadStationData(currentStation, filteredStartDate, filteredEndDate);
    updateDashboard();
}

async function resetDateFilter() {
    isManualFilterApplied = false;
    const yearSelect = document.getElementById('filterYear');
    if (yearSelect) {
        yearSelect.value = 'default';
        await onYearChange();
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
    const peakData = [];
    const bedData = [];
    const rainData = [];
    const uniqueRainyDays = new Set();
    
    const rawLabels = st.chartData.labels || [];
    const rawPeak = st.chartData.peak || [];
    const rawBed = st.chartData.bed || [];
    const rawRain = st.chartData.rainfallRaw || [];
    const rawDates = st.chartData.dates || [];

    for (let i = 0; i < rawLabels.length; i++) {
        const dateStr = rawDates[i]; // e.g. "2008-03-01"
        
        if (filteredStartDate && dateStr && dateStr < filteredStartDate) continue;
        if (filteredEndDate && dateStr && dateStr > filteredEndDate) continue;
        
        labels.push(rawLabels[i]);
        peakData.push(rawPeak[i]);
        bedData.push(rawBed[i]);
        rainData.push(rawRain[i]);
        
        // Lưu trữ ngày độc nhất có lượng mưa thực tế lớn hơn 0
        if (rawRain[i] && rawRain[i] > 0 && dateStr) {
            uniqueRainyDays.add(dateStr);
        }
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
    const validPeak = peakData.filter(v => v !== null && v !== undefined);
    const validBed = bedData.filter(v => v !== null && v !== undefined);
    const validWater = [...validPeak, ...validBed];
    
    const maxW = validPeak.length > 0 ? Math.max(...validPeak) : 0;
    const minW = validBed.length > 0 ? Math.min(...validBed) : 0;

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

    const isRainStation = st.type === 'Trạm đo mưa' || st.type.includes('mưa');
    let kpiHtml = '';

    if (isRainStation) {
        // --- KPI cho Trạm Lượng Mưa ---
        let rainStatusColor = 'text-emerald-600';
        let rainStatusText = 'Bình thường';
        let rainIcon = '☀️';

        if (totalRain > 150) {
            rainStatusColor = 'text-rose-600 animate-pulse font-bold';
            rainStatusText = 'Mưa rất to';
            rainIcon = '⛈️';
        } else if (totalRain > 50) {
            rainStatusColor = 'text-orange-500 font-bold';
            rainStatusText = 'Mưa to';
            rainIcon = '🌧️';
        } else if (totalRain > 10) {
            rainStatusColor = 'text-sky-600';
            rainStatusText = 'Mưa vừa';
            rainIcon = '🌦️';
        } else if (totalRain > 0) {
            rainStatusColor = 'text-sky-500';
            rainStatusText = 'Mưa nhỏ';
            rainIcon = '💧';
        }

        const maxRainStr = maxRain > 0 ? `${maxRain.toFixed(1)} mm` : '--';
        const totalRainStr = totalRain > 0 ? `${totalRain.toFixed(1)} mm` : '0.0 mm';
        const rainyDays = uniqueRainyDays.size;

        kpiHtml = `
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Tổng Lượng Mưa</div>
                <div class="text-2xl font-bold text-sky-600">${totalRainStr}</div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Lượng Mưa Lớn Nhất</div>
                <div class="text-2xl font-bold text-sky-500">${maxRainStr}</div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Số ngày có mưa</div>
                <div class="text-2xl font-bold text-slate-700">${rainyDays} ngày</div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Tình trạng</div>
                <div class="text-lg font-bold flex items-center gap-2 ${rainStatusColor}">
                    ${rainIcon} ${rainStatusText}
                </div>
            </div>
        `;
    } else {
        // --- KPI cho Trạm Mực Nước ---
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

        const maxWStr = validWater.length > 0 ? `${maxW.toFixed(2)} ${unit}` : '--';
        const minWStr = validWater.length > 0 ? `${minW.toFixed(2)} ${unit}` : '--';
        
        // Tính toán Mực nước Trung bình
        const avgW = validWater.length > 0 ? (validWater.reduce((a, b) => a + b, 0) / validWater.length) : 0;
        const avgWStr = validWater.length > 0 ? `${avgW.toFixed(2)} ${unit}` : '--';

        kpiHtml = `
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 ${isOverBD3 ? 'border-rose-300 bg-rose-50' : ''}">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Đỉnh</div>
                <div class="text-2xl font-bold ${isOverBD3 ? 'text-rose-700' : 'text-slate-800'}">${maxWStr}</div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Đáy</div>
                <div class="text-2xl font-bold text-slate-800">${minWStr}</div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Trung bình</div>
                <div class="text-2xl font-bold text-slate-800">${avgWStr}</div>
            </div>
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Tình trạng</div>
                <div class="text-lg font-bold flex items-center gap-2 ${statusColor}">
                    ${isOverBD3 ? '⚠️' : ''} ${statusText}
                </div>
            </div>
        `;
    }
    document.getElementById('kpiContainer').innerHTML = kpiHtml;

    // 4. Vẽ biểu đồ hỗn hợp động dựa theo loại trạm (Mực nước: Line màu xanh lá, Lượng mưa: Bar màu xanh dương)
    chartInstance.data.labels = labels;
    
    const datasets = [];

    // Chỉ vẽ đường Mực nước nếu trạm không phải là trạm đo lượng mưa thuần túy
    if (!isRainStation && validWater.length > 0) {
        datasets.push({
            type: 'line',
            label: `Mực nước Đỉnh (${unit})`,
            data: peakData,
            borderColor: '#10b981', // Màu xanh lá cho Mực nước Đỉnh
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderWidth: 2.2,
            pointRadius: 2.5,
            pointBackgroundColor: '#10b981',
            tension: 0.35,
            spanGaps: true,
            fill: false,
            yAxisID: 'y'
        });
        datasets.push({
            type: 'line',
            label: `Mực nước Đáy (${unit})`,
            data: bedData,
            borderColor: '#06b6d4', // Màu xanh ngọc bích cho Mực nước Đáy
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            borderWidth: 2.2,
            pointRadius: 2.5,
            pointBackgroundColor: '#06b6d4',
            tension: 0.35,
            spanGaps: true,
            fill: false,
            yAxisID: 'y'
        });
    }

    // Chỉ vẽ cột Lượng mưa nếu là trạm đo mưa hoặc trạm mực nước có ghi nhận dữ liệu lượng mưa
    if (isRainStation || validRain.length > 0) {
        datasets.push({
            type: 'bar',
            label: 'Lượng mưa (mm)',
            data: rainData,
            borderColor: '#0ea5e9', // Màu xanh dương cho Lượng mưa
            backgroundColor: 'rgba(14, 165, 233, 0.35)',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'y1',
            spanGaps: true
        });
    }

    chartInstance.data.datasets = datasets;

    // Thiết lập giới hạn tự động cho trục Mực nước (bao gồm cả Đỉnh/Chân thiết kế nếu có)
    let yMin = 0;
    let yMax = 100;
    if (validWater.length > 0) {
        let minVal = Math.min(...validWater);
        let maxVal = Math.max(...validWater);
        
        // Đưa đỉnh và chân thiết kế vào tính toán khoảng trục Y để đảm bảo chúng luôn hiển thị
        if (st.elevations) {
            if (st.elevations.peak > 0) {
                maxVal = Math.max(maxVal, st.elevations.peak);
            }
            if (st.elevations.bed !== 0) {
                minVal = Math.min(minVal, st.elevations.bed);
            }
        }
        
        const diff = maxVal - minVal;
        yMin = minVal - (diff * 0.15 || 1);
        yMax = maxVal + (diff * 0.15 || 1);
        if (yMin < 0 && minVal >= 0) yMin = 0;
    } else {
        yMin = 0;
        yMax = 10;
    }

    // Bật/tắt hiển thị trục Y động tùy theo loại trạm đang xem
    if (isRainStation) {
        chartInstance.options.scales.y.display = false;   // Ẩn trục mực nước bên trái
        chartInstance.options.scales.y1.display = true;   // Hiển thị trục lượng mưa bên phải
    } else {
        chartInstance.options.scales.y.display = true;    // Hiển thị trục mực nước bên trái
        chartInstance.options.scales.y1.display = validRain.length > 0; // Chỉ hiển thị lượng mưa nếu có dữ liệu
    }

    chartInstance.options.scales.y.title.text = `Mực nước (${unit})`;
    chartInstance.options.scales.y.min = Math.floor(yMin * 10) / 10;
    chartInstance.options.scales.y.max = Math.ceil(yMax * 10) / 10;

    // Thiết lập giới hạn tự động cho trục Lượng mưa (trục phải)
    chartInstance.options.scales.y1.max = Math.ceil((maxRain * 1.2 || 10) / 10) * 10;

    // Vẽ động các đường giới hạn thiết kế và cảnh báo lũ (chỉ vẽ đối với trạm đo mực nước)
    const annotations = {};
    
    if (!isRainStation) {
        const labelBg1 = 'rgba(245, 158, 11, 0.85)';
        const labelBg2 = 'rgba(234, 88, 12, 0.85)';
        const labelBg3 = 'rgba(225, 29, 72, 0.85)';
        const labelBgPeak = 'rgba(71, 85, 105, 0.85)';  // Slate 600 cho Đỉnh thiết kế
        const labelBgBed = 'rgba(100, 116, 139, 0.85)';   // Slate 500 cho Chân thiết kế

        // 1. Vẽ Đỉnh & Chân thiết kế của công trình (nếu có thông số)
        if (st.elevations && st.elevations.peak > 0) {
            annotations.peakElevation = {
                type: 'line',
                yMin: st.elevations.peak,
                yMax: st.elevations.peak,
                borderColor: '#475569',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: { content: 'Đỉnh thiết kế', display: true, position: 'end', backgroundColor: labelBgPeak }
            };
        }
        if (st.elevations && st.elevations.bed !== 0) {
            annotations.bedElevation = {
                type: 'line',
                yMin: st.elevations.bed,
                yMax: st.elevations.bed,
                borderColor: '#64748b',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: { content: 'Chân thiết kế', display: true, position: 'end', backgroundColor: labelBgBed }
            };
        }

        // 2. Vẽ các ngưỡng báo động lũ (nếu có thông số)
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
// Tải dữ liệu đo đạc (Mực nước hoặc Lượng mưa) trong khoảng ngày nhất định từ Supabase
async function loadStationData(stId, startDate, endDate) {
    const st = stations[stId];
    if (!st || !supabaseClient) return;
    
    console.log(`Đang tải dữ liệu cho trạm: ${st.name} từ ${startDate} đến ${endDate}...`);
    try {
        if (st.id.startsWith('MN_')) {
            const { data, error } = await supabaseClient
                .from('tram_thuy_van')
                .select('ngay, gio, doCaoDinhT, doCaoChanT')
                .eq('tenTram', st.name)
                .gte('ngay', startDate)
                .lte('ngay', endDate)
                .order('ngay', { ascending: true })
                .order('gio', { ascending: true })
                .limit(25000); 
                
            if (error) throw error;
            
            st.chartData.labels = [];
            st.chartData.dates = [];
            st.chartData.peak = [];
            st.chartData.bed = [];
            st.chartData.raw = [];
            st.chartData.rainfallRaw = [];
            
            data.forEach(row => {
                const label = `${row.gio || ''} ${row.ngay ? row.ngay.substring(5) : ''}`.trim();
                st.chartData.labels.push(label);
                st.chartData.dates.push(row.ngay);
                st.chartData.peak.push(row.doCaoDinhT);
                st.chartData.bed.push(row.doCaoChanT);
                st.chartData.raw.push(null);
                st.chartData.rainfallRaw.push(null);
            });
        } else if (st.id.startsWith('MUA_')) {
            const { data, error } = await supabaseClient
                .from('tram_luong_mua')
                .select('ngay, gio, luongMua')
                .eq('tenTram', st.name)
                .gte('ngay', startDate)
                .lte('ngay', endDate)
                .order('ngay', { ascending: true })
                .order('gio', { ascending: true })
                .limit(25000);
                
            if (error) throw error;
            
            st.chartData.labels = [];
            st.chartData.dates = [];
            st.chartData.peak = [];
            st.chartData.bed = [];
            st.chartData.raw = [];
            st.chartData.rainfallRaw = [];
            
            data.forEach(row => {
                const label = `${row.gio || ''} ${row.ngay ? row.ngay.substring(5) : ''}`.trim();
                st.chartData.labels.push(label);
                st.chartData.dates.push(row.ngay);
                st.chartData.peak.push(null);
                st.chartData.bed.push(null);
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
        console.log("Đang tải danh sách trạm từ Supabase...");
        
        // 1. Tải danh sách trạm từ bảng danh_sach_tram
        const { data: stationsData, error: stationsError } = await supabaseClient
            .from('danh_sach_tram')
            .select('*');
            
        if (stationsError) {
            throw new Error("Không thể tải danh sách trạm: " + stationsError.message);
        }
        
        if (!stationsData || stationsData.length === 0) {
            throw new Error("Không có dữ liệu trạm nào trong bảng danh_sach_tram!");
        }

        // 2. Chuyển đổi dữ liệu sang cấu trúc stations
        stations = {};
        stationsData.forEach(row => {
            stations[row.id] = {
                id: row.id,
                name: row.name,
                type: row.type,
                typeColor: row.typeColor,
                dotColor: row.dotColor,
                lat: row.lat,
                lng: row.lng,
                location: row.location,
                elevations: {
                    peak: row.elevations_peak || 0,
                    bed: row.elevations_bed || 0
                },
                desc: row.desc || '',
                alarms: {
                    bd1: row.alarms_bd1 || 0,
                    bd2: row.alarms_bd2 || 0,
                    bd3: row.alarms_bd3 || 0
                },
                chartData: { labels: [], dates: [], raw: [], rainfallRaw: [] },
                loaded: false
            };
        });

        console.log(`Đã tải thành công ${Object.keys(stations).length} trạm từ Supabase.`);
        console.log("Đang đồng bộ dữ liệu thực địa từ Supabase...");

        // Chọn trạm mặc định đầu tiên
        currentStation = Object.keys(stations)[0];
        
        // Tải khoảng năm của trạm và cập nhật Dropdown bộ lọc
        await updateDateFilterOptions();

        // Xác định ngày bắt đầu/kết thúc mặc định (30 ngày gần nhất)
        if (!isManualFilterApplied) {
            await setDefaultDateRange();
        }

        // Tải toàn bộ dữ liệu quan trắc cho trạm mặc định đầu tiên theo khoảng ngày mặc định
        await loadStationData(currentStation, filteredStartDate, filteredEndDate);

        const firstSt = stations[currentStation];
        if (leafletMap && firstSt) {
            leafletMap.setView([firstSt.lat, firstSt.lng], 10);
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
                    
                    // Tải khoảng năm và cập nhật dropdown cho trạm được click
                    await updateDateFilterOptions();
                    
                    // Xác định khoảng ngày 30 ngày gần nhất của trạm được chọn
                    if (!isManualFilterApplied) {
                        await setDefaultDateRange();
                    } else {
                        syncDropdownsToManualFilter();
                    }
                    
                    // Tải dữ liệu thực tế của trạm này
                    await loadStationData(key, filteredStartDate, filteredEndDate);
                    updateDashboard();
                });

                mapMarkers[key] = marker;
            }
        }

        updateDashboard();
        console.log("Đã vẽ đầy đủ trạm đo thực tế lên bản đồ và tải xong dữ liệu trạm mặc định!");
    } catch (e) {
        console.error("Lỗi đồng bộ dữ liệu Supabase:", e.message);
    }
}


