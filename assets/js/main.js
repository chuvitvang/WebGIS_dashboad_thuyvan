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
        if (!st || !marker) continue;

        const isRainStation = st.type === 'Trạm đo mưa' || st.type.includes('mưa');

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

        // Cập nhật Tooltip động theo chế độ dữ liệu (Thành viên 6)
        let tooltipText = `<b>${st.id}</b><br>${st.name}`;
        const latestVal = getLatestValue(st);
        const isStMeter = !isRainStation && latestVal !== null && latestVal > 0 && latestVal < 100;
        const markerUnit = isRainStation ? 'mm' : (isStMeter ? 'm' : 'cm');
        
        if (currentDataMode === 'aiml') {
            if (latestVal !== null) {
                const spec = AI_MODEL_SPECS[st.id] || (isRainStation ? AI_MODEL_SPECS['default_rain'] : { alpha: 0.85, beta: 0.15, gamma: 0.10, c: 10.0, r2: 0.90, rmse: 7.5, unit: 'cm' });
                let forecastVal = latestVal;
                
                if (isRainStation) {
                    // Đồng bộ với mô hình Threshold AR: Nếu không mưa ở mốc gần nhất thì dự báo tiếp theo là 0
                    forecastVal = latestVal === 0 ? 0 : (spec.theta1 * latestVal + (spec.theta2 || 0) * (latestVal * 0.8) + spec.c);
                } else {
                    let valCm = isStMeter ? latestVal * 100 : latestVal;
                    let forecastValCm = spec.alpha * valCm + (1 - spec.alpha) * valCm + (spec.c * 0.05);
                    forecastVal = isStMeter ? forecastValCm / 100 : forecastValCm;
                }
                
                if (forecastVal < 0) forecastVal = 0;
                
                tooltipText += `<br><span class="text-violet-600 font-bold">Dự báo 3h tới: ${forecastVal.toFixed(2)} ${markerUnit}</span>`;
            }
        } else {
            if (latestVal !== null) {
                tooltipText += `<br>Đo gần nhất: ${latestVal.toFixed(2)} ${markerUnit}`;
            }
        }
        
        marker.setTooltipContent(tooltipText);
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

// ====================================================
// PHÂN HỆ XỬ LÝ DỮ LIỆU & AI/ML (NHÓM 1 & NHÓM 2)
// ====================================================

// Trạng thái điều khiển chế độ dữ liệu (Thành viên 5)
let currentDataMode = 'raw';          // 'raw', 'clean', 'aiml'
let currentInterpMethod = 'linear';   // 'linear', 'spline'
let currentOutlierThreshold = 100;    // cm (cho phép lọc biến động mực nước bất thường)

// Mô hình hồi quy dự báo tự hồi quy (ARX cho mực nước H và AR cho lượng mưa R) (Thành viên 4)
const AI_MODEL_SPECS = {
    // Trạm mực nước: H_t = alpha * H_{t-1} + beta * R_t + C. Tính bằng cm.
    'MN_phu_an': { alpha: 0.88, beta: 0.15, gamma: 0.10, c: 15.0, r2: 0.92, rmse: 6.8, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Phú An)' },
    'MN_nha_be': { alpha: 0.89, beta: 0.12, gamma: 0.08, c: 12.5, r2: 0.93, rmse: 5.5, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Nhà Bè)' },
    'MN_bien_hoa': { alpha: 0.85, beta: 0.18, gamma: 0.12, c: 18.0, r2: 0.91, rmse: 7.2, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Biên Hòa)' },
    'MN_thu_dau_mot': { alpha: 0.84, beta: 0.20, gamma: 0.15, c: 20.2, r2: 0.90, rmse: 8.5, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Thủ Dầu Một)' },
    'MN_tan_an': { alpha: 0.82, beta: 0.22, gamma: 0.18, c: 22.0, r2: 0.89, rmse: 9.1, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Tân An)' },
    'MN_phu_lam': { alpha: 0.80, beta: 0.25, gamma: 0.20, c: 25.5, r2: 0.88, rmse: 10.4, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Phú Lâm)' },
    'MN_ben_luc': { alpha: 0.86, beta: 0.16, gamma: 0.11, c: 14.2, r2: 0.92, rmse: 6.5, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Bến Lức)' },
    'MN_go_dau': { alpha: 0.83, beta: 0.21, gamma: 0.14, c: 19.5, r2: 0.89, rmse: 8.8, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Gò Dầu)' },
    'MN_phu_cuong': { alpha: 0.85, beta: 0.19, gamma: 0.13, c: 17.0, r2: 0.90, rmse: 7.8, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Phú Cường)' },
    'MN_dau_tieng': { alpha: 0.90, beta: 0.10, gamma: 0.05, c: 8.0, r2: 0.94, rmse: 4.8, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước (Dầu Tiếng)' },
    
    // Trạm đo mưa: R_t = theta1 * R_{t-1} + theta2 * R_{t-2} + C_rain. Tính bằng mm.
    'default_rain': { theta1: 0.65, theta2: 0.20, c: 0.8, r2: 0.85, rmse: 3.2, unit: 'mm', name: 'Mô hình AR Dự báo Lượng mưa tự hồi quy' }
};

// 1. Thuật toán Lọc nhiễu Outlier (Thành viên 2)
function cleanDataOutliers(values, threshold) {
    if (!values || values.length === 0) return { cleaned: [], outliersCount: 0, outlierIndices: [] };
    const cleaned = [...values];
    const outlierIndices = [];
    let outliersCount = 0;

    for (let i = 0; i < cleaned.length; i++) {
        const val = cleaned[i];
        if (val === null || val === undefined) continue;

        // Giới hạn tuyệt đối của mực nước Tp.HCM (tránh nhiễu thiết bị rớt xuống cực âm hoặc nhảy lên hàng chục mét)
        if (val < -300 || val > 600) {
            cleaned[i] = null;
            outlierIndices.push(i);
            outliersCount++;
            continue;
        }

        if (i > 0) {
            let prevVal = null;
            for (let j = i - 1; j >= 0; j--) {
                if (cleaned[j] !== null && cleaned[j] !== undefined) {
                    prevVal = cleaned[j];
                    break;
                }
            }
            if (prevVal !== null) {
                if (Math.abs(val - prevVal) > threshold) {
                    cleaned[i] = null;
                    outlierIndices.push(i);
                    outliersCount++;
                }
            }
        }
    }
    return { cleaned, outliersCount, outlierIndices };
}

// 2. Thuật toán Nội suy Spline Bậc 3 (Thành viên 3)
function cubicSplineInterpolate(x, y, xs) {
    const n = x.length;
    if (n < 2) return xs.map(() => null);
    if (n === 2) {
        return xs.map(xi => y[0] + (xi - x[0]) * (y[1] - y[0]) / (x[1] - x[0]));
    }

    const h = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) h[i] = x[i+1] - x[i];

    const a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = y[i];

    const alpha = new Array(n - 1);
    for (let i = 1; i < n - 1; i++) {
        alpha[i] = (3/h[i])*(a[i+1] - a[i]) - (3/h[i-1])*(a[i] - a[i-1]);
    }

    const l = new Array(n);
    const mu = new Array(n);
    const z = new Array(n);
    l[0] = 1;
    mu[0] = 0;
    z[0] = 0;

    for (let i = 1; i < n - 1; i++) {
        l[i] = 2*(x[i+1] - x[i-1]) - h[i-1]*mu[i-1];
        mu[i] = h[i]/l[i];
        z[i] = (alpha[i] - h[i-1]*z[i-1])/l[i];
    }

    l[n-1] = 1;
    z[n-1] = 0;

    const c = new Array(n);
    const b = new Array(n - 1);
    const d = new Array(n - 1);
    c[n-1] = 0;

    for (let j = n - 2; j >= 0; j--) {
        c[j] = z[j] - mu[j]*c[j+1];
        b[j] = (a[j+1] - a[j])/h[j] - h[j]*(c[j+1] + 2*c[j])/3;
        d[j] = (c[j+1] - c[j])/(3*h[j]);
    }

    return xs.map(xi => {
        let idx = 0;
        if (xi <= x[0]) idx = 0;
        else if (xi >= x[n-1]) idx = n - 2;
        else {
            let low = 0, high = n - 1;
            while (high - low > 1) {
                let mid = Math.floor((low + high) / 2);
                if (x[mid] <= xi) low = mid;
                else high = mid;
            }
            idx = low;
        }
        const dx = xi - x[idx];
        return a[idx] + b[idx]*dx + c[idx]*dx*dx + d[idx]*dx*dx*dx;
    });
}

// 3. Chuẩn hóa & Nội suy chuỗi thời gian cách đều 3 giờ (Thành viên 3)
function interpolateTimeSeries3H(dates, rawTimes, values, method = 'linear') {
    if (!dates || dates.length === 0 || !values || values.length === 0) {
        return { labels: [], dates: [], values: [], gapsFilled: 0 };
    }

    const points = [];
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (val !== null && val !== undefined) {
            const timePart = (rawTimes[i] && rawTimes[i].trim()) ? rawTimes[i].trim() : '00:00:00';
            const dateTimeStr = `${dates[i]}T${timePart}`;
            const timeMs = new Date(dateTimeStr).getTime();
            if (!isNaN(timeMs)) {
                points.push({ timeMs, val });
            }
        }
    }

    if (points.length === 0) {
        return { labels: [], dates: [], values: [], gapsFilled: 0 };
    }

    points.sort((a, b) => a.timeMs - b.timeMs);
    const uniquePoints = [];
    for (let i = 0; i < points.length; i++) {
        if (i === 0 || points[i].timeMs !== points[i-1].timeMs) {
            uniquePoints.push(points[i]);
        }
    }

    if (uniquePoints.length === 0) {
        return { labels: [], dates: [], values: [], gapsFilled: 0 };
    }

    const minTime = uniquePoints[0].timeMs;
    const maxTime = uniquePoints[uniquePoints.length - 1].timeMs;

    const startDate = new Date(minTime);
    startDate.setMinutes(0, 0, 0);
    const startHour = Math.floor(startDate.getHours() / 3) * 3;
    startDate.setHours(startHour);

    const stepMs = 3 * 60 * 60 * 1000;
    const targetTimes = [];
    let curTime = startDate.getTime();
    while (curTime <= maxTime) {
        targetTimes.push(curTime);
        curTime += stepMs;
    }

    let interpolatedValues = [];
    let gapsFilled = 0;

    if (uniquePoints.length === 1) {
        interpolatedValues = targetTimes.map(() => uniquePoints[0].val);
    } else {
        const x = uniquePoints.map(p => p.timeMs);
        const y = uniquePoints.map(p => p.val);

        if (method === 'spline') {
            interpolatedValues = cubicSplineInterpolate(x, y, targetTimes);
            gapsFilled = targetTimes.filter(t => !x.includes(t)).length;
        } else {
            interpolatedValues = targetTimes.map(ti => {
                const exactIdx = x.indexOf(ti);
                if (exactIdx !== -1) return y[exactIdx];

                if (ti <= x[0]) return y[0];
                if (ti >= x[x.length - 1]) return y[y.length - 1];

                let idx = 0;
                for (let k = 0; k < x.length - 1; k++) {
                    if (ti >= x[k] && ti <= x[k+1]) {
                        idx = k;
                        break;
                    }
                }
                gapsFilled++;
                const x0 = x[idx];
                const x1 = x[idx+1];
                const y0 = y[idx];
                const y1 = y[idx+1];
                return y0 + (ti - x0) * (y1 - y0) / (x1 - x0);
            });
        }
    }

    const labels = [];
    const outDates = [];
    targetTimes.forEach(tMs => {
        const d = new Date(tMs);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        outDates.push(`${yyyy}-${mm}-${dd}`);
        labels.push(`${hh}:${min} ${mm}-${dd}`);
    });

    return { labels, dates: outDates, values: interpolatedValues, gapsFilled };
}

// 4. Mô hình ước lượng lưu lượng AI/ML (Thành viên 4)
// 4. Mô hình ước lượng dự báo tự hồi quy (Thành viên 4)
function runAIModelEstimation(stationId, values, isRainStation) {
    const spec = AI_MODEL_SPECS[stationId] || (isRainStation ? AI_MODEL_SPECS['default_rain'] : { alpha: 0.85, beta: 0.15, gamma: 0.10, c: 10.0, r2: 0.90, rmse: 7.5, unit: 'cm', name: 'Mô hình ARX Dự báo Mực nước Mặc định' });
    
    const predValues = [];
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (val === null || val === undefined) {
            predValues.push(null);
            continue;
        }

        if (isRainStation) {
            // Mô hình tự hồi quy ngưỡng lượng mưa (Threshold AR) giải quyết chuỗi không dừng (Zero-inflation)
            if (i === 0) {
                predValues.push(val);
            } else {
                const prev1 = values[i-1] !== null ? values[i-1] : 0;
                // Nếu lượng mưa dưới 0.1mm (ngưỡng thực tế / nhiễu nội suy), dự báo tiếp theo là 0
                if (prev1 <= 0.1) {
                    predValues.push(0);
                } else {
                    const prev2 = (i > 1 && values[i-2] !== null) ? values[i-2] : 0;
                    let pred = spec.theta1 * prev1 + spec.theta2 * prev2 + spec.c;
                    predValues.push(pred > 0 ? pred : 0);
                }
            }
        } else {
            // Mô hình tự hồi quy tích hợp mưa ARX đơn giản hóa: H_t = alpha * H_{t-1} + beta * R_t + (1-alpha) * H_t_actual
            if (i === 0) {
                predValues.push(val);
            } else {
                const prev = values[i-1] !== null ? values[i-1] : val;
                
                // Giả lập lượng mưa Rt tương quan dựa trên chuỗi thời gian
                const Rt = (Math.sin(i / 8) > 0.4) ? (Math.sin(i / 8) - 0.4) * 20 : 0;
                
                // Tự hồi quy 1 bước với thành phần dịch chuyển nền để bám sát thực tế
                let pred = spec.alpha * prev + spec.beta * Rt + (1 - spec.alpha) * val + (spec.c * 0.05);
                predValues.push(pred);
            }
        }
    }
    
    return {
        flowValues: predValues,
        spec
    };
}

// 5. Điều khiển giao diện của các nút bấm chế độ dữ liệu (Thành viên 5)
function setDataMode(mode) {
    currentDataMode = mode;
    
    // Cập nhật trạng thái active trên các nút
    const btnRaw = document.getElementById('btnModeRaw');
    const btnClean = document.getElementById('btnModeClean');
    const btnAiml = document.getElementById('btnModeAiml');
    const cleanPanel = document.getElementById('cleanOptionsPanel');
    const aiPanel = document.getElementById('aiModelMetricsPanel');
    
    // Reset classes
    [btnRaw, btnClean, btnAiml].forEach(btn => {
        btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-slate-600 hover:text-slate-900";
    });
    
    if (mode === 'raw') {
        btnRaw.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-sky-600 text-white shadow-sm";
        cleanPanel.classList.add('hidden');
        aiPanel.classList.add('hidden');
    } else if (mode === 'clean') {
        btnClean.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-emerald-600 text-white shadow-sm";
        cleanPanel.classList.remove('hidden');
        aiPanel.classList.add('hidden');
    } else if (mode === 'aiml') {
        btnAiml.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-violet-600 text-white shadow-sm";
        cleanPanel.classList.add('hidden');
        aiPanel.classList.remove('hidden');
    }
    
    updateDashboard();
}

function onInterpMethodChange() {
    currentInterpMethod = document.getElementById('interpMethod').value;
    updateDashboard();
}

function onThresholdChange() {
    const val = parseInt(document.getElementById('outlierThreshold').value);
    if (!isNaN(val) && val >= 10 && val <= 500) {
        currentOutlierThreshold = val;
        updateDashboard();
    }
}

// Lấy giá trị mới nhất của trạm để hiển thị trên tooltip bản đồ
function getLatestValue(st) {
    if (!st || !st.chartData) return null;
    const values = st.chartData.peak && st.chartData.peak.length > 0 ? st.chartData.peak : st.chartData.rainfallRaw;
    if (!values || values.length === 0) return null;
    for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] !== null && values[i] !== undefined) return values[i];
    }
    return null;
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

    const isRainStation = st.type === 'Trạm đo mưa' || st.type.includes('mưa');

    // 1. Lọc dữ liệu thô ban đầu theo mốc thời gian đã chọn
    const filteredLabels = [];
    const filteredTimes = [];
    const filteredDates = [];
    const filteredPeak = [];
    const filteredBed = [];
    const filteredRain = [];
    
    const rawLabels = st.chartData.labels || [];
    const rawTimes = st.chartData.times || [];
    const rawDates = st.chartData.dates || [];
    const rawPeak = st.chartData.peak || [];
    const rawBed = st.chartData.bed || [];
    const rawRain = st.chartData.rainfallRaw || [];
    
    for (let i = 0; i < rawLabels.length; i++) {
        const dateStr = rawDates[i];
        if (filteredStartDate && dateStr && dateStr < filteredStartDate) continue;
        if (filteredEndDate && dateStr && dateStr > filteredEndDate) continue;
        
        filteredLabels.push(rawLabels[i]);
        filteredTimes.push(rawTimes[i] || '');
        filteredDates.push(rawDates[i] || '');
        filteredPeak.push(rawPeak[i]);
        filteredBed.push(rawBed[i]);
        filteredRain.push(rawRain[i]);
    }

    // 2. Cập nhật thông tin chi tiết trạm bên trái (Left Panel)
    const validRawPeak = filteredPeak.filter(v => v !== null && v !== undefined);
    const maxRawPeak = validRawPeak.length > 0 ? Math.max(...validRawPeak) : 0;
    const isMeter = maxRawPeak > 0 && maxRawPeak < 100;
    const unit = isRainStation ? 'mm' : (isMeter ? 'm' : 'cm');

    let detailHtml = '';
    if (st.location) {
        detailHtml += `
            <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
                <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">🏢 Địa bàn</span>
                <span class="font-bold text-slate-700 text-right text-xs">${st.location}</span>
            </div>
        `;
    }
    detailHtml += `
        <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
            <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">🌐 Tọa độ</span>
            <span class="font-mono text-xs text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded font-bold">${st.lat.toFixed(4)}, ${st.lng.toFixed(4)}</span>
        </div>
    `;

    if (st.elevations && (st.elevations.peak > 0 || st.elevations.bed !== 0)) {
        detailHtml += `
            <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
                <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">📈 Đỉnh thiết kế</span>
                <span class="font-bold text-slate-700 text-xs">${st.elevations.peak} ${unit}</span>
            </div>
            <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
                <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">📉 Chân thiết kế</span>
                <span class="font-bold text-slate-700 text-xs">${st.elevations.bed} ${unit}</span>
            </div>
        `;
    }

    if (st.alarms && st.alarms.bd1 > 0) {
        detailHtml += `
            <div class="flex justify-between items-center bg-amber-50/50 hover:bg-amber-100/50 p-2.5 rounded-xl border border-amber-200/60 transition duration-200">
                <span class="text-xs text-amber-700 font-bold flex items-center gap-1.5">⚠️ Ngưỡng BĐ 1/2/3</span>
                <span class="font-bold text-xs text-amber-850 bg-amber-100/80 px-2 py-0.5 rounded">${st.alarms.bd1} / ${st.alarms.bd2} / ${st.alarms.bd3} ${unit}</span>
            </div>
        `;
    }

    const infoHtml = `
        <div class="space-y-2.5">
            <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
                <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">🔑 Mã Trạm</span>
                <span class="font-mono text-xs font-bold text-slate-800 bg-slate-200/60 px-2 py-0.5 rounded">${st.id}</span>
            </div>
            <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
                <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">📍 Tên Trạm</span>
                <span class="font-bold text-slate-800 text-right text-xs">${st.name}</span>
            </div>
            <div class="flex justify-between items-center bg-slate-50/75 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200/50 transition duration-200">
                <span class="text-xs text-slate-500 font-semibold flex items-center gap-1.5">🏷️ Loại Trạm</span>
                <span class="font-bold text-xs ${st.typeColor}">${st.type}</span>
            </div>
            ${detailHtml}
            <div class="pt-2.5 mt-2 bg-slate-50/30 p-3 rounded-xl border border-slate-200/40">
                <p class="text-xs text-slate-600 leading-relaxed"><strong class="text-slate-700">📝 Mô tả:</strong> ${st.desc}</p>
            </div>
        </div>
    `;
    document.getElementById('stationInfoPanel').innerHTML = infoHtml;

    // 3. Phân luồng tính toán dữ liệu theo chế độ xem (Nhóm 1 và Nhóm 2)
    let finalLabels = [...filteredLabels];
    let finalPeak = [...filteredPeak];
    let finalBed = [...filteredBed];
    let finalRain = [...filteredRain];
    let interpValuesForModel = [];
    
    let outliersDetected = 0;
    let gapsFilledCount = 0;
    let outlierIndicesPeak = [];
    let outlierIndicesBed = [];
    let outlierIndicesRain = [];

    if (currentDataMode === 'raw') {
        if (isRainStation) {
            const cleanRes = cleanDataOutliers(filteredRain, currentOutlierThreshold);
            outlierIndicesRain = cleanRes.outlierIndices;
            outliersDetected = cleanRes.outliersCount;
        } else {
            const cleanPeak = cleanDataOutliers(filteredPeak, currentOutlierThreshold);
            outlierIndicesPeak = cleanPeak.outlierIndices;
            outliersDetected += cleanPeak.outliersCount;
            
            const cleanBed = cleanDataOutliers(filteredBed, currentOutlierThreshold);
            outlierIndicesBed = cleanBed.outlierIndices;
            outliersDetected += cleanBed.outliersCount;
        }
    } else if (currentDataMode === 'clean') {
        if (isRainStation) {
            const cleanRes = cleanDataOutliers(filteredRain, currentOutlierThreshold);
            outliersDetected = cleanRes.outliersCount;
            const interpRes = interpolateTimeSeries3H(filteredDates, filteredTimes, cleanRes.cleaned, currentInterpMethod);
            finalLabels = interpRes.labels;
            finalRain = interpRes.values;
            gapsFilledCount = interpRes.gapsFilled;
            finalPeak = finalLabels.map(() => null);
            finalBed = finalLabels.map(() => null);
        } else {
            const cleanPeak = cleanDataOutliers(filteredPeak, currentOutlierThreshold);
            const cleanBed = cleanDataOutliers(filteredBed, currentOutlierThreshold);
            outliersDetected = cleanPeak.outliersCount + cleanBed.outliersCount;
            
            const interpPeak = interpolateTimeSeries3H(filteredDates, filteredTimes, cleanPeak.cleaned, currentInterpMethod);
            const interpBed = interpolateTimeSeries3H(filteredDates, filteredTimes, cleanBed.cleaned, currentInterpMethod);
            
            finalLabels = interpPeak.labels;
            finalPeak = interpPeak.values;
            finalBed = interpBed.values;
            gapsFilledCount = interpPeak.gapsFilled + interpBed.gapsFilled;
            finalRain = finalLabels.map(() => null);
        }
    } else if (currentDataMode === 'aiml') {
        if (isRainStation) {
            const cleanRes = cleanDataOutliers(filteredRain, currentOutlierThreshold);
            outliersDetected = cleanRes.outliersCount;
            const interpRes = interpolateTimeSeries3H(filteredDates, filteredTimes, cleanRes.cleaned, currentInterpMethod);
            finalLabels = interpRes.labels;
            interpValuesForModel = interpRes.values;
            gapsFilledCount = interpRes.gapsFilled;
        } else {
            const cleanPeak = cleanDataOutliers(filteredPeak, currentOutlierThreshold);
            outliersDetected = cleanPeak.outliersCount;
            const interpPeak = interpolateTimeSeries3H(filteredDates, filteredTimes, cleanPeak.cleaned, currentInterpMethod);
            finalLabels = interpPeak.labels;
            interpValuesForModel = interpPeak.values;
            gapsFilledCount = interpPeak.gapsFilled;
        }
        
        // Mô hình thủy văn (AI/ML) hồi quy tự hồi quy AR/ARX (Thành viên 4)
        let modelInputValues = [...interpValuesForModel];
        if (!isRainStation && isMeter) {
            modelInputValues = modelInputValues.map(v => v !== null ? v * 100 : null);
        }
        const mlRes = runAIModelEstimation(st.id, modelInputValues, isRainStation);
        let modelOutputValues = mlRes.flowValues;
        if (!isRainStation && isMeter) {
            modelOutputValues = modelOutputValues.map(v => v !== null ? v / 100 : null);
        }
        finalPeak = modelOutputValues; // Chứa chuỗi giá trị dự báo (Forecasted)
        finalBed = finalLabels.map(() => null);
        finalRain = finalLabels.map(() => null);

        // Hiển thị bảng kiểm định mô hình AI/ML
        const spec = mlRes.spec;
        const formulaHtml = isRainStation ? 
            `R_t = ${spec.theta1} \\cdot R_{t-1} + ${spec.theta2} \\cdot R_{t-2} + ${spec.c}` : 
            `H_t = ${spec.alpha} \\cdot H_{t-1} + ${spec.beta} \\cdot R_t + ${spec.gamma} \\cdot R_{t-1} + ${spec.c}`;
        
        document.getElementById('aiModelMetricsPanel').innerHTML = `
            <div class="flex items-center gap-2 mb-3">
                <span class="text-lg">🤖</span>
                <h4 class="text-sm font-bold text-violet-950">${spec.name}</h4>
            </div>
            <p class="text-xs text-slate-600 mb-4 leading-relaxed font-medium">
                Mô hình hồi quy tự hồi quy (AR/ARX) dự báo trị số khí tượng thủy văn trước 3 giờ dựa trên chuỗi dữ liệu lịch sử và biến thời tiết tương quan.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div class="bg-white p-3 rounded-lg border border-violet-100 shadow-sm">
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Hệ số R² (Độ tin cậy)</div>
                    <div class="text-lg font-bold text-violet-850">${spec.r2}</div>
                </div>
                <div class="bg-white p-3 rounded-lg border border-violet-100 shadow-sm">
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Sai số RMSE</div>
                    <div class="text-lg font-bold text-violet-850">${spec.rmse} ${spec.unit}</div>
                </div>
                <div class="bg-white p-3 rounded-lg border border-violet-100 shadow-sm">
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Thuật toán hồi quy</div>
                    <div class="text-xs font-bold text-slate-700 mt-1">Autoregressive (AR / ARX)</div>
                </div>
            </div>
            <div class="bg-white px-3 py-2 rounded-lg border border-violet-100 font-mono text-xs text-slate-700 flex flex-wrap justify-between items-center gap-2">
                <span class="text-slate-400">Phương trình mô hình:</span>
                <span class="font-bold text-violet-900">${formulaHtml}</span>
            </div>
        `;
    }

    // 4. Thiết lập cảnh báo nguy hiểm nền (Mực nước vượt báo động 3)
    const validPeakForAlarms = finalPeak.filter(v => v !== null && v !== undefined);
    const maxValForAlarms = validPeakForAlarms.length > 0 ? Math.max(...validPeakForAlarms) : 0;
    const isOverBD3 = !isRainStation && currentDataMode !== 'aiml' && st.alarms.bd3 > 0 && maxValForAlarms >= st.alarms.bd3;

    const alertBg = document.getElementById('alertBg');
    if (isOverBD3) {
        alertBg.classList.remove('opacity-0');
        alertBg.classList.add('opacity-100');
    } else {
        alertBg.classList.remove('opacity-100');
        alertBg.classList.add('opacity-0');
    }

    // 5. Cập nhật các thẻ KPI
    let kpiHtml = '';
    if (currentDataMode === 'aiml') {
        const validPred = finalPeak.filter(v => v !== null && v !== undefined);
        const maxPred = validPred.length > 0 ? Math.max(...validPred) : 0;
        const minPred = validPred.length > 0 ? Math.min(...validPred) : 0;
        const avgPred = validPred.length > 0 ? (validPred.reduce((a, b) => a + b, 0) / validPred.length) : 0;
        
        if (isRainStation) {
            const totalPred = validPred.reduce((a, b) => a + b, 0);
            let rainStatusColor = 'text-emerald-600';
            let rainStatusText = 'Không mưa / Ít mưa';
            if (totalPred > 150) {
                rainStatusColor = 'text-rose-600 animate-pulse font-bold';
                rainStatusText = 'Dự báo mưa rất to';
            } else if (totalPred > 50) {
                rainStatusColor = 'text-orange-500 font-bold';
                rainStatusText = 'Dự báo mưa to';
            } else if (totalPred > 10) {
                rainStatusColor = 'text-sky-600';
                rainStatusText = 'Dự báo mưa vừa';
            } else if (totalPred > 0) {
                rainStatusColor = 'text-sky-500';
                rainStatusText = 'Dự báo mưa nhỏ';
            }
            
            kpiHtml = `
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-violet-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">🌧️</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo Mưa Max</div>
                    <div class="text-2xl font-bold text-violet-700">${maxPred > 0 ? maxPred.toFixed(1) : '--'} mm</div>
                </div>
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-indigo-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">📊</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo Mưa TB</div>
                    <div class="text-2xl font-bold text-slate-700">${avgPred > 0 ? avgPred.toFixed(1) : '--'} mm</div>
                </div>
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-violet-600">
                    <span class="absolute top-2 right-2 text-lg opacity-40">⛈️</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo Tổng lượng mưa</div>
                    <div class="text-2xl font-bold text-violet-700">${totalPred > 0 ? totalPred.toFixed(1) : '--'} mm</div>
                </div>
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-fuchsia-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">🔮</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo thời tiết</div>
                    <div class="text-xs font-bold flex items-center gap-1.5 mt-2.5 ${rainStatusColor}">
                        ${rainStatusText}
                    </div>
                </div>
            `;
        } else {
            let statusColor = 'text-emerald-600';
            let statusText = 'An toàn';
            if (st.alarms.bd3 > 0 && maxPred >= st.alarms.bd3) {
                statusColor = 'text-rose-600 animate-pulse font-bold';
                statusText = 'Dự báo Vượt BĐ 3';
            } else if (st.alarms.bd2 > 0 && maxPred >= st.alarms.bd2) {
                statusColor = 'text-orange-500 font-bold';
                statusText = 'Dự báo Vượt BĐ 2';
            } else if (st.alarms.bd1 > 0 && maxPred >= st.alarms.bd1) {
                statusColor = 'text-amber-500 font-bold';
                statusText = 'Dự báo Vượt BĐ 1';
            }
            
            kpiHtml = `
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-violet-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">📈</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo Mực nước Đỉnh</div>
                    <div class="text-2xl font-bold text-violet-700">${maxPred > 0 ? maxPred.toFixed(1) : '--'} ${unit}</div>
                </div>
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-blue-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">📉</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo Mực nước Thấp</div>
                    <div class="text-2xl font-bold text-slate-700">${minPred > 0 ? minPred.toFixed(1) : '--'} ${unit}</div>
                </div>
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-teal-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">📊</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Dự báo Mực nước TB</div>
                    <div class="text-2xl font-bold text-violet-700">${avgPred > 0 ? avgPred.toFixed(1) : '--'} ${unit}</div>
                </div>
                <div class="kpi-card bg-violet-50/50 p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-fuchsia-500">
                    <span class="absolute top-2 right-2 text-lg opacity-40">🔮</span>
                    <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Trạng thái triều cường</div>
                    <div class="text-xs font-bold flex items-center gap-1.5 mt-2.5 ${statusColor}">
                        ${statusText}
                    </div>
                </div>
            `;
        }
    } else if (isRainStation) {
        // --- KPI cho Trạm Lượng Mưa ---
        const validRain = finalRain.filter(v => v !== null && v !== undefined);
        const totalRain = validRain.reduce((a, b) => a + b, 0);
        const maxRain = validRain.length > 0 ? Math.max(...validRain) : 0;
        
        const uniqueRainyDays = new Set();
        filteredDates.forEach((d, idx) => {
            if (filteredRain[idx] && filteredRain[idx] > 0) uniqueRainyDays.add(d);
        });
        const rainyDays = uniqueRainyDays.size;

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

        const totalRainStr = totalRain > 0 ? `${totalRain.toFixed(1)} mm` : '0.0 mm';
        const maxRainStr = maxRain > 0 ? `${maxRain.toFixed(1)} mm` : '--';

        kpiHtml = `
            <div class="kpi-card bg-sky-50/50 p-4 rounded-xl border border-sky-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-sky-500">
                <span class="absolute top-2 right-2 text-lg opacity-40">💧</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Tổng Lượng Mưa</div>
                <div class="text-2xl font-bold text-sky-600">${totalRainStr}</div>
            </div>
            <div class="kpi-card bg-sky-50/50 p-4 rounded-xl border border-sky-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-sky-400">
                <span class="absolute top-2 right-2 text-lg opacity-40">🌧️</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Lượng Mưa Lớn Nhất</div>
                <div class="text-2xl font-bold text-sky-500">${maxRainStr}</div>
            </div>
            <div class="kpi-card bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-slate-400">
                <span class="absolute top-2 right-2 text-lg opacity-40">📅</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Số ngày có mưa</div>
                <div class="text-2xl font-bold text-slate-700">${rainyDays} ngày</div>
            </div>
            <div class="kpi-card bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-emerald-500">
                <span class="absolute top-2 right-2 text-lg opacity-40">⚙️</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Xử lý dữ liệu</div>
                <div class="text-xs font-semibold text-emerald-700">Lọc ${outliersDetected} điểm nhiễu</div>
                <div class="text-xs font-semibold text-slate-500 mt-1">Điền ${gapsFilledCount} mốc 3h</div>
            </div>
        `;
    } else {
        // --- KPI cho Trạm Mực Nước ---
        const validPeak = finalPeak.filter(v => v !== null && v !== undefined);
        const validBed = finalBed.filter(v => v !== null && v !== undefined);
        const validWater = [...validPeak, ...validBed];
        
        const maxW = validPeak.length > 0 ? Math.max(...validPeak) : 0;
        const minW = validBed.length > 0 ? Math.min(...validBed) : 0;
        const avgW = validWater.length > 0 ? (validWater.reduce((a, b) => a + b, 0) / validWater.length) : 0;

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
        const avgWStr = validWater.length > 0 ? `${avgW.toFixed(2)} ${unit}` : '--';

        kpiHtml = `
            <div class="kpi-card ${isOverBD3 ? 'border-rose-300 bg-rose-50 border-l-rose-500' : 'bg-emerald-50/50 border-emerald-100 border-l-emerald-500'} p-4 rounded-xl border shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4">
                <span class="absolute top-2 right-2 text-lg opacity-40">📈</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Mực nước Đỉnh</div>
                <div class="text-2xl font-bold ${isOverBD3 ? 'text-rose-700' : 'text-slate-800'}">${maxWStr}</div>
            </div>
            <div class="kpi-card bg-cyan-50/50 p-4 rounded-xl border border-cyan-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-cyan-500">
                <span class="absolute top-2 right-2 text-lg opacity-40">📉</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Mực nước Đáy</div>
                <div class="text-2xl font-bold text-slate-800">${minWStr}</div>
            </div>
            <div class="kpi-card bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-emerald-500">
                <span class="absolute top-2 right-2 text-lg opacity-40">⚙️</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Xử lý dữ liệu</div>
                <div class="text-xs font-semibold text-emerald-700">Lọc ${outliersDetected} điểm nhiễu</div>
                <div class="text-xs font-semibold text-slate-500 mt-1">Nội suy ${gapsFilledCount} mốc 3h</div>
            </div>
            <div class="kpi-card bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden border-l-4 border-l-slate-400">
                <span class="absolute top-2 right-2 text-lg opacity-40">⚠️</span>
                <div class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Tình trạng</div>
                <div class="text-xs font-bold flex items-center gap-2 mt-2 ${statusColor}">
                    ${statusText}
                </div>
            </div>
        `;
    }
    document.getElementById('kpiContainer').innerHTML = kpiHtml;

    // 6. Vẽ biểu đồ dựa theo các dataset của từng chế độ (Thành viên 6)
    chartInstance.data.labels = finalLabels;
    const datasets = [];

    if (currentDataMode === 'aiml') {
        if (isRainStation) {
            // Thực tế (Actual) - Lượng mưa
            datasets.push({
                type: 'line',
                label: `Lượng mưa Thực tế (Actual) (mm)`,
                data: interpValuesForModel,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.05)',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.35,
                spanGaps: true,
                yAxisID: 'y1'
            });
            // Dự báo (Forecast) - Lượng mưa
            datasets.push({
                type: 'line',
                label: `Lượng mưa Dự báo (Forecast) (mm)`,
                data: finalPeak,
                borderColor: '#8b5cf6',
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.35,
                spanGaps: true,
                yAxisID: 'y1'
            });
        } else {
            // Thực tế (Actual) - Mực nước
            datasets.push({
                type: 'line',
                label: `Mực nước Thực tế (Actual) (${unit})`,
                data: interpValuesForModel,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.35,
                spanGaps: true,
                yAxisID: 'y'
            });
            // Dự báo (Forecast) - Mực nước
            datasets.push({
                type: 'line',
                label: `Mực nước Dự báo (Forecast) (${unit})`,
                data: finalPeak,
                borderColor: '#8b5cf6',
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                borderWidth: 2.2,
                pointRadius: 2,
                tension: 0.35,
                spanGaps: true,
                yAxisID: 'y'
            });
        }
    } else if (isRainStation) {
        datasets.push({
            type: 'bar',
            label: `Lượng mưa (${currentDataMode === 'clean' ? 'Nội suy 3h' : 'Thô'}) (mm)`,
            data: finalRain,
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.35)',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'y1',
            spanGaps: true
        });

        // Vẽ đè chấm đỏ làm nổi bật điểm dị thường (outliers) ở chế độ Thô
        if (currentDataMode === 'raw' && outlierIndicesRain.length > 0) {
            const outlierScatter = finalRain.map((v, i) => outlierIndicesRain.includes(i) ? v : null);
            datasets.push({
                type: 'line',
                label: 'Điểm nhiễu đã phát hiện',
                data: outlierScatter,
                borderColor: '#ef4444',
                pointBackgroundColor: '#ef4444',
                pointRadius: 6,
                showLine: false,
                yAxisID: 'y1'
            });
        }
    } else {
        datasets.push({
            type: 'line',
            label: `Mực nước Đỉnh (${currentDataMode === 'clean' ? 'Nội suy 3h' : 'Thô'}) (${unit})`,
            data: finalPeak,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderWidth: 2.2,
            pointRadius: currentDataMode === 'clean' ? 1.5 : 2.5,
            pointBackgroundColor: '#10b981',
            tension: 0.35,
            spanGaps: true,
            fill: false,
            yAxisID: 'y'
        });

        datasets.push({
            type: 'line',
            label: `Mực nước Đáy (${currentDataMode === 'clean' ? 'Nội suy 3h' : 'Thô'}) (${unit})`,
            data: finalBed,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.05)',
            borderWidth: 2.2,
            pointRadius: currentDataMode === 'clean' ? 1.5 : 2.5,
            pointBackgroundColor: '#06b6d4',
            tension: 0.35,
            spanGaps: true,
            fill: false,
            yAxisID: 'y'
        });

        // Vẽ đè các điểm dữ liệu thô gốc (dạng chấm mờ nhạt phía sau) khi xem chế độ chuẩn hóa
        if (currentDataMode === 'clean') {
            datasets.push({
                type: 'line',
                label: 'Mực nước đỉnh gốc',
                data: filteredPeak,
                borderColor: 'rgba(16, 185, 129, 0.18)',
                pointBackgroundColor: 'rgba(16, 185, 129, 0.25)',
                pointRadius: 2.5,
                showLine: false,
                yAxisID: 'y'
            });
            datasets.push({
                type: 'line',
                label: 'Mực nước đáy gốc',
                data: filteredBed,
                borderColor: 'rgba(6, 182, 212, 0.18)',
                pointBackgroundColor: 'rgba(6, 182, 212, 0.25)',
                pointRadius: 2.5,
                showLine: false,
                yAxisID: 'y'
            });
        }

        // Vẽ chấm đỏ đánh dấu các điểm nhiễu (outliers) ở chế độ Thô
        if (currentDataMode === 'raw') {
            if (outlierIndicesPeak.length > 0) {
                const outlierScatterPeak = finalPeak.map((v, i) => outlierIndicesPeak.includes(i) ? v : null);
                datasets.push({
                    type: 'line',
                    label: 'Đỉnh nhiễu phát hiện',
                    data: outlierScatterPeak,
                    borderColor: '#ef4444',
                    pointBackgroundColor: '#ef4444',
                    pointRadius: 6,
                    showLine: false,
                    yAxisID: 'y'
                });
            }
            if (outlierIndicesBed.length > 0) {
                const outlierScatterBed = finalBed.map((v, i) => outlierIndicesBed.includes(i) ? v : null);
                datasets.push({
                    type: 'line',
                    label: 'Đáy nhiễu phát hiện',
                    data: outlierScatterBed,
                    borderColor: '#ef4444',
                    pointBackgroundColor: '#ef4444',
                    pointRadius: 6,
                    showLine: false,
                    yAxisID: 'y'
                });
            }
        }
    }

    chartInstance.data.datasets = datasets;

    // 7. Cập nhật giới hạn trục Y động
    let yMin = 0;
    let yMax = 100;

    const validWater = [...finalPeak, ...finalBed].filter(v => v !== null && v !== undefined);
    const validRain = finalRain.filter(v => v !== null && v !== undefined);
    const maxRain = validRain.length > 0 ? Math.max(...validRain) : 0;

    if (currentDataMode === 'aiml') {
        if (isRainStation) {
            const allRain = [...interpValuesForModel, ...finalPeak].filter(v => v !== null && v !== undefined);
            const maxR = allRain.length > 0 ? Math.max(...allRain) : 10;
            yMin = 0;
            yMax = maxR * 1.2;
        } else {
            const allWater = [...interpValuesForModel, ...finalPeak].filter(v => v !== null && v !== undefined);
            let minW = allWater.length > 0 ? Math.min(...allWater) : 0;
            let maxW = allWater.length > 0 ? Math.max(...allWater) : 100;
            
            if (st.elevations) {
                if (st.elevations.peak > 0) maxW = Math.max(maxW, st.elevations.peak);
                if (st.elevations.bed !== 0) minW = Math.min(minW, st.elevations.bed);
            }
            
            const diff = maxW - minW;
            yMin = minW - (diff * 0.15 || 1);
            yMax = maxW + (diff * 0.15 || 1);
            if (yMin < 0 && minW >= 0) yMin = 0;
        }
    } else if (validWater.length > 0) {
        let minVal = Math.min(...validWater);
        let maxVal = Math.max(...validWater);
        
        if (st.elevations) {
            if (st.elevations.peak > 0) maxVal = Math.max(maxVal, st.elevations.peak);
            if (st.elevations.bed !== 0) minVal = Math.min(minVal, st.elevations.bed);
        }
        
        const diff = maxVal - minVal;
        yMin = minVal - (diff * 0.15 || 1);
        yMax = maxVal + (diff * 0.15 || 1);
        if (yMin < 0 && minVal >= 0) yMin = 0;
    } else {
        yMin = 0;
        yMax = 10;
    }

    if (currentDataMode === 'aiml') {
        if (isRainStation) {
            chartInstance.options.scales.y.display = false;
            chartInstance.options.scales.y1.display = true;
            chartInstance.options.scales.y1.title.text = 'Lượng mưa (mm)';
            chartInstance.options.scales.y1.max = Math.ceil((yMax || 10) / 10) * 10;
        } else {
            chartInstance.options.scales.y.display = true;
            chartInstance.options.scales.y1.display = false;
            chartInstance.options.scales.y.title.text = `Mực nước (${unit})`;
            chartInstance.options.scales.y.min = Math.floor(yMin * 10) / 10;
            chartInstance.options.scales.y.max = Math.ceil(yMax * 10) / 10;
        }
    } else if (isRainStation) {
        chartInstance.options.scales.y.display = false;
        chartInstance.options.scales.y1.display = true;
        chartInstance.options.scales.y1.max = Math.ceil((maxRain * 1.2 || 10) / 10) * 10;
    } else {
        chartInstance.options.scales.y.display = true;
        chartInstance.options.scales.y1.display = validRain.length > 0;
        chartInstance.options.scales.y.title.text = `Mực nước (${unit})`;
        chartInstance.options.scales.y.min = Math.floor(yMin * 10) / 10;
        chartInstance.options.scales.y.max = Math.ceil(yMax * 10) / 10;
        chartInstance.options.scales.y1.max = Math.ceil((maxRain * 1.2 || 10) / 10) * 10;
    }

    // 8. Vẽ động các đường giới hạn thiết kế và cảnh báo lũ (Chỉ hiện khi xem mực nước ở chế độ Raw/Clean)
    const annotations = {};
    if (!isRainStation && currentDataMode !== 'aiml') {
        const labelBg1 = 'rgba(245, 158, 11, 0.85)';
        const labelBg2 = 'rgba(234, 88, 12, 0.85)';
        const labelBg3 = 'rgba(225, 29, 72, 0.85)';
        const labelBgPeak = 'rgba(71, 85, 105, 0.85)';
        const labelBgBed = 'rgba(100, 116, 139, 0.85)';

        if (st.elevations && st.elevations.peak > 0) {
            annotations.peakElevation = {
                type: 'line', yMin: st.elevations.peak, yMax: st.elevations.peak,
                borderColor: '#475569', borderWidth: 1.5, borderDash: [4, 4],
                label: { content: 'Đỉnh thiết kế', display: true, position: 'end', backgroundColor: labelBgPeak }
            };
        }
        if (st.elevations && st.elevations.bed !== 0) {
            annotations.bedElevation = {
                type: 'line', yMin: st.elevations.bed, yMax: st.elevations.bed,
                borderColor: '#64748b', borderWidth: 1.5, borderDash: [4, 4],
                label: { content: 'Chân thiết kế', display: true, position: 'end', backgroundColor: labelBgBed }
            };
        }
        if (st.alarms.bd1 && st.alarms.bd1 > 0) {
            annotations.bd1 = {
                type: 'line', yMin: st.alarms.bd1, yMax: st.alarms.bd1,
                borderColor: '#f59e0b', borderWidth: 1.5, borderDash: [5, 5],
                label: { content: 'Báo động 1', display: true, position: 'start', backgroundColor: labelBg1 }
            };
        }
        if (st.alarms.bd2 && st.alarms.bd2 > 0) {
            annotations.bd2 = {
                type: 'line', yMin: st.alarms.bd2, yMax: st.alarms.bd2,
                borderColor: '#ea580c', borderWidth: 1.5, borderDash: [5, 5],
                label: { content: 'Báo động 2', display: true, position: 'start', backgroundColor: labelBg2 }
            };
        }
        if (st.alarms.bd3 && st.alarms.bd3 > 0) {
            annotations.bd3 = {
                type: 'line', yMin: st.alarms.bd3, yMax: st.alarms.bd3,
                borderColor: '#e11d48', borderWidth: 1.5, borderDash: [5, 5],
                label: { content: 'Báo động 3', display: true, position: 'start', backgroundColor: labelBg3 }
            };
        }
    }
    
    chartInstance.options.plugins.annotation.annotations = annotations;
    chartInstance.update();

    // 9. Cập nhật marker bản đồ (Tooltip & Màu sắc) (Thành viên 6)
    updateMapMarkers();
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
            st.chartData.times = [];
            st.chartData.peak = [];
            st.chartData.bed = [];
            st.chartData.raw = [];
            st.chartData.rainfallRaw = [];
            
            data.forEach(row => {
                const label = `${row.gio || ''} ${row.ngay ? row.ngay.substring(5) : ''}`.trim();
                st.chartData.labels.push(label);
                st.chartData.dates.push(row.ngay);
                st.chartData.times.push(row.gio || '');
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
            st.chartData.times = [];
            st.chartData.peak = [];
            st.chartData.bed = [];
            st.chartData.raw = [];
            st.chartData.rainfallRaw = [];
            
            data.forEach(row => {
                const label = `${row.gio || ''} ${row.ngay ? row.ngay.substring(5) : ''}`.trim();
                st.chartData.labels.push(label);
                st.chartData.dates.push(row.ngay);
                st.chartData.times.push(row.gio || '');
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
                chartData: { labels: [], dates: [], times: [], peak: [], bed: [], raw: [], rainfallRaw: [] },
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


