// src/js/utils/formatters.js

/**
 * Returns the correct currency symbol based on the currency string.
 * @param {string} currency - Intended currency (e.g., 'USD', 'EUR')
 * @returns {string} The currency symbol
 */
export function getCurrencySymbol(currency) {
    if (!currency) return '$';
    switch (currency.toUpperCase()) {
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'JPY': return '¥';
        case 'AUD': return 'A$';
        case 'CAD': return 'C$';
        default: return '$';
    }
}

/**
 * Formats a value as a US Dollar price string.
 * @param {number|string} val - The numeric value to format
 * @returns {string} The formatted price
 */
export function formatPrice(val) {
    if (val === undefined || val === null || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

/**
 * Formats a value with fixed decimals.
 * @param {number|string} val - The numeric value to format
 * @param {number} decimals - Number of decimal places (default 2)
 * @returns {string} The formatted string
 */
export function formatDecimal(val, decimals = 2) {
    if (val === undefined || val === null || isNaN(val) || val === '') return '-';
    return parseFloat(val).toFixed(decimals);
}
