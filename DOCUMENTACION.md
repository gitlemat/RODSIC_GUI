# Documentación Técnica - RODSIC GUI

## 1. Visión General
**RODSIC GUI** es la interfaz visual del sistema. Diseñada bajo la filosofía de "Zero-Framework", utiliza **Vanilla JS** moderno para maximizar el rendimiento y minimizar la latencia en la visualización de datos financieros.

### Stack Tecnológico
- **Frontend**: HTML5, CSS3, JavaScript (ES6+).
- **Backend (Proxy/BFF)**: Python con FastAPI.
- **Gráficos**: ApexCharts para histórico de P&L.
- **Protocolo**: WebSockets para streaming de datos + REST API para comandos.

---

## 2. Arquitectura de Proxy (`main.py`)

La aplicación FastAPI en `main.py` no contiene lógica de negocio de trading, sino que actúa como un **Proxy Inverso** o **Backend-For-Frontend (BFF)**:

1.  **Servidor de Archivos**: Entrega los assets estáticos (`index.html`, `app.js`, `styles.css`).
2.  **Proxy de WebSockets**:
    - Se conecta al WebSocket de `IB_Core` (`ws://localhost:8000/restAPI/ws`) como un cliente más.
    - Recibe todos los mensajes de Core.
    - **Broadcast**: Retransmite cada mensaje recibido a *todos* los navegadores conectados a la GUI.
    - *Beneficio*: Desacopla la seguridad y la gestión de conexiones de IB_Core.
3.  **Proxy REST**:
    - Los endpoints como `/api/Orders` o `/api/strategies` reciben la petición del navegador y la reenvían internamente a `IB_Core` (vía `IB_CORE_URL/restAPI/...`) o a `RODSIC_Strat` (vía `RODSIC_STRAT_URL/restAPI/...`).
    - Agrega capas de validación y centraliza las llamadas transversales.
4.  **Consulta a InfluxDB**:
    - Única excepción lógica: La GUI consulta directamente a InfluxDB para los gráficos de histórico (`/api/account_history`), ya que es una consulta de lectura pesada que no necesita pasar por el motor de trading.

---

## 3. Lógica Frontend (`app.js`)

El corazón de la interfaz reside en `app.js`.

### 3.1. Servicio de WebSocket (`wsService`)
Objeto singleton encargado de la comunicación.
- **Conexión Resiliente**: Implementa reconexión automática si se pierde el enlace con `main.py`.
- **Suscripciones**: Al conectar, solicita explícitamente los tópicos necesarios:
  - `orders`: Estado de órdenes.
  - `portfolio`: Posiciones y bags.
  - `account`: Métricas financieras.
- **Enrutamiento**: El método `handleMessage(msg)` despacha los datos según el `topic` y el `type` (`update` vs `delta`).

### 3.2. Gestión de Estado Local
Para evitar `reflows` del DOM innecesarios, la app mantiene un "Store" local:
- `accountsData`: Cache de métricas de cuenta (NetLiq, P&L).
- `activeOrdersMap`: Diccionario de órdenes vivas.
- `marketDataCache`: Últimos precios recibidos (para pintar celdas).
- `expandedRows`: Set de IDs de contratos desplegados en la tabla (para suscripciones dinámicas).

### 3.3. Ciclo de Vida de los Datos
1.  **Recepción**: Llega mensaje por WS (ej. cambio de precio en `ES`).
2.  **Cache**: Se actualiza `marketDataCache`.
3.  **DOM Patching**: Se busca el elemento HTML específico por ID (ej. `#price-row-12345`) y se actualiza solo el texto y el color (flash verde/rojo). **No se repinta la tabla entera**.

---

## 4. Flujo de Operaciones

### 4.1. Visualización de Precios (Suscripción Dinámica)
Para no saturar la red, la GUI solo suscribe precios de lo que el usuario quiere ver en detalle:
1.  Usuario hace clic en una fila del portfolio/watchlist (`toggleRow`).
2.  `wsService` envía suscripción a `market:{gConId}` a través del proxy hacia `IB_Core`.
3.  `IB_Core` empieza a emitir ticks para ese contrato.
4.  La GUI renderiza y actualiza el mini-gráfico en tiempo real.
5.  Al cerrar la fila, se envía `unsubscribe` para detener el flujo.

### 4.2. Envío de Órdenes
1.  Usuario rellena el formulario de orden y hace clic en "BUY".
2.  `app.js` hace POST a `/api/Orders/PlaceOrder`.
3.  `main.py` recibe el POST y lo reenvía al backend de `IB_Core` en `/restAPI/Orders/PlaceOrder`.
4.  `IB_Core` coloca la orden en IB y emite evento WS `orders`.
5.  La GUI recibe el evento WS y actualiza la tabla "Active Orders" instantáneamente.

---

## 5. Configuración

El archivo `.env` persistido en la raíz define el entorno operativo de la GUI:

**Conectividad InfluxDB** (Para consultar históricos PnL de cuentas/estrategias directamente):
- `INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`: Credenciales TSDB.
- `INFLUXDB_BUCKET_*`: (`_PRICES`, `_PRICES_1H`, `_DATA_LIVE`, `_DATA_PAPER`) Define los depósitos de datos brutos.

**Microservicios Backend**:
- `RODSIC_STRAT_URL`: URL base del gestor de estrategias (ej. `http://localhost:8002`).
- `IB_CORE_URL`: URL base del conector principal de mercado y órdenes (ej. `http://localhost:8000`).

**Sistema**:
- `WEB_PORT`: Puerto HTTP donde levanta la GUI web (ej. `8001`).

---

*Última Actualización: 2026-02-21*
