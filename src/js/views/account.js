// src/js/views/account.js
import { state } from '../core/state.js';
import { fetchAccountHistory } from '../services/api.js';

let accountChartInstance = null;

export function renderAccountView() {
    const container = document.getElementById('account-kpi-grid');
    if (!container) return;

    // Get Data from State
    const accId = state.currentAccount;
    const data = (state.accountsData && accId) ? state.accountsData[accId] : {};

    // Helper for currency format
    const fmt = (val) => {
        if (val === undefined || val === null) return '$0.00';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    const netLiq = parseFloat(data.NetLiquidation || 0);
    const availFunds = parseFloat(data.AvailableFunds || 0);
    const buyingPower = parseFloat(data.BuyingPower || 0);
    const unrealized = parseFloat(data.UnrealizedPnL || 0);
    const realized = parseFloat(data.RealizedPnL || 0);

    const kpiCards = [
        { label: 'Net Liquidation', value: fmt(netLiq), highlight: true },
        { label: 'Available Funds', value: fmt(availFunds) },
        { label: 'Buying Power', value: fmt(buyingPower) },
        { label: 'Unrealized P&L', value: fmt(unrealized), color: unrealized >= 0 ? 'positive' : 'negative' },
        { label: 'Realized P&L', value: fmt(realized), color: realized >= 0 ? 'positive' : 'negative' }
    ];

    container.innerHTML = kpiCards.map(card => `
        <div class="stat-card glass shadow">
            <div class="label">${card.label}</div>
            <div class="value ${card.color || ''}" style="${card.highlight ? 'font-size: 1.8rem; color: #fff;' : ''}">${card.value}</div>
        </div>
    `).join('');

    // Render Chart
    if (accId) {
        loadAccountHistory(accId);
    }
}

export async function loadAccountHistory(accountId) {
    try {
        const data = await fetchAccountHistory(accountId, '-1y');
        renderAccountChart(data);
    } catch (e) {
        console.error("Failed to load account history", e);
    }
}

export function renderAccountChart(data) {
    const chartDiv = document.querySelector("#account-chart");
    if (!chartDiv) return;

    // Reset
    if (accountChartInstance) {
        accountChartInstance.destroy();
    }

    if (!data || data.length === 0) {
        chartDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: #888;">No historical data available</div>';
        return;
    }

    const options = {
        series: [{
            name: 'Net Liquidation',
            data: data // [timestamp, value]
        }],
        chart: {
            type: 'area',
            height: 400,
            background: 'transparent',
            toolbar: { show: false },
            animations: { enabled: true }
        },
        colors: ['rgb(0, 117, 96)'], // Requested Green
        stroke: {
            curve: 'smooth',
            width: 2
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 90, 100]
            }
        },
        dataLabels: { enabled: false },
        grid: {
            borderColor: 'rgba(255, 255, 255, 0.05)',
            xaxis: { lines: { show: true } },
            yaxis: { lines: { show: true } },
            padding: { right: 20, left: 20 }
        },
        xaxis: {
            type: 'datetime',
            labels: { style: { colors: '#8A8D91' } },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            opposite: true,
            labels: {
                style: { colors: '#8A8D91' },
                formatter: (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
            }
        },
        theme: { mode: 'dark' }
    };

    chartDiv.innerHTML = '';
    accountChartInstance = new window.ApexCharts(chartDiv, options);
    accountChartInstance.render();
}
