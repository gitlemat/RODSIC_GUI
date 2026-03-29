// src/js/views/strategies.js
import { state } from '../core/state.js';
import { formatPrice } from '../utils/formatters.js';
import { drawChart } from '../components/charts.js';
import { fetchContractSync } from '../services/api.js';

// API Base (fallback to GUI proxy endpoint)
const API_BASE = '/api';

export async function refreshStrategies() {
    try {
        const res = await fetch(`${API_BASE}/strategies`);
        if (!res.ok) throw new Error("Failed to fetch strategies");
        const data = await res.json();

        // Ensure data is array or object we can iterate
        if (data && data.error) {
            console.error("Strategies Error returned from server:", data.error);
            throw new Error(data.error);
        }

        state.strategiesState = data;
        renderStrategiesView();
    } catch (e) {
        console.error("Strategies Error:", e);
        window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Failed to load strategies", type: "error" } }));
    }
}

export async function triggerStrategyReload() {
    window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Reloading Strategies in Backend...", type: "warning" } }));
    try {
        const { reloadStrategiesServer } = await import('../services/api.js');
        const res = await reloadStrategiesServer();
        if (res.error) throw new Error(res.error);

        window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Strategies Reloaded! Fetching data...", type: "success" } }));
        await refreshStrategies();
    } catch (e) {
        console.error("Reload Error:", e);
        window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Failed to reload strategies", type: "error" } }));
    }
}

export async function renderStrategiesView() {
    const container = document.getElementById('strategies-container');
    if (!container) return;

    const currentlyExpanded = new Set();
    const currentRows = document.querySelectorAll('.strategy-details');
    currentRows.forEach(row => {
        if (row.style.display !== 'none' && row.style.display !== '') {
            currentlyExpanded.add(row.id.replace('details-', ''));
        }
    });

    container.innerHTML = `
        <div class="portfolio-table-container glass shadow">
            <table class="modern-table" id="strategies-table">
                <thead>
                    <tr>
                        <th style="width: 40px;"></th>
                        <th>Symbol</th>
                        <th>Position</th>
                        <th>Avg Cost</th>
                        <th>Last Price</th>
                        <th>Realized PnL</th>
                        <th>Unrealized PnL</th>
                        <th>Status</th>
                        <th>Strategy</th>
                    </tr>
                </thead>
                <tbody id="strategies-body"></tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById('strategies-body');
    let html = '';

    for (const strat of (state.strategiesState || [])) {
        const symbol = strat.symbol;

        let foundGConId = null;
        for (const [gid, c] of Object.entries(state.contractsMap)) {
            if (c.symbol === symbol) {
                foundGConId = gid;
                break;
            }
        }

        const market = foundGConId ? state.marketDataCache[foundGConId] : null;
        const lastPrice = market ? (market.last || market.close || 0) : 0;

        let posQty = 0;
        let avgCost = 0;
        const targetAccounts = state.currentAccount ? [state.currentAccount] : Object.keys(state.accountsData || {});

        targetAccounts.forEach(accId => {
            const acc = state.accountsData[accId];
            if (acc && acc.positions) {
                for (const [cid, posData] of Object.entries(acc.positions)) {
                    const c = state.contractsMap[cid];
                    if (c && c.symbol === symbol) {
                        posQty += posData.pos;
                        avgCost += posData.avgCost * posData.pos;
                    }
                }
            }
        });

        const contract = foundGConId ? state.contractsMap[foundGConId] : null;
        const multiplier = (contract && contract.multiplier) ? contract.multiplier : 1;

        const perf = strat.performance || {};
        const stratPos = perf.netPosition !== undefined ? perf.netPosition : posQty;
        const stratAvg = perf.avgCost !== undefined ? perf.avgCost : avgCost;
        const realizedPnL = perf.realizedPnL !== undefined ? perf.realizedPnL : 0.0;

        let unrealizedPnL = 0.0;
        if (stratPos !== 0 && lastPrice > 0) {
            if (perf.avgCost !== undefined) {
                // Tracker based: price per unit
                unrealizedPnL = (lastPrice - stratAvg) * stratPos * multiplier;
            } else {
                // IB based: total cost
                unrealizedPnL = (lastPrice * multiplier - stratAvg) * stratPos;
            }
        }

        const statusClass = strat.enabled ? 'active' : 'inactive';
        const rowClass = strat.enabled ? '' : 'disabled-row';

        const uniqueKey = `${strat.StratName}_${strat.symbol}`;
        const safeName = uniqueKey.replace(/[^a-zA-Z0-9]/g, '_');
        const chartId = `strat-chart-${safeName}`;

        const pnlClass = realizedPnL >= 0 ? 'text-green' : 'text-red';
        const unPnlClass = unrealizedPnL >= 0 ? 'text-green' : 'text-red';

        // Display Avg Cost as price-per-unit
        const displayAvg = perf.avgCost !== undefined ? stratAvg : (multiplier !== 0 ? stratAvg / (multiplier * (stratPos || 1)) : 0);
        // Wait, if stratAvg is total_cost for all positions, then it's (avgPriceIB * qty).
        // Then avgPriceIB = stratAvg / qty.
        // And price per unit = avgPriceIB / multiplier = stratAvg / (multiplier * qty).
        // Actually, in the loop: avgCost += posData.avgCost * posData.pos;
        // So stratAvg is the sum of (TotalCostPerContract * NumContracts).
        // Then NormalizedAvg = stratAvg / (multiplier * totalQty).

        html += `
            <tr class="strategy-row ${rowClass}" onclick="window.toggleStrategyRow('${safeName}', '${foundGConId}')" style="cursor: pointer;">
                <td class="expand-icon"><i data-lucide="chevron-right" id="icon-${safeName}"></i></td>
                <td><span class="symbol-name">${symbol}</span></td>
                <td style="color: ${stratPos > 0 ? 'var(--accent-green)' : (stratPos < 0 ? 'var(--accent-red)' : 'var(--text-secondary)')}">${stratPos}</td>
                <td>${formatPrice(perf.avgCost !== undefined ? stratAvg : (multiplier !== 0 && stratPos !== 0 ? stratAvg / (multiplier * stratPos) : 0))}</td>
                <td>${formatPrice(lastPrice)}</td>
                <td class="${pnlClass}">${formatPrice(realizedPnL)}</td>
                <td class="${unPnlClass}">${formatPrice(unrealizedPnL)}</td>
                <td><span class="status-badge ${statusClass}">${strat.enabled ? 'ACTIVE' : 'INACTIVE'}</span></td>
                <td style="font-size: 0.85em; color: var(--text-secondary);">${strat.StratName}</td>
            </tr>
            <tr class="strategy-details" id="details-${safeName}" style="display: none;">
                <td colspan="9">
                    <div class="strategy-details-header" style="display: flex; justify-content: flex-end; align-items: center; padding: 0.5rem 1rem; background: rgba(0,0,0,0.3); border-bottom: 1px solid var(--border-color); gap: 20px;">
                        
                        <!-- Auto-Regenerate Toggle -->
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                                ${strat.config.auto_recreate !== false ? 'Auto-Regenerate: ON' : 'Auto-Regenerate: OFF'}
                            </span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-recreate-${safeName}" ${strat.config.auto_recreate !== false ? 'checked' : ''} onchange="window.toggleStrategyRecreate('${strat.StratName}', '${symbol}', ${strat.config.auto_recreate !== false}, this)">
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- Auto-Fix Toggle -->
                        <div style="display: flex; align-items: center; gap: 10px; border-left: 1px solid var(--border-color); padding-left: 20px;">
                            <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                                ${strat.config.auto_fix === true ? 'Auto-Fix: ON' : 'Auto-Fix: OFF'}
                            </span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-autofix-${safeName}" ${strat.config.auto_fix === true ? 'checked' : ''} onchange="window.toggleStrategyAutoFix('${strat.StratName}', '${symbol}', ${strat.config.auto_fix === true}, this)">
                                <span class="slider" style="background-color: var(--accent-red); /* Override basic color for diff */"></span>
                            </label>
                        </div>

                        <!-- Strategy Enabled Toggle -->
                        <div style="display: flex; align-items: center; gap: 10px; border-left: 1px solid var(--border-color); padding-left: 20px;">
                            <span style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${strat.enabled ? 'Strategy Active' : 'Strategy Disabled'}</span>
                            <label class="switch">
                                <input type="checkbox" id="toggle-${safeName}" ${strat.enabled ? 'checked' : ''} onchange="window.toggleStrategyStatus('${strat.StratName}', '${symbol}', ${strat.enabled}, this)">
                                <span class="slider"></span>
                            </label>
                        </div>
                        
                    </div>
                    <div class="strategy-chart-container" style="padding: 1rem; background: rgba(0,0,0,0.2);">
                         <div class="strategy-chart-wrapper" id="${chartId}" style="height: 450px;"></div>
                    </div>
                    <div id="orders-${safeName}" class="strategy-orders-container" style="display: none; padding: 1rem; margin: 0 1rem 1rem 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid var(--border-color);"></div>
                </td>
            </tr>
        `;
    }

    if (!state.strategiesState || state.strategiesState.length === 0) {
        html = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No strategies loaded</td></tr>';
    }

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();

    for (const strat of (state.strategiesState || [])) {
        const uniqueKey = `${strat.StratName}_${strat.symbol}`;
        const safeName = uniqueKey.replace(/[^a-zA-Z0-9]/g, '_');
        if (currentlyExpanded.has(safeName)) {
            let foundGConId = null;
            for (const [gid, c] of Object.entries(state.contractsMap)) {
                if (c.symbol === strat.symbol) {
                    foundGConId = gid;
                    break;
                }
            }
            window.toggleStrategyRow(safeName, foundGConId);
        }
    }
}

export async function toggleStrategyRow(safeName, gConId) {
    const detailsRow = document.getElementById(`details-${safeName}`);
    const icon = document.getElementById(`icon-${safeName}`);
    const chartId = `strat-chart-${safeName}`;
    const chartContainer = document.getElementById(chartId);

    if (!detailsRow) return;

    if (detailsRow.style.display === 'none') {
        detailsRow.style.display = 'table-row';
        icon.setAttribute('data-lucide', 'chevron-down');

        const strat = state.strategiesState.find(s => {
            const uniqueKey = `${s.StratName}_${s.symbol}`;
            return uniqueKey.replace(/[^a-zA-Z0-9]/g, '_') === safeName;
        });

        if (!strat) return;

        let validGConId = (gConId && gConId !== 'null' && gConId !== 'undefined') ? gConId : null;

        if (!validGConId) {
            console.log(`[Strategy] Contract ID missing for ${strat.symbol}. Attempting sync...`);
            if (chartContainer) chartContainer.innerHTML = '<div class="chart-loading">Resolving Contract...</div>';

            try {
                const data = await fetchContractSync(strat.symbol);
                if (data.gConId) {
                    validGConId = data.gConId;
                    console.log(`[Strategy] Resolved ${strat.symbol} -> ${validGConId}`);

                    if (!state.contractsMap[validGConId]) {
                        state.contractsMap[validGConId] = {
                            gConId: data.gConId,
                            symbol: strat.symbol,
                            secType: data.secType || 'FUT',
                            last: data.ticks ? data.ticks.last : undefined
                        };
                        if (data.ticks && data.ticks.last) {
                            if (!state.marketDataCache[validGConId]) state.marketDataCache[validGConId] = {};
                            state.marketDataCache[validGConId].last = data.ticks.last;
                        }
                    }
                }
            } catch (e) {
                console.error("Sync Error", e);
            }
        }

        if (strat.StratName && strat.StratName.toLowerCase().includes('pentagrama')) {
            renderStrategyOrders(strat, 'orders-' + `${strat.StratName}_${strat.symbol}`.replace(/[^a-zA-Z0-9]/g, '_'));
        }

        if (validGConId) {
            renderStrategyChart(strat, validGConId, chartId);
        } else {
            if (chartContainer) chartContainer.innerHTML = '<div class="chart-error">Contract not found</div>';
        }

    } else {
        detailsRow.style.display = 'none';
        icon.setAttribute('data-lucide', 'chevron-right');
    }
    if (window.lucide) window.lucide.createIcons();
}

export async function renderStrategyChart(strat, gConId, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let history;
    // Only use cache if it explicitly holds -1y data.
    if (state.historyCache[gConId] && state.chartStates[gConId] && state.chartStates[gConId].range === '-1y') {
        history = state.historyCache[gConId];
    }

    if (!history || history.length === 0) {
        try {
            const contract = state.contractsMap[gConId];
            const symbolIdentifier = (contract && (contract.localSymbol || contract.symbol)) || gConId;

            const payload = {
                gConId: symbolIdentifier,
                start: '-1y',
                legs: (contract && contract.secType === 'BAG' && contract.legs) ? contract.legs : null
            };

            const res = await fetch(`/api/history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                history = await res.json();
                if (history && history.length > 0) {
                    state.historyCache[gConId] = history;
                    if (!state.chartStates[gConId]) state.chartStates[gConId] = {};
                    state.chartStates[gConId].range = '-1y';
                }
            }
        } catch (e) {
            console.error("Strat Chart Error", e);
            el.innerHTML = '<div class="chart-error">Data Error</div>';
            return;
        }
    }

    if (!history || history.length === 0) {
        el.innerHTML = '<div class="chart-error">No Data</div>';
        return;
    }

    el.innerHTML = '';

    const annotations_yaxis = [];
    if (state.activeOrdersMap) {
        Object.values(state.activeOrdersMap).forEach(order => {
            const isRelated = order.symbol === strat.symbol || order.conId == gConId || (state.contractsMap[order.conId] && state.contractsMap[order.conId].symbol === strat.symbol);

            // Strictly 'Submitted' state
            const isSubmitted = order.status && order.status.toLowerCase() === 'submitted';

            if (isRelated && isSubmitted) {
                if (order.orderType === 'LMT' && order.lmtPrice !== undefined && order.lmtPrice !== null && !isNaN(Number(order.lmtPrice))) {
                    annotations_yaxis.push({
                        y: Number(order.lmtPrice),
                        borderColor: '#00FF9D',
                        strokeDashArray: 5,
                        label: {
                            borderColor: '#00FF9D',
                            style: {
                                color: '#000',
                                background: '#00FF9D',
                                padding: { left: 5, right: 5, top: 2, bottom: 2 },
                                fontWeight: 'bold'
                            },
                            text: `LMT ${order.action} ${order.totalQuantity} @ ${formatPrice(order.lmtPrice)}`,
                            position: 'left',
                            textAnchor: 'start',
                            offsetX: 0
                        }
                    });
                }
                if (order.orderType === 'STP' && order.auxPrice !== undefined && order.auxPrice !== null && !isNaN(Number(order.auxPrice))) {
                    annotations_yaxis.push({
                        y: Number(order.auxPrice),
                        borderColor: '#FF3B30',
                        strokeDashArray: 5,
                        label: {
                            borderColor: '#FF3B30',
                            style: {
                                color: '#fff',
                                background: '#FF3B30',
                                padding: { left: 5, right: 5, top: 2, bottom: 2 },
                                fontWeight: 'bold'
                            },
                            text: `STP ${order.action} ${order.totalQuantity} @ ${formatPrice(order.auxPrice)}`,
                            position: 'left',
                            textAnchor: 'start',
                            offsetX: 0
                        }
                    });
                }
            }
        });
    }

    drawChart(el, history, '-1y', gConId, annotations_yaxis);
    state.strategyCharts[strat.name] = state.charts[gConId];
}

function getFriendlyErrorMessage(status) {
    if (!status) return null;
    if (status === 'ERROR_PARENT_CANCELLED') return 'The entry order was cancelled in TWS. The strategy cannot proceed automatically.';
    if (status === 'ERROR_PARENT_MISSING') return 'The entry order is missing from the system. Re-sync or manual fix required.';
    if (status === 'ERROR_CHILD_CANCELLED_IN_MARKET') return 'One of the protective orders (TP/SL) was cancelled manually in TWS.';
    if (status === 'ERROR_CHILDREN_MISSING_IN_MARKET') return 'The protective orders are missing in TWS. The position is unprotected!';
    if (status === 'ERROR_MISSING_ORDERS') return 'The level state is inconsistent (missing tracked order IDs).';
    if (status.startsWith('ERROR_')) return `System detected a problem: ${status}. Manual intervention recommended.`;
    return null;
}

export function renderStrategyOrders(strat, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const runtimeState = strat.runtime_state || {};
    const configLevels = (strat.config && strat.config.levels) ? strat.config.levels : [];

    if (Object.keys(runtimeState).length === 0 && configLevels.length === 0) {
        container.style.display = 'none';
        return;
    }

    let levelsMap = {};

    configLevels.forEach(levelCfg => {
        const lid = String(levelCfg.id);
        const slPrice = levelCfg.sl_price || '-';
        const tpPrice = levelCfg.tp_price || '-';
        const pPrice = levelCfg.price || '-';
        const qty = levelCfg.qty || '-';
        const action = levelCfg.action || '-';

        levelsMap[lid] = {
            id: lid,
            parent: { oid: 'Unplaced', status: strat.enabled ? 'Pending/Unknown' : 'Disabled', action: action, orderType: 'LMT', totalQuantity: qty, lmtPrice: pPrice },
            children: [
                { oid: 'Unplaced', childLabel: 'TP', status: strat.enabled ? 'Pending/Unknown' : 'Disabled', action: action === 'BUY' ? 'SELL' : (action === 'SELL' ? 'BUY' : '-'), orderType: 'LMT', totalQuantity: qty, lmtPrice: tpPrice },
                { oid: 'Unplaced', childLabel: 'SL', status: strat.enabled ? 'Pending/Unknown' : 'Disabled', action: action === 'BUY' ? 'SELL' : (action === 'SELL' ? 'BUY' : '-'), orderType: 'STP', totalQuantity: qty, auxPrice: slPrice }
            ]
        };
    });

    Object.entries(runtimeState).forEach(([cid, s]) => {
        const parts = cid.split('::');
        const lid = parts.length > 1 ? parts[1] : cid;

        if (!levelsMap[lid]) {
            levelsMap[lid] = { id: lid, parent: null, children: [], runtimeStatus: s.status };
        } else {
            levelsMap[lid].runtimeStatus = s.status;
        }

        if (s.parentId) {
            levelsMap[lid].parent = state.activeOrdersMap[s.parentId]
                ? { oid: s.parentId, ...state.activeOrdersMap[s.parentId] }
                : { oid: s.parentId, status: 'Placed (Unknown Status)', action: '-', orderType: '-', totalQuantity: '-', lmtPrice: '-', auxPrice: '-' };
        }

        levelsMap[lid].children = [];

        if (s.tpId) {
            levelsMap[lid].children.push(state.activeOrdersMap[s.tpId]
                ? { oid: s.tpId, childLabel: 'TP', ...state.activeOrdersMap[s.tpId] }
                : { oid: s.tpId, childLabel: 'TP', status: 'Placed (Unknown Status)', action: '-', orderType: '-', totalQuantity: '-', lmtPrice: '-', auxPrice: '-' }
            );
        }
        if (s.slId) {
            levelsMap[lid].children.push(state.activeOrdersMap[s.slId]
                ? { oid: s.slId, childLabel: 'SL', ...state.activeOrdersMap[s.slId] }
                : { oid: s.slId, childLabel: 'SL', status: 'Placed (Unknown Status)', action: '-', orderType: '-', totalQuantity: '-', lmtPrice: '-', auxPrice: '-' }
            );
        }
    });

    const levels = Object.values(levelsMap).filter(l => l.parent || l.children.length > 0);

    levels.sort((a, b) => {
        const numA = parseInt(a.id);
        const numB = parseInt(b.id);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a.id).localeCompare(String(b.id));
    });

    if (levels.length === 0) {
        container.style.display = 'none';
        return;
    }

    let html = `
        <h3 style="margin-bottom: 1rem; font-size: 1rem; color: var(--text-secondary);">Tracked Orders by Level</h3>
        <table class="modern-table strat-orders-table" style="font-size: 0.85rem;">
            <thead>
                <tr>
                    <th>Level / OrderID</th>
                    <th>PermID</th>
                    <th>Action</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    const getPriceDisplay = (o) => {
        if (o.status === 'Pending/Unknown') return '-';
        if (o.orderType === 'STP' && o.auxPrice) return formatPrice(o.auxPrice);
        if (o.lmtPrice && o.lmtPrice !== 0 && o.lmtPrice !== "0.0") return formatPrice(o.lmtPrice);
        return 'MKT';
    };

    levels.forEach((lvl) => {
        const errorMsg = getFriendlyErrorMessage(lvl.runtimeStatus);
        
        if (errorMsg) {
            let resolutionButtons = '';
            
            // Fix Button
            resolutionButtons += `<button class="btn-resolve fix" onclick="window.triggerFixLevel('${strat.StratName}', '${strat.symbol}', '${lvl.id}')">
                <i data-lucide="wrench"></i> Fix Level
            </button>`;
            
            // Assume Executed (Parent)
            if (['ERROR_PARENT_MISSING', 'ERROR_MISSING_ORDERS', 'ERROR_PARENT_CANCELLED'].includes(lvl.runtimeStatus)) {
                resolutionButtons += `<button class="btn-resolve assume" onclick="window.triggerAssumeExecuted('${strat.StratName}', '${strat.symbol}', '${lvl.id}', 'PARENT')">
                    <i data-lucide="check-circle"></i> Assume Executed
                </button>`;
            }

            // Assume Executed (Child)
            if (lvl.runtimeStatus === 'ERROR_CHILD_CANCELLED_IN_MARKET' || lvl.runtimeStatus === 'ERROR_CHILDREN_MISSING_IN_MARKET') {
                 // Check if it's TP or SL that's missing - usually both are handled by assume executed on child
                 resolutionButtons += `<button class="btn-resolve assume" onclick="window.triggerAssumeExecuted('${strat.StratName}', '${strat.symbol}', '${lvl.id}', 'CHILD')">
                    <i data-lucide="check-circle"></i> Assume TP/SL Executed
                </button>`;
            }

            html += `
                <div class="strat-level-alert">
                    <i data-lucide="alert-triangle"></i>
                    <div class="message">
                        <strong>Action Required on Level ${lvl.id}:</strong><br>
                        ${errorMsg}
                    </div>
                    <div class="resolution-toolbar">
                        ${resolutionButtons}
                    </div>
                </div>
            `;
        }

        if (lvl.parent) {
            const p = lvl.parent;
            const actionClass = (p.action || '').toUpperCase() === 'BUY' ? 'positive' : ((p.action || '').toUpperCase() === 'SELL' ? 'negative' : '');
            let statusBadge = `<span class="badge status-${(p.status || 'unknown').toLowerCase().replace(/[\\/ ()]/g, '')}">${p.status}</span>`;
            if (p.oid === 'Unplaced') statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-secondary);">${p.status}</span>`;
            
            html += `
                <tr class="level-parent-row" style="background: rgba(255,255,255,0.05);">
                    <td><strong>LVL ${lvl.id}</strong> &nbsp;<span class="mono" style="color:var(--text-secondary);">(${p.oid || p.orderId})</span></td>
                    <td class="mono">${p.permId || '-'}</td>
                    <td class="${actionClass}"><strong>${p.action}</strong></td>
                    <td>Parent (${p.orderType || '-'})</td>
                    <td>${getPriceDisplay(p)}</td>
                    <td>${p.totalQuantity}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        } else {
            html += `<tr class="level-parent-row" style="background: rgba(255,107,107,0.1);"><td colspan="7"><strong>LVL ${lvl.id} (Orphaned Level - Critical Error)</strong></td></tr>`;
        }

        lvl.children.forEach(c => {
            const actionClass = (c.action || '').toUpperCase() === 'BUY' ? 'positive' : ((c.action || '').toUpperCase() === 'SELL' ? 'negative' : '');
            const childLabel = c.childLabel || (c.orderType === 'STP' ? 'SL' : 'TP');

            let statusBadge = `<span class="badge status-${(c.status || 'unknown').toLowerCase().replace(/[\\/ ()]/g, '')}">${c.status}</span>`;
            if (c.oid === 'Unplaced') statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-secondary);">${c.status}</span>`;

            html += `
                <tr class="level-child-row" style="opacity: 0.9;">
                    <td style="padding-left: 2rem; color: var(--text-secondary);">↳ <span class="mono">${c.oid || c.orderId}</span></td>
                    <td class="mono">${c.permId || '-'}</td>
                    <td class="${actionClass}">${c.action}</td>
                    <td>${childLabel} (${c.orderType || '-'})</td>
                    <td>${getPriceDisplay(c)}</td>
                    <td>${c.totalQuantity}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        });
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    container.style.display = 'block';
}

export function refreshStrategyOrdersAll() {
    if (!state.strategiesState || !Array.isArray(state.strategiesState)) return;
    state.strategiesState.forEach(strat => {
        if (strat.StratName && strat.StratName.toLowerCase().includes('pentagrama')) {
            const containerId = 'orders-' + `${strat.StratName}_${strat.symbol}`.replace(/[^a-zA-Z0-9]/g, '_');
            if (document.getElementById(containerId)) {
                renderStrategyOrders(strat, containerId);
            }
        }
    });
}

export async function toggleStrategyStatus(stratName, symbol, currentStatus, checkboxElem) {
    const newStatus = !currentStatus;
    if (checkboxElem) checkboxElem.disabled = true;

    try {
        const payload = { enabled: newStatus };
        const res = await fetch(`${API_BASE}/strategies/${stratName}/${symbol}/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            await refreshStrategies();
        } else {
            console.error("Toggle failed:", await res.text());
            if (checkboxElem) {
                checkboxElem.disabled = false;
                checkboxElem.checked = currentStatus;
            }
        }
    } catch (err) {
        console.error("Toggle request error:", err);
        if (checkboxElem) {
            checkboxElem.disabled = false;
            checkboxElem.checked = currentStatus;
        }
    }
}

export async function toggleStrategyRecreate(stratName, symbol, currentStatus, checkboxElem) {
    const newStatus = !currentStatus;
    if (checkboxElem) checkboxElem.disabled = true;

    try {
        const { toggleStrategyRecreateServer } = await import('../services/api.js');
        const res = await toggleStrategyRecreateServer(stratName, symbol, newStatus);

        if (res.status === 'success') {
            await refreshStrategies();
        } else {
            console.error("Toggle Recreate failed:", res.error);
            if (checkboxElem) {
                checkboxElem.disabled = false;
                checkboxElem.checked = currentStatus;
            }
        }
    } catch (err) {
        console.error("Toggle Recreate error:", err);
        if (checkboxElem) {
            checkboxElem.disabled = false;
            checkboxElem.checked = currentStatus;
        }
    }
}

export async function toggleStrategyAutoFix(stratName, symbol, currentStatus, checkboxElem) {
    const newStatus = !currentStatus;
    if (checkboxElem) checkboxElem.disabled = true;

    try {
        const { toggleStrategyAutoFixServer } = await import('../services/api.js');
        const res = await toggleStrategyAutoFixServer(stratName, symbol, newStatus);

        if (res.status === 'success') {
            await refreshStrategies();
        } else {
            console.error("Toggle AutoFix failed:", res.error);
            if (checkboxElem) {
                checkboxElem.disabled = false;
                checkboxElem.checked = currentStatus;
            }
        }
    } catch (err) {
        console.error("Toggle AutoFix error:", err);
        if (checkboxElem) {
            checkboxElem.disabled = false;
            checkboxElem.checked = currentStatus;
        }
    }
}

export async function triggerFixLevel(stratName, symbol, lid) {
    if (!confirm(`Are you sure you want to cancel any hanging orders and recreate Level ${lid} from scratch?`)) {
        return;
    }

    try {
        const { triggerManualFixServer } = await import('../services/api.js');
        const res = await triggerManualFixServer(stratName, symbol, lid);
        if (res.status === 'success') {
            alert(`Level ${lid} fix initiated successfully.`);
            await refreshStrategies();
        } else {
            alert(`Failed to trigger fix: ${res.detail || res.error || 'Unknown error'}`);
        }
    } catch (err) {
        console.error("Trigger Fix error:", err);
        alert(`Failed to trigger fix: ${err.message}`);
    }
}

export async function triggerAssumeExecuted(stratName, symbol, lid, orderType) {
    if (!confirm(`WARNING: Are you sure you want to inject a synthetic fill for the ${orderType} order of Level ${lid}? This will adjust your tracker but not send any real orders to IB. Make sure you verified the execution in TWS first.`)) {
        return;
    }

    try {
        const { assumeOrderExecutedServer } = await import('../services/api.js');
        const res = await assumeOrderExecutedServer(stratName, symbol, lid, orderType);
        if (res.status === 'success') {
            alert(`Injected synthetic execution for ${orderType} on Level ${lid}.`);
            await refreshStrategies();
        } else {
            alert(`Failed to assume execution: ${res.detail || res.error || 'Unknown error'}`);
        }
    } catch (err) {
        console.error("Assume Executed error:", err);
        alert(`Failed to execute synthetic fill: ${err.message}`);
    }
}
window.triggerFixLevel = triggerFixLevel;
window.triggerAssumeExecuted = triggerAssumeExecuted;
