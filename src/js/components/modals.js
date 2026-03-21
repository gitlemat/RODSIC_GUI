// src/js/components/modals.js
import { state } from '../core/state.js';
import { placeOrder } from '../services/api.js';

export function setOrderExactSide(side) {
    const buyBtn = document.querySelector('.side-btn.buy');
    const sellBtn = document.querySelector('.side-btn.sell');
    const actionInput = document.getElementById('order-action');
    const submitBtn = document.querySelector('.btn-submit.modern');

    if (actionInput) actionInput.value = side;

    if (buyBtn) buyBtn.classList.remove('active');
    if (sellBtn) sellBtn.classList.remove('active');

    if (side === 'BUY') {
        if (buyBtn) buyBtn.classList.add('active');
        if (submitBtn) {
            submitBtn.style.background = 'rgb(0, 117, 96)';
            submitBtn.innerText = 'Submit BUY Order';
        }
    } else {
        if (sellBtn) sellBtn.classList.add('active');
        if (submitBtn) {
            submitBtn.style.background = 'var(--accent-red)';
            submitBtn.innerText = 'Submit SELL Order';
        }
    }
}

export function handleOrderTypeChange() {
    const type = document.getElementById('order-type').value;
    const lmtGroup = document.getElementById('group-lmt-price');
    const auxGroup = document.getElementById('group-aux-price');
    const auxLabel = document.getElementById('order-aux-label');

    lmtGroup.style.display = 'flex';
    auxGroup.style.display = 'none';

    switch (type) {
        case 'MKT':
            lmtGroup.style.display = 'none';
            break;
        case 'LMT':
            break;
        case 'STP':
        case 'STP LMT':
            auxGroup.style.display = 'grid';
            if (auxLabel) auxLabel.innerText = 'Stop Price';
            if (type === 'STP') lmtGroup.style.display = 'none';
            break;
        case 'TRAIL':
            auxGroup.style.display = 'grid';
            if (auxLabel) auxLabel.innerText = 'Trailing Amt';
            break;
    }
}

export function openTradeModal(symbol, secType = 'FUT', orderId = null) {
    const modal = document.getElementById('order-modal');
    const form = document.getElementById('order-form');
    const title = modal.querySelector('.trade-header h2');

    form.reset();
    form.dataset.orderId = '';

    const symbolInput = document.getElementById('order-symbol');
    const secTypeInput = document.getElementById('order-sec-type');

    const buyBtn = form.querySelector('.side-btn.buy');
    const sellBtn = form.querySelector('.side-btn.sell');
    if (buyBtn) { buyBtn.style.pointerEvents = 'auto'; buyBtn.style.opacity = '1'; }
    if (sellBtn) { sellBtn.style.pointerEvents = 'auto'; sellBtn.style.opacity = '1'; }

    if (secTypeInput) secTypeInput.value = secType;

    if (symbol) {
        symbolInput.value = symbol;
        symbolInput.readOnly = true;
        if (title) title.innerText = 'Create Order';
    } else {
        symbolInput.readOnly = false;
        if (title) title.innerText = 'Create Order';
    }

    // Set defaults
    if (document.getElementById('order-action')) document.getElementById('order-action').value = 'BUY';
    if (document.getElementById('order-qty')) document.getElementById('order-qty').value = 1;
    if (document.getElementById('order-type')) document.getElementById('order-type').value = 'LMT';
    if (document.getElementById('order-tif')) document.getElementById('order-tif').value = 'DAY';

    setOrderExactSide('BUY');
    handleOrderTypeChange();

    modal.style.display = 'flex';
}

export function openModifyOrder(oid) {
    const order = state.activeOrdersMap[oid];
    if (!order) {
        console.error("Order not found in cache:", oid);
        return;
    }

    const modal = document.getElementById('order-modal');
    const form = document.getElementById('order-form');

    form.dataset.orderId = oid;

    const symbolInput = form.querySelector('input[type="text"]');
    if (symbolInput) {
        symbolInput.value = order.symbol;
        symbolInput.readOnly = true;
    }

    const qtyInput = form.querySelector('input[type="number"]');
    if (qtyInput) qtyInput.value = order.totalQuantity;

    const actionSelect = document.getElementById('order-action');
    if (actionSelect) actionSelect.value = (order.action || 'BUY').toUpperCase();

    const buyBtn = form.querySelector('.side-btn.buy');
    const sellBtn = form.querySelector('.side-btn.sell');
    if (buyBtn) { buyBtn.style.pointerEvents = 'none'; buyBtn.style.opacity = '0.5'; }
    if (sellBtn) { sellBtn.style.pointerEvents = 'none'; sellBtn.style.opacity = '0.5'; }

    const typeSelect = document.getElementById('order-type');
    if (typeSelect) typeSelect.value = order.orderType || 'LMT';

    const priceInputs = form.querySelectorAll('input[type="number"]');
    if (priceInputs.length > 1) {
        priceInputs[1].value = order.lmtPrice || '';
    }

    const tifSelect = document.getElementById('order-tif');
    if (tifSelect) tifSelect.value = order.tif || 'DAY';

    const title = modal.querySelector('.trade-header h2');
    if (title) title.textContent = "Modify Order " + oid;

    modal.style.display = 'flex';
}

export async function handleOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;

    const orderId = form.dataset.orderId ? parseInt(form.dataset.orderId) : undefined;
    const lmtPriceFn = parseFloat(document.getElementById('order-lmt-price').value);
    const auxPriceFn = parseFloat(document.getElementById('order-aux-price').value);

    const orderData = {
        symbol: document.getElementById('order-symbol').value.toUpperCase(),
        secType: document.getElementById('order-sec-type').value || 'FUT',
        action: document.getElementById('order-action').value,
        qty: parseFloat(document.getElementById('order-qty').value),
        oType: document.getElementById('order-type').value,
        tif: document.getElementById('order-tif').value,
        LmtPrice: !isNaN(lmtPriceFn) ? lmtPriceFn : null,
        auxPrice: !isNaN(auxPriceFn) ? auxPriceFn : null,
        orderId: orderId,
        accountId: state.currentAccount !== 'ALL' ? state.currentAccount : undefined
    };

    try {
        const res = await placeOrder(orderData);
        if (res.status === 'Order Placed') {
            window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: orderData.orderId ? "Order Modified Successfully" : "Order Placed Successfully", type: "success" } }));
            document.getElementById('order-modal').style.display = 'none';
            window.dispatchEvent(new CustomEvent('app:refreshData'));
        } else {
            window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Order Failed: " + JSON.stringify(res), type: "error" } }));
        }
    } catch (err) {
        console.error(err);
        window.dispatchEvent(new CustomEvent('app:notify', { detail: { msg: "Server Error", type: "error" } }));
    }
}
