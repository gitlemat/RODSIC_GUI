import os
import requests
import asyncio
import urllib.parse
import requests
import asyncio
import json
import websockets
from datetime import datetime
import pytz
from pathlib import Path
import pandas as pd
from influxdb_client import InfluxDBClient
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect, Body
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Set
from logger import LoggerSetup

# Load Env
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR.parent / '.env'
load_dotenv(ENV_PATH)

logger = LoggerSetup.get_logger("RODSIC_GUI")

# Influx Config
INFLUX_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUXDB_TOKEN", "")
INFLUX_ORG = os.getenv("INFLUXDB_ORG", "rodsic.com")
BUCKET_PRICES = os.getenv("INFLUXDB_BUCKET_PRICES", "ib_prices")
BUCKET_PRICES_1H = os.getenv("INFLUXDB_BUCKET_PRICES_1H", "ib_prices_1h")
# BUCKET_DATA removed (using 'ib_data_lab' as default fallback)
BUCKET_DATA_LIVE = os.getenv("INFLUXDB_BUCKET_DATA_LIVE", "ib_data_live")
BUCKET_DATA_PAPER = os.getenv("INFLUXDB_BUCKET_DATA_PAPER", "ib_data_paper")

def get_bucket_for_account(account_id: str) -> str:
    """
    Selects the correct InfluxDB bucket based on the account ID.
    Paper accounts typically start with 'DU' (e.g. DU12345).
    Live accounts typically start with 'U' (e.g. U12345).
    """
    if not account_id:
        return "ib_data_lab"
        
    if account_id.startswith("DU"):
        return BUCKET_DATA_PAPER
    else:
        return BUCKET_DATA_LIVE

app = FastAPI(title="RODSIC Web Terminal")

# Configuration for IB_Core connection
IB_CORE_URL = os.getenv("IB_CORE_URL", "http://localhost:8000")
IB_CORE_REST = f"{IB_CORE_URL}/restAPI"
IB_CORE_WS = f"{IB_CORE_URL.replace('http', 'ws')}/restAPI/ws"
# Configuration for RODSIC_Strat
RODSIC_STRAT_URL = os.getenv("RODSIC_STRAT_URL", "http://localhost:8002")

# Proxy Connection Manager
class ProxyManager:
    def __init__(self):
        self.active_clients: Set[WebSocket] = set()
        self.core_connection = None
        self.lock = asyncio.Lock()

    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_clients.add(websocket)
        
        # Ensure we are connected to Core
        if not self.core_connection:
            asyncio.create_task(self.maintain_core_connection())

    def disconnect_client(self, websocket: WebSocket):
        self.active_clients.remove(websocket)

    async def maintain_core_connection(self):
        while True:
            try:
                print(f"Connecting to IB_Core WS at {IB_CORE_WS}...")
                async with websockets.connect(IB_CORE_WS) as ws:
                    self.core_connection = ws
                    print("Connected to IB_Core.")
                    
                    # Relay loop: Core -> Clients
                    async for message in ws:
                        # Log incoming message summary
                        try:
                            msg_json = json.loads(message)
                            topic = msg_json.get('topic', 'unknown')
                            msg_type = msg_json.get('type', 'unknown')
                            if not topic.startswith('market:'):
                                logger.info(f"Sending WS update to GUI clients for topic '{topic}' (type: {msg_type})")
                        except Exception:
                            pass

                        # Broadcast to all connected clients
                        dead_clients = set()
                        for client in self.active_clients:
                            try:
                                await client.send_text(message)
                            except Exception:
                                dead_clients.add(client)
                        
                        for dc in dead_clients:
                            self.active_clients.discard(dc)
                            
            except Exception as e:
                print(f"IB_Core WS Error: {e}")
                self.core_connection = None
                await asyncio.sleep(5) # Retry delay

    async def send_to_core(self, message: str):
        if self.core_connection:
            try:
                await self.core_connection.send(message)
                logger.info(f"[WS Proxy] Sent to Core: {message}")
            except Exception as e:
                print(f"Failed to send to Core: {e}")

proxy = ProxyManager()

# --- Static File Serving ---
# We serve index.html at root
@app.get("/", response_class=HTMLResponse)
async def get_index():
    return FileResponse(BASE_DIR / "index.html")

# Serve Assets
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")
app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")

# Serve styles and scripts from the root directory for simplicity in this structure
@app.get("/{filename}")
async def get_static(filename: str):
    file_path = BASE_DIR / filename
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    raise HTTPException(status_code=404)

# --- API Proxy Endpoints ---
# These endpoints pass requests through to the backend services

@app.get("/api/health/ib_core")
async def get_health_ib_core():
    try:
        res = await asyncio.to_thread(requests.get, f"{IB_CORE_REST}/System/Health", timeout=2)
        if res.status_code == 200:
            return res.json()
    except Exception:
        pass
    return {"status": "error", "is_ready": False, "details": "Unreachable"}

@app.get("/api/health/strat")
async def get_health_strat():
    try:
        res = await asyncio.to_thread(requests.get, f"{RODSIC_STRAT_URL}/restAPI/System/Health", timeout=2)
        if res.status_code == 200:
            return res.json()
    except Exception:
        pass
    return {"status": "error", "is_ready": False, "details": "Unreachable"}

@app.websocket("/ws")
async def websocket_proxy(websocket: WebSocket):
    await proxy.connect_client(websocket)
    try:
        while True:
            # Client -> Proxy -> Core
            data = await websocket.receive_text()
            logger.debug(f"[WS Proxy] Client -> Core: {data}")
            await proxy.send_to_core(data)
    except WebSocketDisconnect:
        proxy.disconnect_client(websocket)
    except Exception as e:
        print(f"WS Proxy Error: {e}")
        proxy.disconnect_client(websocket)

# --- Historical Data & Synthetic Pricing ---
class LegParam(BaseModel):
    conId: int
    ratio: int
    action: str # BUY/SELL
    exchange: str = "SMART" # Optional
    symbol: Optional[str] = None # Help map to gConId

class HistoryRequest(BaseModel):
    gConId: str
    start: Optional[str] = "-1h" # Relative or absolute
    legs: Optional[List[LegParam]] = None

@app.post("/api/history")
async def get_history(req: HistoryRequest = Body(...)):
    client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
    query_api = client.query_api()
    
    logger.info(f"[History] Request: gConId={req.gConId}, Start={req.start}, Legs={len(req.legs) if req.legs else 0}")

    range_start = req.start if req.start else "-4h"
    is_smart_1d = (range_start == '1d')

    if is_smart_1d:
        # Smart 1D: Look back 4 days to find latest single day data at high resolution
        range_start = "-4d"
    
    # Bucket Selection Logic
    use_ohlc = False
    bucket = BUCKET_PRICES
    measurement = "precios"
    
    # Use 1H OHLC bucket only for long ranges (Weeks/Months/Years)
    # Exclude strict '1d' request or '-4d' if it was set by is_smart_1d
    if (any(u in range_start for u in ['w', 'mo', 'y']) or 
       ('d' in range_start and range_start != '-1d' and not is_smart_1d)):
        bucket = BUCKET_PRICES_1H
        use_ohlc = True
    
    price_col = "close" if use_ohlc else "LAST"
    
    logger.info(f"[History] Config: Bucket={bucket}, Measurement={measurement}, OHLC={use_ohlc}, Range={range_start}")

    # Helper to fetch single DF
    def fetch_df(cid_tag_value, tag_key="symbol"):
        
        safe_tag_val = str(cid_tag_value).replace('"', '\\"')
        
        if use_ohlc:
            fields_clause = 'r["_field"] == "open" or r["_field"] == "high" or r["_field"] == "low" or r["_field"] == "close"'
            keep_cols = '["_time", "open", "high", "low", "close"]'
        else:
            fields_clause = 'r["_field"] == "LAST"'
            keep_cols = '["_time", "LAST"]'
            
        query = f'''
        from(bucket: "{bucket}")
          |> range(start: {range_start})
          |> filter(fn: (r) => r["_measurement"] == "{measurement}")
          |> filter(fn: (r) => r["{tag_key}"] == "{safe_tag_val}")
          |> filter(fn: (r) => {fields_clause})
          |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> keep(columns: {keep_cols})
          |> sort(columns: ["_time"], desc: false)
        '''
        
        try:
            logger.info(f"[History] Executing Query: Bucket={bucket}, Tag={tag_key}={cid_tag_value}")
            logger.debug(f"[History] Query Body:\n{query.strip()}")
            df = query_api.query_data_frame(query)
            if isinstance(df, list): 
                df = pd.concat(df) if df else pd.DataFrame()
            if not df.empty:
                df['_time'] = pd.to_datetime(df['_time'])
                df.set_index('_time', inplace=True)
                logger.info(f"[History] Success: {len(df)} rows for {cid_tag_value}")
            else:
                logger.warning(f"[History] Empty Result for {cid_tag_value}")
            return df
        except Exception as e:
            logger.error(f"[History] Influx Query Failed for {cid_tag_value}: {e}", exc_info=True)
            return pd.DataFrame()

    try:
        if not req.legs:
            # Single Symbol
            df = fetch_df(req.gConId, "symbol")
            
            if df.empty:
                logger.warning(f"[History] No data found for single symbol {req.gConId}")
                return []
                
            df = df.sort_index()
            
            if is_smart_1d and not df.empty:
                last_ts = df.index[-1]
                target_date = last_ts.normalize()
                df = df[df.index >= target_date]
            
            # Filter: Weekends & Trading Hours (15-20 CET)
            if not df.empty:
                if df.index.tz is None: df.index = df.index.tz_localize('UTC')
                try:
                    tz_cet = pytz.timezone('Europe/Madrid')
                    idx_cet = df.index.tz_convert(tz_cet)
                    # Relaxed filter: Only exclude weekends. Show all available hours.
                    mask = (idx_cet.dayofweek < 5)
                    df = df[mask]
                except Exception as e:
                    logger.error(f"Filter Error: {e}")
            
            result = []
            for ts, row in df.iterrows():
                t_ms = int(ts.timestamp() * 1000)
                if use_ohlc:
                    result.append([
                        t_ms, 
                        row.get('open', 0), 
                        row.get('high', 0), 
                        row.get('low', 0), 
                        row.get('close', 0)
                    ])
                else:
                    val = row[price_col] if pd.notnull(row.get(price_col)) else 0
                    result.append([t_ms, val])
            return result

        else:
            # Synthetic Calculation (BAGs)
            combined_df = None
            resample_freq = '1h' if use_ohlc else '1min'
            cols = ['open', 'high', 'low', 'close'] if use_ohlc else [price_col]
            
            for leg in req.legs:
                target_id = leg.symbol if leg.symbol else str(leg.conId)
                ldf = fetch_df(target_id, "symbol")
                
                if ldf.empty: 
                    return []
                
                # Resample to align timestamps
                ldf = ldf.resample(resample_freq).last() 
                


                sign = 1 if leg.action == "BUY" else -1
                ratio = leg.ratio
                
                # Apply ratio/sign
                for c in cols:
                    if c in ldf.columns:
                        ldf[c] = ldf[c] * ratio * sign


                
                # Filter strictly useful columns locally
                available = [c for c in cols if c in ldf.columns]
                if not available: return [] 
                ldf = ldf[available]


                
                if combined_df is None:
                    combined_df = ldf
                else:
                    # Add to running total. Missing intersections become NaN (missing data in one leg)
                    combined_df = combined_df + ldf


            
            if combined_df is None or combined_df.empty:
                return []
                
            # Strict mode: Drop rows where any leg was missing
            combined_df.dropna(inplace=True)
            

            
            if is_smart_1d and not combined_df.empty:
                target_date = combined_df.index[-1].normalize()
                combined_df = combined_df[combined_df.index >= target_date]
            
            # Filter: Weekends & Trading Hours
            if not combined_df.empty:
                if combined_df.index.tz is None: combined_df.index = combined_df.index.tz_localize('UTC')
                try:
                    tz_cet = pytz.timezone('Europe/Madrid')
                    idx_cet = combined_df.index.tz_convert(tz_cet)
                    # Relaxed filter: Only exclude weekends. Show all available hours.
                    mask = (idx_cet.dayofweek < 5)
                    combined_df = combined_df[mask]
                except Exception as e:
                    logger.error(f"Filter Error: {e}")
            
            result = []
            for ts, row in combined_df.iterrows():
                t_ms = int(ts.timestamp() * 1000)
                if use_ohlc:
                    result.append([
                        t_ms, 
                        row.get('open', 0), 
                        row.get('high', 0), 
                        row.get('low', 0), 
                        row.get('close', 0)
                    ])
                else:
                    val = row.get(price_col, 0)
                    result.append([t_ms, val])
                    
            return result
            
    except Exception as e:
        logger.error(f"History Endpoint Error: {e}", exc_info=True)
        return []
    finally:
        client.close()

@app.get("/api/portfolio")
async def get_portfolio():
    try:
        response = requests.get(f"{IB_CORE_REST}/Contract/ListAllUnique")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/accounts")
async def get_accounts():
    try:
        response = requests.get(f"{IB_CORE_REST}/Account/ALL")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

class AccountHistoryRequest(BaseModel):
    accountId: str
    range: Optional[str] = "-1y"

@app.post("/api/account_history")
async def get_account_history(req: AccountHistoryRequest = Body(...)):
    client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
    query_api = client.query_api()
    
    try:
        bucket = get_bucket_for_account(req.accountId)
        logger.info(f"Fetching account history for {req.accountId} from bucket: {bucket}")
        measurement = "account"
        range_val = req.range if req.range else "-1y"
        
        # Query NetLiquidation
        query = f'''
        from(bucket: "{bucket}")
          |> range(start: {range_val})
          |> filter(fn: (r) => r["_measurement"] == "{measurement}")
          |> filter(fn: (r) => r["accountId"] == "{req.accountId}")
          |> filter(fn: (r) => r["_field"] == "NetLiquidation")
          |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
          |> keep(columns: ["_time", "NetLiquidation"])
          |> sort(columns: ["_time"])
        '''
        
        df = query_api.query_data_frame(query)
        
        if isinstance(df, list):
            df = pd.concat(df) if df else pd.DataFrame()
            
        if df.empty:
            return []
            
        # Format for ApexCharts [timestamp_ms, value]
        result = []
        for _, row in df.iterrows():
            ts = pd.to_datetime(row['_time'])
            t_ms = int(ts.timestamp() * 1000)
            val = float(row['NetLiquidation'])
            result.append([t_ms, val])
            
        return result
        
    except Exception as e:
        print(f"Account History Error: {e}")
        return []
    finally:
        client.close()

@app.get("/api/orders")
async def get_orders():
    try:
        response = requests.get(f"{IB_CORE_REST}/Orders/ListAll")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/orders/refresh")
async def refresh_orders():
    try:
        response = requests.post(f"{IB_CORE_REST}/Orders/RequestOpenOrders")
        return response.json()
    except Exception as e:
        return {"error": str(e)}


class OrderBody(BaseModel):
    symbol: str
    action: str
    qty: float
    oType: str
    LmtPrice: Optional[float] = None

@app.post("/api/orders/place")
async def place_order(order: OrderBody):
    try:
        response = requests.post(f"{IB_CORE_REST}/Orders/PlaceOrder", json=order.dict())
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/watchlist")
async def get_watchlist():
    try:
        response = requests.get(f"{IB_CORE_REST}/Contract/WatchList")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/watchlist")
async def add_watchlist(symbols: List[str]):
    try:
        response = requests.post(f"{IB_CORE_REST}/Contract/WatchList", json=symbols)
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/watchlist/{symbol}")
async def delete_watchlist(symbol: str):
    try:
        response = requests.delete(f"{IB_CORE_REST}/Contract/WatchList/{symbol}")
        # Return status code too?
        if response.status_code == 200:
            return response.json()
        else:
             return {"error": response.text}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/contract/sync/{symbol:path}")
async def sync_contract(symbol: str):
    try:
        encoded_symbol = urllib.parse.quote(symbol, safe='')
        response = requests.get(f"{IB_CORE_REST}/Contract/Sync/{encoded_symbol}")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/strategies")
async def get_strategies_proxy():
    try:
        response = requests.get(f"{RODSIC_STRAT_URL}/restAPI/strategies")
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Strategy Service returned {response.status_code}"}
    except Exception as e:
        return {"error": f"Strategy Service unreachable: {e}"}

@app.post("/api/strategies/reload")
async def reload_strategies_proxy():
    try:
        response = requests.post(f"{RODSIC_STRAT_URL}/restAPI/strategies/reload")
        return response.json()
    except Exception as e:
        return {"error": f"Strategy Service unreachable: {e}"}

@app.api_route("/api/strategies/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def strategy_proxy_catchall(request: Request, path: str):
    """
    Generic catch-all proxy for all strategy endpoints.
    Forwards any request under /api/strategies/ to RODSIC_STRAT_URL/restAPI/strategies/
    """
    target_url = f"{RODSIC_STRAT_URL}/restAPI/strategies/{path}"
    
    try:
        # Forward query parameters
        params = dict(request.query_params)
        
        # Forward JSON body if it exists
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                # Only try to read JSON if content-length exists or if there's content.
                # In FastAPI, reading json() on empty body throws an error.
                body_bytes = await request.body()
                if body_bytes:
                     body = await request.json()
            except Exception:
                pass

        # Perform the actual request
        # Using requests library in a thread is acceptable for light admin panels
        response = await asyncio.to_thread(
            requests.request,
            method=request.method,
            url=target_url,
            json=body,
            params=params,
            timeout=5
        )
        
        # Forward the response
        try:
            return response.json()
        except ValueError:
            return response.text
            
    except Exception as e:
        return {"error": f"Strategy Service unreachable or failed: {e}"}

@app.delete("/api/orders/cancel/{order_id}")
async def cancel_order(order_id: int):
    try:
        response = requests.delete(f"{IB_CORE_REST}/Orders/{order_id}")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

# --- Config Management ---

@app.get("/api/config/gui")
async def get_gui_config():
    try:
        from dotenv import dotenv_values
        return dotenv_values(ENV_PATH)
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/config/gui")
async def update_gui_config(req: dict = Body(...)):
    try:
        from dotenv import set_key
        for key, value in req.items():
            set_key(ENV_PATH, key, str(value))
        # Re-load into os.environ for immediate effect in future calls
        load_dotenv(ENV_PATH, override=True)
        return {"status": "success"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/config/core")
async def get_core_config():
    try:
        response = requests.get(f"{IB_CORE_REST}/Config")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/config/strat")
async def get_strat_config():
    try:
        response = requests.get(f"{RODSIC_STRAT_URL}/restAPI/config")
        return response.json()
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    # The user wants access via HTTP, let's run on 0.0.0.0 for network visibility
    port = int(os.getenv("WEB_PORT", 8001))
    print(f"RODSIC Web Terminal starting at http://localhost:{port}")
    try:
        uvicorn.run(app, host="0.0.0.0", port=port)
    except KeyboardInterrupt:
        print("\nRODSIC Web Terminal stopped by user.")
