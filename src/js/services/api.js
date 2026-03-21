// src/js/services/api.js
const API_BASE = '/api';

export async function fetchPortfolio() {
    const res = await fetch(`${API_BASE}/portfolio`);
    return res.json();
}

export async function fetchAccounts() {
    const res = await fetch(`${API_BASE}/accounts`);
    return res.json();
}

export async function fetchIBCoreHealth() {
    try {
        const res = await fetch(`${API_BASE}/health/ib_core`);
        return res.json();
    } catch (e) {
        return { status: "error", is_ready: false, details: "GUI cannot reach backend." };
    }
}

export async function fetchStratHealth() {
    try {
        const res = await fetch(`${API_BASE}/health/strat`);
        return res.json();
    } catch (e) {
        return { status: "error", is_ready: false, details: "GUI cannot reach backend." };
    }
}

export async function fetchOrders() {
    const res = await fetch(`${API_BASE}/orders`);
    return res.json();
}

export async function fetchWatchlist() {
    const res = await fetch(`${API_BASE}/watchlist`);
    return res.json();
}

export async function fetchStrategyConfig(stratName) {
    const res = await fetch(`${API_BASE}/strategies/${stratName}/config`);
    return res.json();
}

export async function toggleStrategyRecreateServer(stratName, symbol, autoRecreate) {
    const payload = { auto_recreate: autoRecreate };
    const res = await fetch(`${API_BASE}/strategies/${encodeURIComponent(stratName)}/${encodeURIComponent(symbol)}/toggle_recreate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function toggleStrategyAutoFixServer(stratName, symbol, autoFix) {
    const payload = { auto_fix: autoFix };
    const res = await fetch(`${API_BASE}/strategies/${encodeURIComponent(stratName)}/${encodeURIComponent(symbol)}/toggle_auto_fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function triggerManualFixServer(stratName, symbol, lid) {
    const res = await fetch(`${API_BASE}/strategies/${encodeURIComponent(stratName)}/${encodeURIComponent(symbol)}/levels/${encodeURIComponent(lid)}/fix`, {
        method: 'POST'
    });
    return res.json();
}

export async function assumeOrderExecutedServer(stratName, symbol, lid, orderType) {
    const payload = { order_type: orderType };
    const res = await fetch(`${API_BASE}/strategies/${encodeURIComponent(stratName)}/${encodeURIComponent(symbol)}/levels/${encodeURIComponent(lid)}/assume_executed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function fetchStrategies() {
    const res = await fetch(`${API_BASE}/strategies`);
    return res.json();
}

export async function reloadStrategiesServer() {
    const res = await fetch(`${API_BASE}/strategies/reload`, {
        method: 'POST'
    });
    return res.json();
}

export async function fetchHistory(symbol, exchange, secType, timeframe) {
    const res = await fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, exchange, secType, timeframe })
    });
    return res.json();
}

export async function fetchAccountHistory(accountId, range) {
    const res = await fetch(`${API_BASE}/account_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, range })
    });
    return res.json();
}

export async function placeOrder(orderPayload) {
    const res = await fetch(`${API_BASE}/orders/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
    });
    return res.json();
}

export async function cancelOrder(orderId) {
    const res = await fetch(`${API_BASE}/orders/cancel/${orderId}`, { method: 'DELETE' });
    return res.json();
}

export async function requestOpenOrders() {
    const res = await fetch(`${API_BASE}/orders/refresh`, { method: 'POST' });
    return res.json();
}

export async function toggleStrategy(stratName, symbol, reqPayload) {
    const res = await fetch(`${API_BASE}/strategies/${encodeURIComponent(stratName)}/${encodeURIComponent(symbol)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload)
    });
    return res.json();
}

export async function fetchGuiConfig() {
    const res = await fetch(`${API_BASE}/config/gui`);
    return res.json();
}

export async function fetchCoreConfig() {
    const res = await fetch(`${API_BASE}/config/core`);
    return res.json();
}

export async function fetchStratConfig() {
    const res = await fetch(`${API_BASE}/config/strat`);
    return res.json();
}

export async function saveGuiConfig(payload) {
    const res = await fetch(`${API_BASE}/config/gui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.json();
}

export async function saveWatchlist(symbols) {
    const res = await fetch(`${API_BASE}/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(symbols)
    });
    return res.json();
}

export async function deleteFromWatchlist(symbol) {
    const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(symbol)}`, {
        method: 'DELETE'
    });
    return res.json();
}

export async function fetchContractSync(symbol) {
    const res = await fetch(`${API_BASE}/contract/sync/${encodeURIComponent(symbol)}`);
    return res.json();
}
