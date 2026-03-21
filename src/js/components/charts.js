// src/js/components/charts.js
import { state } from '../core/state.js';
import { fetchHistory } from '../services/api.js';

export function getAnnotationColor(gid, currentPrice) {
    const pState = state.portfolioState[gid];
    if (!pState) return 'rgb(0, 117, 96)'; // Default winning

    const qty = pState.totalQty;
    const avg = pState.avgPrice;

    if (qty === 0) return 'rgb(0, 117, 96)';

    if (qty > 0) {
        if (currentPrice >= avg) return 'rgb(0, 117, 96)';
    } else {
        if (currentPrice <= avg) return 'rgb(0, 117, 96)';
    }

    return 'rgb(189, 20, 20)'; // Losing
}

export async function updateChart(gid) {
    const chartDiv = document.getElementById(`chart-${gid}`);
    if (!chartDiv) return;

    const range = (state.chartStates[gid] && state.chartStates[gid].range) ? state.chartStates[gid].range : '1d';
    let history;

    try {
        if (state.historyCache[gid] && state.chartStates[gid] && state.chartStates[gid].range === range) {
            history = state.historyCache[gid];
        } else {
            const contract = state.contractsMap[gid];
            const symbolIdentifier = (contract && (contract.localSymbol || contract.symbol)) || gid;

            // Manual fetch since fetchHistory takes separate args or we adapt
            // The API payload for history requires {gConId, start, legs}
            const payload = {
                gConId: symbolIdentifier,
                start: range,
                legs: (contract && contract.secType === 'BAG' && contract.legs) ? contract.legs : null
            };

            const res = await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            history = await res.json();

            if (history && history.length > 0) {
                state.historyCache[gid] = history;
                if (!state.chartStates[gid]) state.chartStates[gid] = {};
                state.chartStates[gid].range = range;
            }
        }

        if (!history || history.length === 0) {
            chartDiv.innerHTML = '<div class="chart-error">No data available</div>';
            return;
        }

        drawChart(chartDiv, history, range, gid);

    } catch (err) {
        console.error("Chart load failed:", err);
    }
}

export function drawChart(chartDiv, history, range, gid, customAnnotations = []) {
    const isOHLC = history.length > 0 && history[0].length === 5;
    let seriesData = [];
    let chartType = 'area';
    let xaxisType = 'datetime';
    let tickAmount = undefined;

    const formatDate = (ts) => {
        const date = new Date(ts);
        return date.toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
        }).replace(',', '');
    };

    if (isOHLC) {
        chartType = 'candlestick';
        xaxisType = 'datetime'; // Change to datetime for consistency and easier real-time updates
        seriesData = [{
            name: 'Price',
            data: history.map(h => ({
                x: h[0], // Keep as timestamp
                y: [h[1], h[2], h[3], h[4]]
            }))
        }];
        tickAmount = undefined; // Let ApexCharts decide for datetime
    } else {
        seriesData = [{
            name: 'Price',
            data: history.map(h => ({
                x: new Date(h[0]),
                y: h[1]
            }))
        }];
    }

    let minPrice, maxPrice;
    if (isOHLC) {
        const allVals = history.flatMap(h => [h[1], h[2], h[3], h[4]]);
        minPrice = Math.min(...allVals);
        maxPrice = Math.max(...allVals);
    } else {
        const prices = history.map(h => h[1]);
        minPrice = Math.min(...prices);
        maxPrice = Math.max(...prices);
    }

    if (customAnnotations && customAnnotations.length > 0) {
        customAnnotations.forEach(ann => {
            if (ann.y !== undefined && ann.y !== null && !isNaN(Number(ann.y))) {
                minPrice = Math.min(minPrice, Number(ann.y));
                maxPrice = Math.max(maxPrice, Number(ann.y));
            }
        });
    }

    const padding = (maxPrice - minPrice) * 0.1;
    const lastPrice = history.length > 0 ? (history[history.length - 1][isOHLC ? 4 : 1]) : 0;
    const annColor = getAnnotationColor(gid, lastPrice);

    const options = {
        series: seriesData,
        chart: { type: chartType, height: '100%', toolbar: { show: false }, animations: { enabled: false }, background: 'transparent' },
        theme: { mode: 'dark' },
        stroke: { curve: 'straight', width: isOHLC ? 1 : (range === '1d' ? 1 : 2), colors: isOHLC ? undefined : ['rgb(0, 117, 96)'] },
        fill: { type: isOHLC ? 'solid' : 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.0, stops: [0, 100] } },
        plotOptions: { candlestick: { colors: { upward: '#00FF9D', downward: '#FF3366' }, wick: { useFillColor: true } } },
        dataLabels: { enabled: false },
        annotations: {
            position: 'front',
            yaxis: customAnnotations.length > 0 ? customAnnotations : [{
                y: lastPrice,
                borderColor: annColor,
                label: { borderColor: annColor, style: { color: '#fff', background: annColor, opacity: 1, fontSize: '11px', fontWeight: 'bold', padding: { left: 4, right: 4, top: 2, bottom: 2 } }, text: lastPrice.toFixed(2), position: 'right', textAnchor: 'start', offsetX: 52 }
            }]
        },
        xaxis: {
            type: xaxisType, tickAmount: tickAmount,
            labels: {
                style: { colors: '#8A8D91' }, rotate: 0, formatter: function (value, timestamp) {
                    if (!value) return '';
                    const isIntraday = (range === '1d' || range === '-24h');
                    let date;
                    if (typeof value === 'string') {
                        date = new Date(value);
                        if (isNaN(date.getTime())) return value;
                    } else {
                        date = new Date(timestamp || value);
                    }
                    if (isIntraday) {
                        return date.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                    } else {
                        return date.toLocaleString('en-GB', { day: '2-digit', month: 'short' });
                    }
                }
            },
            axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false }
        },
        yaxis: { opposite: true, min: minPrice - padding, max: maxPrice + padding, tooltip: { enabled: true }, labels: { style: { colors: '#8A8D91' }, formatter: (val) => val.toFixed(2) } },
        tooltip: {
            theme: 'dark', shared: true, intersect: false,
            custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                const data = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
                if (!data) return '';
                let dateStr = typeof data.x === 'string' ? data.x : new Date(data.x).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
                let content = '';
                if (Array.isArray(data.y)) {
                    const [o, h, l, c] = data.y;
                    content = `<div class="apexcharts-tooltip-title" style="background: rgba(0,0,0,0.5); padding: 5px 10px; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">${dateStr}</div>
                               <div class="apexcharts-tooltip-series-group" style="padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;">
                                   <div style="display: flex; justify-content: space-between; gap: 15px;"><span style="color: #8A8D91;">Open:</span> <b style="color: #fff;">${Number(o).toFixed(2)}</b></div>
                                   <div style="display: flex; justify-content: space-between; gap: 15px;"><span style="color: #8A8D91;">High:</span> <b style="color: #fff;">${Number(h).toFixed(2)}</b></div>
                                   <div style="display: flex; justify-content: space-between; gap: 15px;"><span style="color: #8A8D91;">Low:</span> <b style="color: #fff;">${Number(l).toFixed(2)}</b></div>
                                   <div style="display: flex; justify-content: space-between; gap: 15px;"><span style="color: #8A8D91;">Close:</span> <b style="color: #fff;">${Number(c).toFixed(2)}</b></div>
                               </div>`;
                } else {
                    content = `<div class="apexcharts-tooltip-title" style="background: rgba(0,0,0,0.5); padding: 5px 10px; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">${dateStr}</div>
                               <div class="apexcharts-tooltip-series-group" style="padding: 8px 10px;">
                                   <div style="display: flex; justify-content: space-between; gap: 15px;"><span style="color: #8A8D91;">Price:</span> <b style="color: #fff;">${Number(data.y).toFixed(2)}</b></div>
                               </div>`;
                }
                return '<div class="glass" style="border: 1px solid rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">' + content + '</div>';
            }
        },
        grid: { padding: { right: 50 }, borderColor: 'rgba(255, 255, 255, 0.05)', xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } }
    };

    chartDiv.innerHTML = '';
    state.charts[gid] = new window.ApexCharts(chartDiv, options);
    state.charts[gid].render();
}

export async function updateOrderChart(oid) {
    const chartDiv = document.getElementById(`order-chart-${oid}`);
    if (!chartDiv) return;

    const order = state.activeOrdersMap[oid];
    if (!order) return;

    const gid = order.gConId || order.symbol;
    const range = '-1y'; // Sync with Strategies
    let history;

    try {
        if (state.historyCache[gid]) {
            history = state.historyCache[gid];
        } else {
            const contract = state.contractsMap[gid];
            const symbolIdentifier = (contract && (contract.localSymbol || contract.symbol)) || gid;

            const payload = {
                gConId: symbolIdentifier,
                start: range,
                legs: (contract && contract.secType === 'BAG' && contract.legs) ? contract.legs : null
            };
            const res = await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            history = await res.json();
            if (history && history.length > 0) state.historyCache[gid] = history;
        }

        if (!history || history.length === 0) {
            chartDiv.innerHTML = '<div class="empty-state">No Data Available</div>';
            return;
        }

        const annotations = [];
        if (order.orderType === 'LMT' && order.lmtPrice !== undefined && order.lmtPrice !== null && !isNaN(Number(order.lmtPrice))) {
            annotations.push({
                y: Number(order.lmtPrice), borderColor: '#00FF9D', strokeDashArray: 5,
                label: { borderColor: '#00FF9D', style: { color: '#000', background: '#00FF9D', opacity: 1, fontSize: '11px', fontWeight: 'bold', padding: { left: 4, right: 4, top: 2, bottom: 2 } }, text: 'LMT', position: 'right', textAnchor: 'start', offsetX: 52 }
            });
        }
        if (order.orderType === 'STP' && order.auxPrice !== undefined && order.auxPrice !== null && !isNaN(Number(order.auxPrice))) {
            annotations.push({
                y: Number(order.auxPrice), borderColor: '#FF3B30', strokeDashArray: 5,
                label: { borderColor: '#FF3B30', style: { color: '#fff', background: '#FF3B30', opacity: 1, fontSize: '11px', fontWeight: 'bold', padding: { left: 4, right: 4, top: 2, bottom: 2 } }, text: 'STOP', position: 'right', textAnchor: 'start', offsetX: 52 }
            });
        }

        drawChart(chartDiv, history, range, oid, annotations);

    } catch (e) {
        console.error("Order Chart Error", e);
        chartDiv.innerHTML = '<div class="empty-state">Error Loading Data</div>';
    }
}

export function updateChartRealtime(gid, price, timestamp) {
    if (!state.charts[gid]) return;
    const chart = state.charts[gid];
    const color = getAnnotationColor(gid, price);

    // Update Price Annotation
    chart.updateOptions({
        annotations: {
            position: 'front',
            yaxis: [{
                y: price, borderColor: color,
                label: { borderColor: color, style: { color: '#fff', background: color, opacity: 1, fontSize: '11px', fontWeight: 'bold', padding: { left: 4, right: 4, top: 2, bottom: 2 } }, text: price.toFixed(2), position: 'right', textAnchor: 'start', offsetX: 52 }
            }]
        }
    }, false, false); // No redraw yet

    // Update Series Data
    const series = chart.w.config.series[0].data;
    if (!series || series.length === 0) return;

    const isOHLC = Array.isArray(series[0].y);
    const time = timestamp || new Date().getTime();

    if (isOHLC) {
        // Update the last candle or append a new one if time has progressed significantly
        // For now, just update the last one to reflect current live price
        const lastCandle = series[series.length - 1];
        lastCandle.y[3] = price; // Close
        if (price > lastCandle.y[1]) lastCandle.y[1] = price; // High
        if (price < lastCandle.y[2]) lastCandle.y[2] = price; // Low
        
        chart.updateSeries([{ data: series }], false);
    } else {
        const newPoint = { x: time, y: price };
        chart.appendData([{ data: [newPoint] }]);
    }
}
