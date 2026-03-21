// src/js/core/state.js
// Centralized State Management

export const state = {
    currentTab: 'portfolio',
    expandedRows: new Set(),
    charts: {},
    strategyCharts: {}, // Track strategy charts separately
    currentAccount: null, // Filter state
    accountsData: {}, // Store raw account data
    contractsMap: {}, // Store contracts by gConId
    historyCache: {}, // Cache for chart data
    activeOrdersMap: {}, // Cache for orders
    chartStates: {}, // Track range state per chart
    watchlist: [], // Global watchlist
    marketDataCache: {}, // Cache for latest tick data (gConId -> {last, bid, ask})
    legIdToSpreadIds: {}, // Map leg gConId -> [spread gConId]
    portfolioState: {}, // Cache for current portfolio view state (qty, avgPrice)
    strategiesState: [], // Cache for strategies data
    expandedOrderRows: new Set(), // Track expanded active orders
    wsSubscriptions: new Set() // Track active market subscriptions to prevent infinite loops
};
