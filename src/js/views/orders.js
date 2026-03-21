// src/js/views/orders.js
import { state } from '../core/state.js';
import { updateOrderChart } from '../components/charts.js';
import { cancelOrder, fetchOrders } from '../services/api.js';
import { formatDecimal } from '../utils/formatters.js';

export async function refreshOrders() {
    try {
        const data = await fetchOrders();
        state.activeOrdersMap = data;
        renderOrders(state.activeOrdersMap);
    } catch (e) {
        console.error("Orders Error:", e);
        // showNotification("Failed to load orders", "error"); // Ensure notification exists in main
    }
}

export function renderOrders(orders) {
    const tbody = document.getElementById('active-orders-body');
    if (!tbody) return;

    if (!orders || Object.keys(orders).length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No Active Orders</td></tr>';
        return;
    }

    if (orders.error) {
        console.error("Orders API Error:", orders.error);
        tbody.innerHTML = `<tr><td colspan="8" class="error-state">Error: ${orders.error}</td></tr>`;
        return;
    }

    if (typeof window.refreshStrategyOrdersAll === 'function') {
        window.refreshStrategyOrdersAll();
    }

    // Build Strategy Lookup
    const orderIdToStrategy = {};
    if (state.strategiesState) {
        state.strategiesState.forEach(strat => {
            if (strat.runtime_state) {
                Object.values(strat.runtime_state).forEach(s => {
                    if (s.parentId) orderIdToStrategy[s.parentId] = strat.StratName;
                    if (s.tpId) orderIdToStrategy[s.tpId] = strat.StratName;
                    if (s.slId) orderIdToStrategy[s.slId] = strat.StratName;
                });
            }
        });
    }

    let html = '';
    const activeOrdersMap = orders && !orders.error ? orders : {};
    const activeOrders = Object.entries(activeOrdersMap).filter(([_, data]) => data.accountId === state.currentAccount);

    if (activeOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No Active Orders for this Account</td></tr>';
        return;
    }

    activeOrders.forEach(([oid, data]) => {
        if (!data || typeof data !== 'object') return;

        const isExpanded = state.expandedOrderRows.has(oid);
        const actionClass = (data.action || '').toUpperCase() === 'BUY' ? 'positive' : 'negative';
        const filledPct = (data.totalQuantity > 0) ? (data.filled / data.totalQuantity) * 100 : 0;

        let displayPrice = data.lmtPrice;
        if (data.orderType === 'MKT') {
            displayPrice = 'MKT';
        } else if (data.orderType === 'STP') {
            displayPrice = formatDecimal(data.auxPrice);
        } else if (displayPrice) {
            displayPrice = formatDecimal(displayPrice);
        } else {
            displayPrice = 'MKT';
        }

        let detailPriceLabel = 'Limit Price';
        let detailPriceValue = formatDecimal(data.lmtPrice);

        if (data.orderType === 'STP') {
            detailPriceLabel = 'Aux Price';
            detailPriceValue = formatDecimal(data.auxPrice);
        }

        const rawOrderRef = (data.orderRef || '').trim();
        let strategyName = orderIdToStrategy[oid] || '-';

        // Robust Fallback: Try parsing orderRef if it contains strategy name pattern
        if (strategyName === '-' && rawOrderRef.includes('::')) {
            strategyName = rawOrderRef.split('::')[0];
        }

        html += `
            <tr class="main-row ${isExpanded ? 'active' : ''}" onclick="window.toggleOrderRow('${oid}')">
                <td><span class="mono">${oid}</span></td>
                <td><span class="symbol-name">${strategyName}</span></td>
                <td><span class="symbol-name">${data.symbol || 'N/A'}</span></td>
                <td class="${actionClass}">${data.action || '-'}</td>
                <td><span class="badge status-${(data.status || 'unknown').toLowerCase()}">${data.status || 'Unknown'}</span></td>
                <td>
                    <div class="progress-cell">
                        <span>${data.filled}/${data.totalQuantity}</span>
                        <div class="progress-bar-mini">
                            <div class="fill" style="width: ${filledPct}%"></div>
                        </div>
                    </div>
                </td>
                <td>${displayPrice || '-'}</td>
                <td>${data.orderType || '-'}</td>
                <td style="text-align: center; color: var(--text-muted); padding: 0 10px;">
                    <i data-lucide="chevron-${isExpanded ? 'up' : 'down'}"></i>
                </td>
            </tr>
        `;

        if (isExpanded) {
            html += `
                <tr class="detail-row">
                    <td colspan="9">
                        <div class="expansion-content glass" style="flex-direction: column;">
                            <div style="display: flex; width: 100%;">
                                <div class="meta-info">
                                    <div class="info-group"><label>Order Ref</label><span>${rawOrderRef || '-'}</span></div>
                                    <div class="info-group"><label>Perm ID</label><span>${data.permId || '-'}</span></div>
                                    <div class="info-group"><label>Time In Force</label><span>${data.tif || '-'}</span></div>
                                    <div class="info-group"><label>${detailPriceLabel}</label><span>${detailPriceValue}</span></div>
                                    <div class="info-group"><label>Last Fill Price</label><span>${formatDecimal(data.lastFillPrice)}</span></div>
                                    <div class="info-group"><label>Remaining</label><span>${data.remaining || 0}</span></div>
                                </div>
                                <div class="chart-section" style="flex: 1; padding: 0 1rem;">
                                    <div class="chart-container" id="order-chart-${oid}">
                                        <div class="chart-loading">Loading History...</div>
                                    </div>
                                </div>
                            </div>
                            <div class="action-bar" style="display: flex; gap: 10px; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px; justify-content: flex-end;">
                                <button class="btn-primary" style="background: var(--accent-red);" title="Cancel Order" onclick="window.cancelOrder('${oid}')" ${['CANCELLED', 'PENDINGCANCEL', 'FILLED', 'INACTIVE'].includes((data.status || '').toUpperCase()) ? 'disabled' : ''}>
                                    <i data-lucide="x-circle"></i> Cancel Order
                                </button>
                                <button class="btn-primary" title="Modify Order" onclick="window.modifyOrder('${oid}')" ${['CANCELLED', 'PENDINGCANCEL', 'FILLED', 'INACTIVE'].includes((data.status || '').toUpperCase()) ? 'disabled' : ''}>
                                    <i data-lucide="edit-3"></i> Modify Order
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;

            setTimeout(() => updateOrderChart(oid), 50);
        }
    });

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

export function toggleOrderRow(oid) {
    if (state.expandedOrderRows.has(oid)) {
        state.expandedOrderRows.delete(oid);
    } else {
        state.expandedOrderRows.add(oid);
    }
    renderOrders(state.activeOrdersMap);
}

export async function handleCancel(oid) {
    if (!confirm('Are you sure you want to cancel order ' + oid + '?')) return;
    try {
        const res = await cancelOrder(oid);
        if (!res.error) {
            window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: `Cancelation Request Sent for Order #${oid}`, type: "info" } }));
            window.dispatchEvent(new CustomEvent('app:refreshData'));
        } else {
            window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Cancelation Request Failed", type: "error" } }));
        }
    } catch (err) {
        window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Cancelation Request Failed (Server Error)", type: "error" } }));
    }
}
