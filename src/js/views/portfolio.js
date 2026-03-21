// src/js/views/portfolio.js
import { state } from '../core/state.js';
import { getCurrencySymbol } from '../utils/formatters.js';
import { updateChart } from '../components/charts.js';
import { fetchContractSync, saveWatchlist, deleteFromWatchlist } from '../services/api.js';

export function updateAccountSummary(accounts) {
    if (!accounts || Object.keys(accounts).length === 0) return;
    if (accounts.error) {
        console.error("Account API Error:", accounts.error);
        return;
    }

    state.accountsData = accounts;

    // In monolithic app, renderAccountSelector was called here. We might need a global event or externalize.
    window.dispatchEvent(new CustomEvent('app:renderAccountSelector', { detail: accounts }));

    const sortedIds = Object.keys(accounts).sort();
    if (!state.currentAccount || !accounts[state.currentAccount]) {
        state.currentAccount = sortedIds[0];
    }

    const data = accounts[state.currentAccount];
    // Removed legacy status indicator updates (now handled centrally in main.js pollHealth)

    const equity = parseFloat(data.NetLiquidation || 0);
    const unrealized = parseFloat(data.UnrealizedPnL || 0);
    const realized = parseFloat(data.RealizedPnL || 0);
    const totalPnl = unrealized + realized;
    const dailyPnl = parseFloat(data.DailyPnL || 0);
    const marginUsed = parseFloat(data.MaintMarginReq || 0);

    const accountIdEl = document.getElementById('account-id');
    const miniEquityEl = document.getElementById('mini-equity');
    if (accountIdEl) accountIdEl.textContent = state.currentAccount;
    if (miniEquityEl) miniEquityEl.textContent = `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const pnlEl = document.getElementById('stat-pnl');
    if (pnlEl) {
        pnlEl.textContent = `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        pnlEl.className = `value ${totalPnl >= 0 ? 'positive' : 'negative'}`;
    }

    const pnlTrend = document.getElementById('stat-pnl-trend');
    if (pnlTrend) {
        const pnlPct = equity > 0 ? (totalPnl / (equity - totalPnl)) * 100 : 0;
        pnlTrend.innerHTML = `<i data-lucide="trending-${totalPnl >= 0 ? 'up' : 'down'}"></i> ${Math.abs(pnlPct).toFixed(2)}%`;
        pnlTrend.className = `trend ${totalPnl >= 0 ? 'positive' : 'negative'}`;
    }

    const dailyEl = document.getElementById('stat-daily');
    if (dailyEl) {
        dailyEl.textContent = `${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        dailyEl.className = `value ${dailyPnl >= 0 ? 'positive' : 'negative'}`;
    }

    const marginEl = document.getElementById('stat-margin');
    const marginFill = document.getElementById('stat-margin-fill');
    if (marginEl) marginEl.textContent = `$${marginUsed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (marginFill) {
        const marginUsage = equity > 0 ? (marginUsed / equity) * 100 : 0;
        marginFill.style.width = `${Math.min(marginUsage, 100)}%`;
        if (marginUsage > 80) marginFill.style.background = 'var(--accent-red)';
        else if (marginUsage > 50) marginFill.style.background = '#FFCC00';
        else marginFill.style.background = 'var(--accent-blue)';
    }

    if (window.lucide) window.lucide.createIcons();

    if (state.currentTab === 'account') {
        window.dispatchEvent(new CustomEvent('view:loadAccount'));
    }
}

export function recalculateSpreadPrice(spreadId) {
    const spread = state.contractsMap[spreadId];
    if (!spread || !spread.legs) return;

    let syntheticPrice = 0;

    for (const leg of spread.legs) {
        const legCache = state.marketDataCache[leg.gConId];
        const p = (legCache && legCache.last) ? legCache.last : 0;

        if (p === 0) return; // Wait for full data

        let val = p * leg.ratio;
        if (leg.action === 'SELL') val = -val;

        syntheticPrice += val;
    }

    if (!state.marketDataCache[spreadId]) state.marketDataCache[spreadId] = {};
    state.marketDataCache[spreadId].last = syntheticPrice;

    updateRowPrice(spreadId, 'last', syntheticPrice);
}

export function updateRowPrice(gid, field, val) {
    if (field !== 'last') return; // We only update UI for last
    const cellId = `last-${gid}`;
    const cell = document.getElementById(cellId);
    if (cell) {
        const pState = state.portfolioState[gid];
        const curSym = getCurrencySymbol(pState ? pState.currency : 'USD');
        cell.innerText = `${curSym}${val.toFixed(2)}`;

        cell.classList.remove('update-flash');
        void cell.offsetWidth;
        cell.classList.add('update-flash');

        if (pState) {
            pState.lastPrice = val;
            const pnl = (val - pState.avgPrice) * pState.totalQty;
            const pnlCell = document.getElementById(`pnl-${gid}`);
            if (pnlCell) {
                pnlCell.innerText = `${curSym}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                pnlCell.className = pnl >= 0 ? 'positive' : 'negative';
            }
            updateTotalStats();
        }
    }
}

export function updateTotalStats() {
    let totalPnl = 0;

    Object.values(state.portfolioState).forEach(item => {
        const currentPrice = (state.marketDataCache[item.gid] && state.marketDataCache[item.gid].last)
            ? state.marketDataCache[item.gid].last
            : item.lastPrice;
        totalPnl += (currentPrice - item.avgPrice) * item.totalQty;
    });

    const pnlEl = document.getElementById('stat-pnl');
    const pnlTrend = document.getElementById('stat-pnl-trend');

    if (pnlEl && pnlTrend && state.accountsData && state.accountsData[state.currentAccount]) {
        const equity = parseFloat(state.accountsData[state.currentAccount].NetLiquidation || 0);
        const curSym = getCurrencySymbol(state.accountsData[state.currentAccount].Currency || 'USD');

        pnlEl.textContent = `${totalPnl >= 0 ? '+' : ''}${curSym}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        pnlEl.className = `value ${totalPnl >= 0 ? 'positive' : 'negative'}`;

        const prevEquity = equity - totalPnl;
        const pnlPct = (prevEquity !== 0) ? (totalPnl / prevEquity) * 100 : 0;

        pnlTrend.innerHTML = `<i data-lucide="trending-${totalPnl >= 0 ? 'up' : 'down'}"></i> ${Math.abs(pnlPct).toFixed(2)}%`;
        pnlTrend.className = `trend ${totalPnl >= 0 ? 'positive' : 'negative'}`;
    }
}

export function renderPortfolio(contracts) {
    const tbody = document.getElementById('portfolio-body');
    if (!tbody) return;

    Object.keys(state.charts).forEach(gid => {
        try { state.charts[gid].destroy(); } catch (e) { /* ignore */ }
    });
    state.charts = {};

    let html = '';

    state.portfolioState = {};
    state.legIdToSpreadIds = {};
    state.contractsMap = {};

    contracts.forEach(c => {
        state.contractsMap[c.gConId] = c;
        if (c.symbol) state.contractsMap[c.symbol] = c;

        if (c.secType === 'BAG' && c.legs) {
            c.legs.forEach(leg => {
                if (!state.legIdToSpreadIds[leg.gConId]) state.legIdToSpreadIds[leg.gConId] = [];
                const exists = state.legIdToSpreadIds[leg.gConId].some(d => d.spreadId === c.gConId);
                if (!exists) {
                    state.legIdToSpreadIds[leg.gConId].push({
                        spreadId: c.gConId,
                        ratio: leg.ratio,
                        action: leg.action
                    });
                }
            });
        }

        if (!state.marketDataCache[c.gConId]) state.marketDataCache[c.gConId] = {};
        if (c.last) state.marketDataCache[c.gConId].last = c.last;

        const topic = `market:${c.gConId}`;
        window.dispatchEvent(new CustomEvent('ws:subscribe', { detail: topic }));

        if (c.secType === 'BAG' && c.legs) {
            c.legs.forEach(leg => {
                const legTopic = `market:${leg.gConId}`;
                window.dispatchEvent(new CustomEvent('ws:subscribe', { detail: legTopic }));

                if (leg.lastPrice) {
                    if (!state.marketDataCache[leg.gConId]) state.marketDataCache[leg.gConId] = {};
                    state.marketDataCache[leg.gConId].last = leg.lastPrice;
                }
            });
            recalculateSpreadPrice(c.gConId);
        }
    });

    const sortedContracts = contracts.map(c => {
        const accountPositions = (c.positions || []).filter(p => p.accountId === state.currentAccount);
        if (accountPositions.length === 0) return null;
        const totalQty = accountPositions.reduce((acc, p) => acc + p.qty, 0);
        return { c, accountPositions, totalQty };
    }).filter(item => item !== null).sort((a, b) => Math.abs(b.totalQty) - Math.abs(a.totalQty));

    sortedContracts.forEach(({ c, accountPositions, totalQty }) => {
        const gid = c.gConId;
        const symbol = c.symbol;
        const avgPrice = accountPositions.length > 0 ? accountPositions[0].avgPrice : 0;
        const last = c.last || 0;
        const pnl = (last - avgPrice) * totalQty;
        const isExpanded = state.expandedRows.has(gid);

        let exchangeDisplay = c.exchange || 'N/A';
        if (c.secType === 'BAG' && c.legs && c.legs.length > 0) {
            const unique = [...new Set(c.legs.map(l => l.exchange).filter(Boolean))];
            if (unique.length > 0) exchangeDisplay = unique.join('/');
        }

        const curSym = getCurrencySymbol(c.currency);
        state.portfolioState[gid] = { gid, totalQty, avgPrice, currency: c.currency || 'USD', lastPrice: last };

        html += `
            <tr class="main-row ${isExpanded ? 'active' : ''}" onclick="window.toggleRow('${gid}')">
                <td><div class="symbol-col"><span class="symbol-name">${symbol}</span></div></td>
                <td>${c.secType}</td>
                <td class="${totalQty >= 0 ? 'positive' : 'negative'}">${totalQty.toFixed(0)}</td>
                <td>${curSym}${avgPrice.toFixed(2)}</td>
                <td id="last-${gid}" class="price-cell">${curSym}${last.toFixed(2)}</td>
                <td id="pnl-${gid}" class="${pnl >= 0 ? 'positive' : 'negative'}">${curSym}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="table-actions">
                    <button class="btn-icon" title="Trade" onclick="event.stopPropagation(); window.openTradeModal('${symbol}', '${c.secType}')">
                        <i data-lucide="arrow-right-left"></i>
                    </button>
                </td>
            </tr>
        `;

        if (isExpanded) {
            const range = (state.chartStates[gid] && state.chartStates[gid].range) ? state.chartStates[gid].range : '1d';
            html += `
                <tr class="detail-row">
                    <td colspan="7">
                        <div class="expansion-content glass">
                            <div class="meta-info">
                                <div class="info-group"><label>Exchange</label><span>${exchangeDisplay}</span></div>
                                <div class="info-group"><label>Currency</label><span>${c.currency || 'USD'}</span></div>
                                <div class="info-group"><label>conID</label><span>${c.conId || '0'}</span></div>
                            </div>
                            <div class="chart-section" style="flex: 1; padding: 0 1rem;">
                                <div class="chart-controls" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 0.5rem;">
                                    <button class="btn-range ${range === '1d' ? 'active' : ''}" onclick="window.switchRange('${gid}', '1d')">1D</button>
                                    <button class="btn-range ${range === '-1w' ? 'active' : ''}" onclick="window.switchRange('${gid}', '-1w')">1W</button>
                                    <button class="btn-range ${range === '-1mo' ? 'active' : ''}" onclick="window.switchRange('${gid}', '-1mo')">1M</button>
                                    <button class="btn-range ${range === '-3mo' ? 'active' : ''}" onclick="window.switchRange('${gid}', '-3mo')">3M</button>
                                    <button class="btn-range ${range === '-1y' ? 'active' : ''}" onclick="window.switchRange('${gid}', '-1y')">1Y</button>
                                </div>
                                <div class="chart-container" id="chart-${gid}">
                                    <div class="chart-loading">Loading History...</div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
            setTimeout(() => updateChart(gid), 50);
        }
    });

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    updateTotalStats();
}

export function renderWatchlist() {
    const tbody = document.getElementById('watchlist-body');
    if (!tbody) return;

    let html = '';
    const sorted = [...state.watchlist].sort();

    sorted.forEach(symbol => {
        let data = state.contractsMap[symbol];
        if (!data) {
            const match = Object.keys(state.contractsMap).find(k => k.toUpperCase() === symbol.toUpperCase());
            if (match) data = state.contractsMap[match];
        }

        const lastPrice = (data && data.last !== undefined) ? data.last : null;
        const isBAG = (data && data.secType === 'BAG');
        const showPrice = (lastPrice !== null) && (lastPrice !== 0 || isBAG);
        let priceClass = 'neutral';

        html += `
            <tr>
                <td><span class="symbol-name">${symbol}</span></td>
                <td class="${priceClass}">${showPrice ? parseFloat(lastPrice).toFixed(2) : '-'}</td>
                <td class="table-actions">
                    <button class="btn-icon danger" title="Remove" onclick="window.removeFromWatchlist('${symbol}')">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    if (sorted.length === 0) {
        html = '<tr><td colspan="3" style="text-align:center; color: #666; padding: 1rem;">WatchList is empty</td></tr>';
    }

    tbody.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

export function handleWatchlistInput(e) {
    if (e.key === 'Enter') {
        addToWatchlist();
    }
}

export async function previewWatchlistSymbol() {
    const input = document.getElementById('new-watchlist-symbol');
    const symbol = input.value.trim().toUpperCase();
    const priceCell = document.getElementById('watchlist-preview-price');

    if (!symbol) return;

    const btn = input.nextElementSibling;
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '...';
    btn.disabled = true;
    priceCell.innerText = 'Syncing...';
    priceCell.style.color = 'var(--text-secondary)';

    try {
        const syncData = await fetchContractSync(symbol);

        if (syncData.detail) {
            priceCell.innerText = 'Error';
            priceCell.style.color = 'var(--accent-red)';
            alert(`Error: ${syncData.detail}`);
        } else if (syncData.ticks) {
            const last = syncData.ticks.last || 0;
            priceCell.innerText = parseFloat(last).toFixed(3);
            priceCell.style.color = 'var(--accent-green)';

            const mockContract = {
                gConId: syncData.gConId,
                symbol: symbol,
                localSymbol: symbol,
                last: last,
                secType: syncData.secType || 'FUT'
            };
            state.contractsMap[symbol] = mockContract;
            state.contractsMap[syncData.gConId] = mockContract;
        } else {
            priceCell.innerText = '-';
        }
    } catch (e) {
        console.error(e);
        priceCell.innerText = 'Error';
        alert('Error syncing symbol');
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }
}

export async function addToWatchlist() {
    const input = document.getElementById('new-watchlist-symbol');
    const symbol = input.value.trim().toUpperCase();
    const priceCell = document.getElementById('watchlist-preview-price');

    if (!symbol) return;

    try {
        const symbolsToSave = [...state.watchlist];
        if (!symbolsToSave.includes(symbol)) {
            symbolsToSave.push(symbol);
        }

        await saveWatchlist(symbolsToSave);
        input.value = '';
        if (priceCell) priceCell.innerText = '-';

        if (!state.watchlist.includes(symbol)) {
            state.watchlist.push(symbol);
        }
        renderWatchlist();
        window.dispatchEvent(new CustomEvent('app:refreshData'));
    } catch (e) {
        console.error(e);
        alert('Failed to save symbol');
    }
}

export async function removeFromWatchlist(symbol) {
    try {
        const index = state.watchlist.indexOf(symbol);
        if (index > -1) {
            await deleteFromWatchlist(symbol);
            state.watchlist.splice(index, 1);
            renderWatchlist();
        }
    } catch (e) {
        console.error(e);
        alert('Failed to remove symbol');
    }
}
