// src/js/main.js
import { state } from './core/state.js';
import { fetchPortfolio, fetchAccounts, fetchOrders, fetchWatchlist } from './services/api.js';
import { wsService } from './services/websocket.js';

import { renderPortfolio, renderWatchlist, updateAccountSummary, previewWatchlistSymbol, addToWatchlist, removeFromWatchlist } from './views/portfolio.js';
import { renderAccountView } from './views/account.js';
import { renderOrders, refreshOrders, handleCancel, toggleOrderRow } from './views/orders.js';
import { refreshStrategies, triggerStrategyReload, toggleStrategyRow, toggleStrategyStatus, toggleStrategyRecreate } from './views/strategies.js';
import { loadSettings, saveGuiSettings } from './views/settings.js';
import { renderAnalysisView } from './views/analysis.js';
import { openTradeModal, openModifyOrder, setOrderExactSide, handleOrderTypeChange } from './components/modals.js';
import { updateChartRealtime } from './components/charts.js';

// --- Window Exports for Inline Event Handlers ---
window.toggleRow = (gid) => {
    if (state.expandedRows.has(gid)) {
        state.expandedRows.delete(gid);
    } else {
        state.expandedRows.add(gid);
    }
    refreshData();
};

window.switchRange = (gid, range) => {
    delete state.historyCache[gid];
    if (!state.chartStates[gid]) state.chartStates[gid] = {};
    state.chartStates[gid].range = range;
    refreshData();
};

window.toggleOrderRow = toggleOrderRow;
window.cancelOrder = handleCancel;
window.modifyOrder = openModifyOrder;
window.openTradeModal = openTradeModal;
window.setOrderExactSide = setOrderExactSide;
window.handleOrderTypeChange = handleOrderTypeChange;

window.previewWatchlistSymbol = previewWatchlistSymbol;
window.addToWatchlist = addToWatchlist;
window.removeFromWatchlist = removeFromWatchlist;

window.refreshStrategies = refreshStrategies;
window.triggerStrategyReload = triggerStrategyReload;
window.toggleStrategyRow = toggleStrategyRow;
window.toggleStrategyStatus = toggleStrategyStatus;
window.toggleStrategyRecreate = toggleStrategyRecreate;
import { handleWatchlistInput } from './views/portfolio.js';
window.handleWatchlistInput = handleWatchlistInput;

window.loadSettings = loadSettings;
window.saveGuiSettings = saveGuiSettings;

window.toggleNavGroup = (headerEl) => {
    const groupLi = headerEl.parentElement;
    groupLi.classList.toggle('open');
};

// --- CustomEvent Listeners for WS Interactivity ---
window.addEventListener('ws:market', (e) => {
    const { gConId, price, tickType, timestamp } = e.detail;

    if (!state.marketDataCache[gConId]) state.marketDataCache[gConId] = {};

    let field = null;
    if (tickType === 'LAST' || tickType === 'AllLast') field = 'last';
    else if (tickType === 'BID' || tickType === 'BidPrice') field = 'bid';
    else if (tickType === 'ASK' || tickType === 'AskPrice') field = 'ask';

    if (field) {
        state.marketDataCache[gConId][field] = price;

        // Note: updateRowPrice and recalculateSpreadPrice were defined in portfolio.js
        // We dynamically import them to avoid circular dependency complexites or just rely on custom events
        // Better yet: we can just call an event
        window.dispatchEvent(new CustomEvent('app:marketTick', { detail: { gid: gConId, field, price, timestamp } }));
        updateChartRealtime(gConId, price, timestamp);
    }
});

// Since updateRowPrice and recalculateSpreadPrice need to be called on tick:
import { updateRowPrice, recalculateSpreadPrice } from './views/portfolio.js';
import { updateStrategyRowPrice } from './views/strategies.js';
window.addEventListener('app:marketTick', (e) => {
    const { gid, field, price } = e.detail;
    if (field === 'last') {
        updateRowPrice(gid, field, price);
        updateStrategyRowPrice(gid, price);
    } else {
        updateRowPrice(gid, field, price);
    }

    if (state.legIdToSpreadIds[gid]) {
        state.legIdToSpreadIds[gid].forEach(spreadDep => {
            recalculateSpreadPrice(spreadDep.spreadId);
        });
    }
});

window.addEventListener('ws:portfolio', (e) => {
    renderPortfolio(e.detail);
});

window.addEventListener('ws:orders:full', (e) => {
    state.activeOrdersMap = e.detail;
    renderOrders(state.activeOrdersMap);
});

window.addEventListener('ws:orders:delta', (e) => {
    const data = e.detail;
    if (data.orderId) {
        const oid = data.orderId;
        if (state.activeOrdersMap[oid]) {
            state.activeOrdersMap[oid] = { ...state.activeOrdersMap[oid], ...data };
        } else {
            state.activeOrdersMap[oid] = data;
        }
        renderOrders(state.activeOrdersMap);
    }
});

window.addEventListener('ws:account:full', (e) => {
    updateAccountSummary(e.detail);
});

window.addEventListener('ws:account:delta', (e) => {
    const data = e.detail;
    if (!state.accountsData) state.accountsData = {};
    for (const [accId, changes] of Object.entries(data)) {
        if (!state.accountsData[accId]) {
            state.accountsData[accId] = changes;
        } else {
            state.accountsData[accId] = { ...state.accountsData[accId], ...changes };
        }
    }
    updateAccountSummary(state.accountsData);
});

window.addEventListener('ws:send', (e) => wsService.send(e.detail));
window.addEventListener('ws:subscribe', (e) => wsService.subscribe(e.detail));
window.addEventListener('ws:unsubscribe', (e) => wsService.unsubscribe(e.detail));

window.addEventListener('app:refreshData', () => refreshData());

window.addEventListener('app:notify', (e) => {
    const { msg, type } = e.detail;
    showNotification(msg, type);
});

function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;

    const notif = document.createElement('div');
    notif.className = `notification ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    if (type === 'warning') icon = 'alert-triangle';

    notif.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(notif);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transform = 'translateY(100%)';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}

// --- Health Polling ---
import { fetchIBCoreHealth, fetchStratHealth } from './services/api.js';

function updateHealthBadge(elementId, healthData) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.remove('online', 'connecting', 'error');
    const textEl = el.querySelector('.status-text');

    if (healthData.status === 'ready') el.classList.add('online');
    else if (healthData.status === 'connecting') el.classList.add('connecting');
    else el.classList.add('error');

    // Handle account_mode Branding (for TWS connection badge)
    if (elementId === 'ib-tws-connection' && textEl) {
        const mode = healthData.account_mode || "LIVE";
        textEl.textContent = `IB ${mode}`;
        textEl.classList.remove('paper', 'live');
        textEl.classList.add(mode.toLowerCase());
    }

    el.title = healthData.details || "Unknown status";
}

let lastIbHealthStatus = 'unknown';

async function pollHealth() {
    try {
        const ibHealthPromise = fetchIBCoreHealth();
        const stratHealthPromise = fetchStratHealth();
        
        const [ibHealth, stratHealth] = await Promise.all([
            ibHealthPromise.catch(e => ({ status: 'error', details: 'Unreachable' })),
            stratHealthPromise.catch(e => ({ status: 'error', details: 'Unreachable' }))
        ]);

        // 1. Core Service Health (Is the API reachable?)
        const coreReachable = ibHealth.status !== 'error' || (ibHealth.details && ibHealth.details !== 'Unreachable');
        updateHealthBadge('ib-core-service', { 
            status: coreReachable ? 'ready' : 'error', 
            details: coreReachable ? 'IB_Core Service is running.' : 'Unreachable' 
        });

        // 2. TWS Connection Health
        updateHealthBadge('ib-tws-connection', ibHealth);

        // 3. Strat Health
        updateHealthBadge('strat-health', stratHealth);

        if (ibHealth.status === 'ready' && lastIbHealthStatus !== 'ready') {
            console.log("IB_Core is now ready. Refreshing data...");
            refreshData();
        }
        lastIbHealthStatus = ibHealth.status;

    } catch (e) {
        console.error("Health polling failed:", e);
    }
}

// --- App Core Logic ---

async function refreshData() {
    if (state.currentTab === 'strategies') {
        refreshStrategies();
        return;
    }

    try {
        // Fetch strategies as well during refresh to ensure correlation data is available
        const [portfolio, accounts, orders, wl] = await Promise.all([
            fetchPortfolio().catch(() => []),
            fetchAccounts().catch(() => ({})),
            fetchOrders().catch(() => ({})),
            fetchWatchlist().catch(() => [])
        ]);

        // Proactively refresh strategies to populate state.strategiesState for correlation
        refreshStrategies().catch(err => console.error("Initial strategy fetch failed:", err));

        state.watchlist = Array.isArray(wl) ? wl : [];

        state.contractsMap = {};
        if (portfolio && !portfolio.error) {
            portfolio.forEach(c => {
                state.contractsMap[c.gConId] = c;
                if (c.symbol) state.contractsMap[c.symbol] = c;
            });
        }

        state.activeOrdersMap = (orders && !orders.error) ? orders : {};

        updateAccountSummary(accounts && !accounts.error ? accounts : {});
        renderPortfolio(portfolio && !portfolio.error ? portfolio : []);
        renderWatchlist();
        renderOrders(orders && !orders.error ? orders : { error: orders?.error || "Failed to load orders" });

    } catch (err) {
        console.error("Refresh failed:", err);
    }
}

function initApp() {
    console.log("Initializing App via Modular Entry...");

    try {
        wsService.connect();
        pollHealth();
        setInterval(pollHealth, 5000);

        const navLinks = document.querySelectorAll('.nav-links li[data-tab]');
        navLinks.forEach(tab => {
            tab.addEventListener('click', () => {
                navLinks.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const targetId = tab.dataset.tab;
                const content = document.getElementById(targetId);
                if (content) content.classList.add('active');

                state.currentTab = targetId;

                if (state.currentTab === 'portfolio') refreshData();
                if (state.currentTab === 'orders') refreshOrders();
                if (state.currentTab === 'account') {
                    renderAccountView();
                }
                if (state.currentTab === 'strategies') refreshStrategies();
                if (state.currentTab === 'analysis') renderAnalysisView();
                if (state.currentTab === 'settings') loadSettings();
            });
        });

        // Setup Modals Initializers
        const openBtn = document.getElementById('btn-new-order');
        const refreshBtn = document.getElementById('btn-refresh-orders');
        const closeBtn = document.querySelector('.close-modal');
        const modal = document.getElementById('order-modal');
        const form = document.getElementById('order-form');

        if (openBtn) openBtn.onclick = () => openTradeModal();

        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Refreshing...';
                if (window.lucide) window.lucide.createIcons();
                try {
                    const api = await import('./services/api.js');
                    const res = await api.requestOpenOrders();
                    window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: res.status || 'Refresh Requested', type: 'info' } }));
                } catch (e) {
                    window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: 'Refresh Failed', type: 'error' } }));
                }
                setTimeout(() => {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh';
                    if (window.lucide) window.lucide.createIcons();
                }, 1500);
            };
        }
        if (closeBtn && modal) closeBtn.onclick = () => modal.style.display = 'none';
        if (modal) window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

        // Import handleOrderSubmit from modals just for this
        import('./components/modals.js').then(m => {
            if (form) form.onsubmit = m.handleOrderSubmit;
            // Bind input change
            const typeSelect = document.getElementById('order-type');
            if (typeSelect) typeSelect.addEventListener('change', m.handleOrderTypeChange);
        });

        refreshData();

    } catch (e) {
        console.error("Critical Error during Init:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
