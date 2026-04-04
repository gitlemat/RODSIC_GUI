// src/js/views/analysis.js
import { fetchSpreadAnalysis } from '../services/api.js';

let charts = [];

export function renderAnalysisView() {
    const container = document.getElementById('analysis-charts-container');
    // If we're just re-showing the tab, don't clear unless empty-state is there
    if (container && container.querySelector('.empty-state')) {
        // Stay as is until "Analyze" is clicked
    }
}

window.loadSpreadAnalysis = async function() {
    const product = document.getElementById('analysis-product').value;
    const distance = parseInt(document.getElementById('analysis-distance').value);
    const container = document.getElementById('analysis-charts-container');
    const btn = document.querySelector('#analysis button');

    if (!container) return;

    // Loading State
    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Analyzing...';
    btn.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    container.innerHTML = `
        <div style="text-align: center; padding: 4rem; width: 100%;">
            <div class="loader-modern"></div>
            <p style="margin-top: 1rem; color: var(--text-muted);">Fetching and synthesizing historical data...</p>
        </div>
    `;

    try {
        const data = await fetchSpreadAnalysis(product, distance);

        if (!data || data.error || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; color: var(--text-muted); padding: 4rem; width: 100%;">
                    <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin-bottom: 1rem; color: var(--accent-red);"></i>
                    <p>${data?.error || 'No historical data found for this combination.'}</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        container.innerHTML = ''; // Clear loading
        
        // Destroy old charts
        charts.forEach(c => { try { c.destroy(); } catch(e) {} });
        charts = [];

        data.forEach((item, index) => {
            const chartId = `analysis-chart-${index}`;
            const card = document.createElement('div');
            card.className = 'portfolio-table-container glass shadow';
            card.style.padding = '1.5rem';
            
            card.innerHTML = `
                <div class="header-row" style="margin-bottom: 1rem; align-items: center;">
                    <div style="display: flex; flex-direction: column;">
                        <h3 style="margin: 0; color: var(--accent-blue);">${item.combination}</h3>
                    </div>
                    <div class="chart-actions" style="display: flex; gap: 0.5rem;">
                         <button class="btn-icon" onclick="window.toggleAnalysisLegend(${index})" title="Toggle Legend">
                             <i data-lucide="list"></i>
                         </button>
                    </div>
                </div>
                <div id="${chartId}" style="min-height: 450px;"></div>
            `;
            container.appendChild(card);

            // Prepare series
            const series = Object.entries(item.series).map(([year, points]) => ({
                name: year,
                data: points
            })).sort((a, b) => b.name.localeCompare(a.name)); // Newest first in legend

            const options = {
                series: series,
                chart: {
                    id: chartId,
                    type: 'line',
                    height: 450,
                    animations: { 
                        enabled: false 
                    },
                    toolbar: { 
                        show: true,
                        autoSelected: 'zoom',
                        tools: {
                            download: false,
                            selection: false,
                            zoom: true,
                            zoomin: false,
                            zoomout: false,
                            pan: false,
                            reset: true
                        }
                    },
                    zoom: {
                        enabled: true,
                        type: 'x',
                        autoScaleYaxis: true,
                        allowMouseWheelZoom: false
                    },
                    background: 'transparent',
                    foreColor: 'var(--text-muted)',
                    events: {
                        // Custom legend click handler to force sync between legend and series
                        legendClick: function(chartContext, seriesIndex, config) {
                            const seriesName = config.globals.seriesNames[seriesIndex];
                            chartContext.toggleSeries(seriesName);
                            // Return false to stop the default ApexCharts toggle which is sometimes buggy
                            return false;
                        }
                    }
                },
                colors: [
                    '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', 
                    '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#5470f6'
                ],
                stroke: {
                    curve: 'smooth',
                    width: 2
                },
                xaxis: {
                    type: 'datetime',
                    labels: {
                        show: true,
                        format: 'dd MMM',
                        style: { colors: '#8A8D91' }
                    },
                    axisBorder: { show: false },
                    axisTicks: { show: false },
                    tooltip: { enabled: false },
                    crosshairs: { show: true }
                },
                yaxis: {
                    labels: {
                        style: { colors: '#8A8D91' },
                        formatter: (val) => val.toFixed(2)
                    },
                    title: { text: 'Spread Value', style: { color: '#8A8D91' } }
                },
                grid: {
                    borderColor: 'rgba(255,255,255,0.05)',
                    xaxis: { lines: { show: true } }
                },
                tooltip: {
                    theme: 'dark',
                    shared: true,
                    intersect: false,
                    followCursor: false,
                    x: { show: true, format: 'dd MMM' },
                    y: { formatter: (val) => (val !== null && val !== undefined) ? val.toFixed(4) : '-' }
                },
                markers: {
                    size: 0,
                    hover: {
                        size: 5
                    }
                },
                legend: {
                    show: false, // Hidden by default, toggled by user
                    position: 'right',
                    offsetY: 0,
                    height: 400,
                    labels: { colors: 'var(--text-main)' },
                    markers: { radius: 12 },
                    itemMargin: { vertical: 5 },
                    onItemClick: {
                        toggleDataSeries: false // We use our custom event handler instead
                    }
                }
            };

            const chart = new ApexCharts(document.querySelector(`#${chartId}`), options);
            chart.render();
            charts.push({ chart, legendVisible: false });
        });

        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error("Analysis Load Failed:", err);
        container.innerHTML = `<div style="color:var(--accent-red); text-align:center; padding: 2rem;">Error: ${err.message}</div>`;
    } finally {
        btn.innerHTML = originalBtnHtml;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }
};

window.toggleAnalysisLegend = function(index) {
    const item = charts[index];
    if (!item || !item.chart) return;
    
    const chart = item.chart;
    item.legendVisible = !item.legendVisible;
    
    const hiddenNames = chart.w.globals.collapsedSeriesIndices.map(i => chart.w.globals.seriesNames[i]);
    
    chart.updateOptions({
        legend: { show: item.legendVisible }
    }, false, false);
    
    // Minimal delay to ensure re-alignment
    setTimeout(() => {
        const nowHidden = chart.w.globals.collapsedSeriesIndices.map(i => chart.w.globals.seriesNames[i]);
        hiddenNames.forEach(name => {
            if (!nowHidden.includes(name)) {
                chart.toggleSeries(name);
            }
        });
    }, 20);
};
