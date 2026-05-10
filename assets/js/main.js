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

function setMode(mode) {
    currentMode = mode;
    const buttons = document.querySelectorAll('.btn-toggle');
    buttons.forEach(btn => {
        btn.classList.remove('active', 'bg-white', 'shadow-sm', 'border-slate-200', 'text-slate-700');
        btn.classList.add('text-slate-600');
        btn.style.backgroundColor = 'transparent';
        btn.style.borderColor = 'transparent';
        btn.style.color = '';
    });

    const activeBtn = event.currentTarget || buttons[mode === 'raw' ? 0 : 1];
    activeBtn.classList.add('active');
    activeBtn.classList.remove('text-slate-600');
    
    updateDashboard();
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
                legend: { display: false },
                annotation: {
                    annotations: {} // Will be injected dynamically
                }
            },
            scales: {
                y: { title: { display: true, text: 'Mực nước' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateDashboard() {
    const st = stations[currentStation];
    const dataMode = st.chartData[currentMode];
    const metrics = st.metrics[currentMode];

    // 1. Update Context Text
    let contextHtml = '';
    if(currentStation === '74129') {
        if(currentMode === 'raw') {
            contextHtml = 'Dữ liệu thô quan trắc thủ công tại Yên Bái có ngắt quãng và điểm dị thường. Mực nước đã vượt <strong>Báo động 3</strong>. Chuyển sang "Đã chuẩn hóa" để nội suy dữ liệu.';
        } else {
            contextHtml = 'Dữ liệu đã được làm trơn bằng Spline bậc 3. Mực nước đạt đỉnh ở mức <strong>3250cm (Vượt BĐ3)</strong>, nguy cơ ngập lụt cao quanh lưu vực Sông Thao.';
        }
    } else {
        if(currentMode === 'raw') {
            contextHtml = 'Dữ liệu trạm ảo từ vệ tinh (sparse data). Vệ tinh quan sát thấy mực nước cao bất thường, vượt mức BĐ3.';
        } else {
            contextHtml = 'Dữ liệu nội suy từ vệ tinh đo cao, phục hồi mô hình dòng chảy cho thấy nước đã dâng cao vượt <strong>Báo động 3 (28m)</strong>.';
        }
    }
    document.getElementById('contextBox').innerHTML = contextHtml;

    // 2. Update Station Info
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
        <div class="pt-2">
            <p class="text-xs text-slate-600 leading-relaxed">${st.desc}</p>
        </div>
    `;
    document.getElementById('stationInfoPanel').innerHTML = infoHtml;

    // Check if current data exceeds BD3 for alerting styles
    const maxValRaw = parseFloat(metrics.max);
    const isAlarm = maxValRaw >= st.alarms.bd3;

    // Alert background
    const alertBg = document.getElementById('alertBg');
    if(isAlarm) {
        alertBg.classList.remove('opacity-0');
        alertBg.classList.add('opacity-100');
    } else {
        alertBg.classList.remove('opacity-100');
        alertBg.classList.add('opacity-0');
    }

    // 3. Update KPIs
    let statusColor = currentMode === 'raw' ? 'text-amber-600' : 'text-emerald-600';
    if(isAlarm) statusColor = 'text-rose-600 animate-pulse';

    const kpiHtml = `
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 ${isAlarm ? 'border-rose-300 bg-rose-50' : ''}">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Đỉnh</div>
            <div class="text-2xl font-bold ${isAlarm ? 'text-rose-700' : 'text-slate-800'}">${metrics.max}</div>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Mực nước Đáy</div>
            <div class="text-2xl font-bold ${currentMode === 'raw' && currentStation === '74129' ? 'text-rose-600' : 'text-slate-800'}">${metrics.min}</div>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="text-xs text-slate-500 uppercase tracking-wider mb-1">Tình trạng</div>
            <div class="text-lg font-bold flex items-center gap-2 ${statusColor}">
                ${isAlarm ? '⚠️' : ''} ${metrics.status}
            </div>
        </div>
    `;
    document.getElementById('kpiContainer').innerHTML = kpiHtml;

    // 4. Update Chart
    const lineColor = currentMode === 'raw' ? '#e11d48' : '#0284c7';
    const bgColor = currentMode === 'raw' ? 'rgba(225, 29, 72, 0.1)' : 'rgba(2, 132, 199, 0.1)';

    chartInstance.data.labels = st.chartData.labels;
    chartInstance.data.datasets = [{
        label: 'Mực nước',
        data: dataMode,
        borderColor: lineColor,
        backgroundColor: bgColor,
        borderWidth: 2,
        pointRadius: currentMode === 'raw' ? 5 : 3,
        pointBackgroundColor: lineColor,
        tension: currentMode === 'clean' ? 0.4 : 0,
        spanGaps: currentMode === 'clean', 
        fill: true
    }];
    
    // Set Y-axis scale based on data
    const yMin = currentStation === '74129' ? 1500 : 20;
    const yMax = currentStation === '74129' ? 3400 : 30;

    chartInstance.options.scales.y.title.text = currentStation === '74129' ? 'Mực nước (cm)' : 'Mực nước (m)';
    chartInstance.options.scales.y.min = yMin;
    chartInstance.options.scales.y.max = yMax;

    // Set Annotations for Alarm levels
    chartInstance.options.plugins.annotation.annotations = {
        bd1: {
            type: 'line',
            yMin: st.alarms.bd1,
            yMax: st.alarms.bd1,
            borderColor: '#f59e0b', // Amber
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                content: 'Báo động 1',
                display: true,
                position: 'start',
                backgroundColor: 'rgba(245, 158, 11, 0.8)'
            }
        },
        bd2: {
            type: 'line',
            yMin: st.alarms.bd2,
            yMax: st.alarms.bd2,
            borderColor: '#ea580c', // Orange
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                content: 'Báo động 2',
                display: true,
                position: 'start',
                backgroundColor: 'rgba(234, 88, 12, 0.8)'
            }
        },
        bd3: {
            type: 'line',
            yMin: st.alarms.bd3,
            yMax: st.alarms.bd3,
            borderColor: '#e11d48', // Rose
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                content: 'Báo động 3',
                display: true,
                position: 'start',
                backgroundColor: 'rgba(225, 29, 72, 0.8)'
            }
        }
    };

    chartInstance.update();
}

// Khởi tạo Dashboard khi DOM load xong
window.onload = () => {
    initMap();
    initChart();
    setTimeout(() => {
        updateDashboard();
    }, 100);
};
