// src/js/services/websocket.js
// Handles raw WS connection and broadcasts events to the DOM

const WS_URL = `ws://${window.location.host}/ws`;

export const wsService = {
    socket: null,
    subscriptions: new Set(),
    reconnecting: false,

    connect() {
        this.socket = new WebSocket(WS_URL);

        this.socket.onopen = () => {
            console.log("WS Connected");

            if (this.reconnecting) {
                console.log("Session restored. Reloading data.");
                window.dispatchEvent(new CustomEvent('ws:reconnect'));
            }
            this.reconnecting = false;

            this.resubscribe();
            // Subscribe to system/global topics
            this.send({ action: "subscribe", topic: "orders" });
            this.send({ action: "subscribe", topic: "portfolio" });
            this.send({ action: "subscribe", topic: "account" });
        };

        this.socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        this.socket.onclose = () => {
            console.log("WS Closed. Reconnecting...");
            this.reconnecting = true;
            setTimeout(() => this.connect(), 3000);
        };
    },

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log(`[WS] Sending action: ${data.action} on topic: ${data.topic || 'n/a'}`);
            this.socket.send(JSON.stringify(data));
        } else {
            console.warn("[WS] Cannot send - socket not open", data);
        }
    },

    subscribe(topic) {
        if (!this.subscriptions.has(topic)) {
            console.log(`[WS] Subscribing to: ${topic}`);
            this.subscriptions.add(topic);
            this.send({ action: "subscribe", topic });
        }
    },

    unsubscribe(topic) {
        this.subscriptions.delete(topic);
        this.send({ action: "unsubscribe", topic });
    },

    resubscribe() {
        this.subscriptions.forEach(topic => this.send({ action: "subscribe", topic }));
    },

    handleMessage(msg) {
        // Broadcast incoming JS data as CustomEvents so Views can listen independently
        if (msg.type === 'update') {
            const { topic, data } = msg;

            if (topic.startsWith('market:')) {
                window.dispatchEvent(new CustomEvent('ws:market', { detail: data }));
            } else if (topic === 'portfolio') {
                window.dispatchEvent(new CustomEvent('ws:portfolio', { detail: data }));
            } else if (topic === 'orders') {
                window.dispatchEvent(new CustomEvent('ws:orders:full', { detail: data }));
            } else if (topic === 'account') {
                window.dispatchEvent(new CustomEvent('ws:account:full', { detail: data }));
            }
            // Handle delta updates
        } else if (msg.type === 'delta') {
            const { topic, data } = msg;

            if (topic === 'orders') {
                window.dispatchEvent(new CustomEvent('ws:orders:delta', { detail: data }));
            } else if (topic === 'account') {
                window.dispatchEvent(new CustomEvent('ws:account:delta', { detail: data }));
            }
        }
    }
};
