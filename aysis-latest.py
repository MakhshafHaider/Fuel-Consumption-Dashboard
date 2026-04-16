import mysql.connector
import json
from datetime import datetime, timedelta
import time
import os
from collections import deque
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import matplotlib.pyplot as plt
from email.mime.base import MIMEBase
from email import encoders
import threading
import traceback
import math
import ast

processing_drops = set()       # To prevent multiple threads per drop
processing_rises = set()       # To prevent multiple threads per rise
processing_refuels = set()     # (imei,param) to prevent multiple rise threads for the same refuel session
already_alerted = {}           # To prevent duplicate emails for same drop target
already_alerted_rise = {}      # To prevent duplicate emails for same rise target
already_alerted_mileage = {}   # To prevent duplicate mileage emails per (imei,param)
already_alerted_low_fuel = {}  # To prevent duplicate low-fuel emails per imei

# Concurrency guards for refuel consolidation / rise threads
_refuel_lock = threading.Lock()

# Fuel alert gating: only allow rise/drop alarms when ignition is OFF or vehicle is idle (no movement)
IDLE_SPEED_KMH = 10.0
IDLE_MIN_SECONDS = 110
_idle_since = {}  # (imei, param) -> dt_tracker datetime when idle started
_idle_lock = threading.Lock()

# Timezone handling (PKT = UTC+5). We keep DB times as-is and convert only for reporting.
PKT_OFFSET_HOURS = 5

# Daily mileage/trip summary (overnight shift) email behavior (PKT)
# Report window: 16:00 (previous day) -> 10:15 (report day)
# Email send time: earliest attempt at 11:00 (report day). If missed (restart/outage),
# the script will send later as soon as it can, and only once per IMEI/day.
DAILY_SUMMARY_LOOKBACK_DAYS = 7  # catch-up window after restarts
DAILY_SHIFT_START_HOUR = 16
DAILY_SHIFT_END_HOUR = 10
DAILY_SHIFT_END_MINUTE = 15
DAILY_SUMMARY_SEND_HOUR = 11

# Per-IMEI overrides for daily summary window + send time (PKT)
# Example: extend end time for vehicles with longer operations.
DAILY_SUMMARY_OVERRIDES = {
    # (empty) Use global defaults for all vehicles unless a specific IMEI needs a different window.
    #
    # Example:
    # "353742376210217": {
    #     "shift_start_hour": 16,
    #     "shift_start_minute": 0,
    #     "shift_end_hour": 10,
    #     "shift_end_minute": 15,
    #     "send_hour": 11,
    #     "send_minute": 0,
    # },
}

def _daily_summary_cfg_for_imei(imei: str) -> dict:
    """
    Return daily summary config for the given IMEI with sane defaults.
    All values are in PKT local time.
    """
    cfg = DAILY_SUMMARY_OVERRIDES.get(str(imei), {}) or {}
    return {
        "shift_start_hour": int(cfg.get("shift_start_hour", DAILY_SHIFT_START_HOUR)),
        "shift_end_hour": int(cfg.get("shift_end_hour", DAILY_SHIFT_END_HOUR)),
        "shift_start_minute": int(cfg.get("shift_start_minute", 0)),
        "shift_end_minute": int(cfg.get("shift_end_minute", DAILY_SHIFT_END_MINUTE)),
        "send_hour": int(cfg.get("send_hour", DAILY_SUMMARY_SEND_HOUR)),
        "send_minute": int(cfg.get("send_minute", 0)),
    }

MYSQL_CONFIG = {
    "host": "192.168.20.170",
    "user": "dev",
    "password": "dev@iteck123",
    "database": "gs"
}



def get_mysql_connection():
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    conn.autocommit = True
    return conn

DEBUG_LOG_FILE = "debug.log"

# IMEIs monitored by this script. Hard-coded to avoid relying on aysis.txt.
MONITORED_IMEIS = [
    "353742376155107",
    "353742376210217",
]

def _write_debug_log(hypothesis_id, location, message, data):
    try:
        payload = {
            "hypothesisId": hypothesis_id,
            "location": location,
            "timestamp": int(time.time() * 1000),
            "message": message,
            "data": data,
        }
        with open(DEBUG_LOG_FILE, "a") as f:
            f.write(json.dumps(payload) + "\n")
    except Exception as e:
        print(f"[DEBUG LOG ERROR] {location}: {e}")

def load_imei_name_map(imeis=None):
    imei_map = {}
    imeis = [str(imei).strip() for imei in (imeis or MONITORED_IMEIS) if str(imei).strip()]
    if not imeis:
        return {}

    # Query names from MySQL for the hard-coded IMEIs.
    try:
        conn = get_mysql_connection()
        cursor = conn.cursor()
        format_strings = ','.join(['%s'] * len(imeis))
        query = f"SELECT imei, name FROM gs_objects WHERE imei IN ({format_strings})"
        cursor.execute(query, imeis)

        for imei, name in cursor.fetchall():
            imei_map[imei] = name

        cursor.close()
        conn.close()
    except Exception as e:
        print(f"[ERROR] Failed to fetch IMEI names from DB: {e}")

    for imei in imeis:
        imei_map.setdefault(imei, imei)

    return imei_map


IMEI_NAME_MAP = load_imei_name_map(MONITORED_IMEIS)
ALERT_IMEIS = set(MONITORED_IMEIS)


STATE_FILE = "fuel_state1.json"
MILEAGE_STATE_FILE = "mileage_state.json"
# Fuel drop detection threshold (liters)
DROP_THRESHOLD = 8.0
# Fuel rise (refuel) detection threshold (liters)
RISE_THRESHOLD = 8.0
# Fuel drop gating: if ignition is ON, only allow the alert when speed stays low enough.
# We intentionally ignore movement_bit for drop gating and use speed alone.
DROP_GATING_MAX_SPEED_KMH = 10.0
# Fuel rise gating override: allow rise/refuel alerts when speed is low (km/h),
# even if ignition/movement bits indicate motion.
RISE_GATING_MAX_SPEED_KMH = 10.0
# Refuel (rise) consolidation: treat multiple step increases as one refuel event.
# We track the peak for a while and send one email when it stabilizes.
REFUEL_POLL_SECONDS = int(os.getenv("FUEL_RISE_POLL_SEC", "20"))
REFUEL_STABLE_SECONDS = int(os.getenv("FUEL_RISE_STABLE_SEC", "180"))
REFUEL_EPS_LITERS = float(os.getenv("FUEL_RISE_STABLE_EPS_L", "0.5"))
REFUEL_MAX_TRACK_SECONDS = int(os.getenv("FUEL_RISE_MAX_TRACK_SEC", str(15 * 60)))
# After a "stable" refuel is detected, wait a bit more and re-check fuel.
# This avoids emails from fake jerks/spikes that stay high briefly then fall back.
POST_REFUEL_VERIFY_SECONDS = int(os.getenv("FUEL_RISE_POST_VERIFY_SEC", "420"))
POST_REFUEL_VERIFY_EPS_LITERS = float(os.getenv("FUEL_RISE_POST_VERIFY_EPS_L", "3.5"))
# After a "confirmed" fuel drop, wait a bit and re-check fuel.
# This avoids drop emails from brief sensor glitches that snap back up.
POST_DROP_VERIFY_SECONDS = int(os.getenv("FUEL_DROP_POST_VERIFY_SEC", "420"))
POST_DROP_VERIFY_EPS_LITERS = float(os.getenv("FUEL_DROP_POST_VERIFY_EPS_L", "1.5"))
# Fuel rise emails are always enabled
ENABLE_FUEL_RISE_ALERTS = True
# How often we poll latest values from gs_objects (seconds)
CHECK_INTERVAL = int(os.getenv("FUEL_DROP_CHECK_INTERVAL_SEC", "100"))

# How long to wait before confirming a suspected drop (seconds).
# 6 minutes was quite conservative; default to 2 minutes for faster alerts.
VERIFY_DELAY_SECONDS = int(os.getenv("FUEL_DROP_VERIFY_DELAY_SEC", "80"))

# Window used to detect "drop then recover" noise around the suspected drop (minutes).
# Keep this reasonably close to VERIFY_DELAY_SECONDS so we still catch quick spikes.
SPIKE_WINDOW_MINUTES = int(os.getenv("FUEL_DROP_SPIKE_WINDOW_MIN", "7"))

# If fuel briefly dips (wrong low) and then "rises" back to the earlier normal level,
# don't treat that as a refuel. This lookback detects "recovery rises".
RISE_RECOVERY_LOOKBACK_MINUTES = int(os.getenv("FUEL_RISE_RECOVERY_LOOKBACK_MIN", str(SPIKE_WINDOW_MINUTES)))
RISE_RECOVERY_EPS_LITERS = float(os.getenv("FUEL_RISE_RECOVERY_EPS_L", "2.0"))

# Mileage settings (distance per 1 liter consumed)
MILEAGE_LITER_STEP = 1.0
MILEAGE_MIN_SPEED_KMH = 10.0          # (legacy) speed is not the primary filter anymore; kept for compatibility/logging
MILEAGE_MAX_GAP_MINUTES = 60         # reset segment if no fresh GPS for too long
# Require some movement before sending a "mileage" segment email.
# This avoids misleading 0.00 km segments caused by GPS speed noise or fuel sensor drift.
MILEAGE_MIN_DISTANCE_KM = 0.2
# Ignore tiny GPS jitter per interval (km). 0.05 km = 50 meters.
MILEAGE_MIN_STEP_DISTANCE_KM = 0.05
# If fuel drops more than this between two readings, treat it as sensor jump/noise and reset mileage baseline (liters).
MILEAGE_MAX_LITER_DROP_PER_READING = 2.0

# Portal-like GPS distance settings (for daily mileage report).
# Portal distance typically sums GPS path with very small jitter suppression.
PORTAL_DISTANCE_MIN_STEP_KM = float(os.getenv("PORTAL_DISTANCE_MIN_STEP_KM", "0.005"))  # 5 meters
PORTAL_DISTANCE_MAX_STEP_KM = float(os.getenv("PORTAL_DISTANCE_MAX_STEP_KM", "10.0"))   # ignore absurd single-step jumps

# Trip-based mileage (boss requirement): measure from ignition ON -> ignition OFF.
TRIP_MIN_DISTANCE_KM = float(os.getenv("TRIP_MIN_DISTANCE_KM", str(MILEAGE_MIN_DISTANCE_KM)))
TRIP_MIN_LITERS_USED = float(os.getenv("TRIP_MIN_LITERS_USED", "1.0"))

# If False, do not send per-trip mileage emails; keep storing trips in fuel_mileage_segments
# and send only the daily summary emails.
ENABLE_TRIP_MILEAGE_EMAILS = False

# Low fuel alarm (liters)
LOW_FUEL_THRESHOLD = 50.0
# Max one low-fuel email per vehicle per hour
LOW_FUEL_DEDUPE_MINUTES = 60

# Fuel value de-spiking (median filter) for alarm decisions.
# This helps avoid "fake jerk" alerts caused by single-sample sensor glitches.
FUEL_MEDIAN_SAMPLES = int(os.getenv("FUEL_MEDIAN_SAMPLES", "5"))  # 5 samples → smoother median, needs 5 packets before alerting
FUEL_MEDIAN_MAX_AGE_SECONDS = int(os.getenv("FUEL_MEDIAN_MAX_AGE_SEC", "900"))  # ignore too-old samples
_fuel_hist = {}  # (imei,param) -> deque[(dt_tracker, fuel_value)]

def _filter_fuel_for_alarms(imei, param, dt_tracker, fuel_value):
    """
    Median-filter fuel values per (imei,param) to suppress single-sample jerks.
    Returns filtered fuel_value (float).
    """
    try:
        if fuel_value is None:
            return None
        fv = float(fuel_value)
    except Exception:
        return fuel_value

    try:
        n = int(FUEL_MEDIAN_SAMPLES or 1)
        if n < 1:
            n = 1
    except Exception:
        n = 3

    key = (str(imei), str(param))
    dq = _fuel_hist.get(key)
    if not dq or not isinstance(dq, deque) or dq.maxlen != n:
        dq = deque(maxlen=n)
        _fuel_hist[key] = dq

    dq.append((dt_tracker, fv))

    # drop stale samples
    try:
        cutoff = dt_tracker - timedelta(seconds=int(FUEL_MEDIAN_MAX_AGE_SECONDS))
        while dq and dq[0][0] and dq[0][0] < cutoff:
            dq.popleft()
    except Exception:
        pass

    vals = [v for (_t, v) in dq if v is not None]
    if not vals:
        return fv
    if len(vals) < min(2, n):
        # not enough samples to filter yet
        return fv
    vals.sort()
    return float(vals[len(vals) // 2])

#
# Rise email geofence: only send refuel emails when the event location is within one of these polygons.
# Polygon points are [lng, lat].
#
POLYGON_LIST = {
    "Qayumabad": [
        (67.0803, 24.834),
        (67.0821, 24.8354),
        (67.0823, 24.831),
        (67.08, 24.8306),
    ]
}

def _point_in_polygon(lng: float, lat: float, polygon: list) -> bool:
    """
    Ray-casting point-in-polygon test.
    polygon: list of (lng, lat) tuples.
    """
    try:
        x = float(lng)
        y = float(lat)
    except Exception:
        return False

    inside = False
    n = len(polygon)
    if n < 3:
        return False

    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        # Check if the horizontal ray intersects the edge
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1):
            inside = not inside
    return inside

def _is_in_any_rise_polygon(lat, lng) -> bool:
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except Exception:
        return False
    for _name, poly in POLYGON_LIST.items():
        if _point_in_polygon(lng_f, lat_f, poly):
            return True
    return False

def load_last_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print("Warning: fuel_state.json is corrupted. Starting fresh.")
            return {}
    return {}

def save_last_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def load_mileage_state():
    if os.path.exists(MILEAGE_STATE_FILE):
        try:
            with open(MILEAGE_STATE_FILE, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print("Warning: mileage_state.json is corrupted. Starting fresh.")
            return {}
    return {}

def save_mileage_state(state):
    with open(MILEAGE_STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def get_last_record(state, imei, param):
    """
    State is stored per (imei, param) to avoid mixing fuel1 vs io327.
    Backward compat: if an old state entry is found (single dict with fuel/dt_tracker),
    treat it as ambiguous and return None so we re-learn per-param cleanly.
    """
    imei_state = state.get(imei)
    if not isinstance(imei_state, dict):
        return None

    # Legacy format (old code stored per-imei only)
    if "fuel" in imei_state and "dt_tracker" in imei_state:
        return None

    rec = imei_state.get(param)
    if isinstance(rec, dict) and "fuel" in rec and "dt_tracker" in rec:
        return rec
    return None

def set_last_record(state, imei, param, fuel_value, dt_tracker):
    imei_state = state.get(imei)
    if not isinstance(imei_state, dict):
        state[imei] = {}
        imei_state = state[imei]

    # Migrate legacy format if present
    if "fuel" in imei_state and "dt_tracker" in imei_state:
        legacy = imei_state
        state[imei] = {"_legacy": legacy}
        imei_state = state[imei]

    imei_state[param] = {
        "fuel": fuel_value,
        "dt_tracker": dt_tracker.strftime("%Y-%m-%d %H:%M:%S")
    }

def parse_calibration(calib_str):
    try:
        data = json.loads(calib_str)
        return sorted([(float(item['x']), float(item['y'])) for item in data])
    except:
        return []

def _eval_formula_ast(node, x_value):
    if isinstance(node, ast.Expression):
        return _eval_formula_ast(node.body, x_value)
    if isinstance(node, ast.BinOp):
        left = _eval_formula_ast(node.left, x_value)
        right = _eval_formula_ast(node.right, x_value)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        raise ValueError(f"Unsupported formula operator: {type(node.op).__name__}")
    if isinstance(node, ast.UnaryOp):
        value = _eval_formula_ast(node.operand, x_value)
        if isinstance(node.op, ast.UAdd):
            return value
        if isinstance(node.op, ast.USub):
            return -value
        raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
    if isinstance(node, ast.Name):
        if node.id != "x":
            raise ValueError(f"Unsupported formula variable: {node.id}")
        return float(x_value)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if hasattr(ast, "Num") and isinstance(node, ast.Num):
        return float(node.n)
    raise ValueError(f"Unsupported formula node: {type(node).__name__}")

def apply_sensor_formula(raw_value, formula):
    try:
        x_value = float(raw_value)
    except Exception:
        return None

    formula = str(formula or "").strip()
    if not formula:
        return x_value

    try:
        expr = ast.parse(formula, mode="eval")
        return float(_eval_formula_ast(expr, x_value))
    except Exception as e:
        print(f"[FORMULA ERROR] formula={formula!r} raw_value={raw_value!r}: {e}")
        return x_value

def voltage_to_fuel(voltage, calibration):
    if not calibration:
        return None

    if voltage <= calibration[0][0]:
        return calibration[0][1]
    if voltage >= calibration[-1][0]:
        return calibration[-1][1]

    for i in range(1, len(calibration)):
        x0, y0 = calibration[i - 1]
        x1, y1 = calibration[i]
        if x0 <= voltage <= x1:
            return y0 + (y1 - y0) * (voltage - x0) / (x1 - x0)
    return None

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """
    Great-circle distance between two points (km).
    """
    try:
        lat1, lon1, lat2, lon2 = map(float, (lat1, lon1, lat2, lon2))
    except Exception:
        return 0.0

    # radians
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return 6371.0 * c

def google_maps_link(lat, lng) -> str:
    """
    Return a Google Maps URL for the provided coordinates, or None if invalid.
    """
    try:
        if lat is None or lng is None:
            return None
        lat_f = float(lat)
        lng_f = float(lng)
        return f"https://www.google.com/maps?q={lat_f},{lng_f}"
    except Exception:
        return None

def _pk_dt(dt_utc: datetime) -> datetime:
    return dt_utc + timedelta(hours=PKT_OFFSET_HOURS)

def _pk_day_bounds_utc(report_date_pk):
    """
    report_date_pk: datetime.date in PKT
    Returns (start_utc, end_utc) for that PKT day window.
    """
    start_pk = datetime.combine(report_date_pk, datetime.min.time())
    end_pk = start_pk + timedelta(days=1)
    start_utc = start_pk - timedelta(hours=PKT_OFFSET_HOURS)
    end_utc = end_pk - timedelta(hours=PKT_OFFSET_HOURS)
    return start_utc, end_utc

def _pk_shift_bounds_utc(
    report_end_date_pk,
    shift_start_hour: int = DAILY_SHIFT_START_HOUR,
    shift_end_hour: int = DAILY_SHIFT_END_HOUR,
    shift_start_minute: int = 0,
    shift_end_minute: int = 0,
):
    """
    report_end_date_pk: datetime.date in PKT (the morning/end date of the shift)
    Returns (start_utc, end_utc) for the overnight shift window:
      PKT (report_end_date_pk - 1) 16:00:00  ->  PKT (report_end_date_pk) 08:00:00
    """
    start_pk = datetime.combine(report_end_date_pk - timedelta(days=1), datetime.min.time()) + timedelta(
        hours=int(shift_start_hour),
        minutes=int(shift_start_minute),
    )
    end_pk = datetime.combine(report_end_date_pk, datetime.min.time()) + timedelta(
        hours=int(shift_end_hour),
        minutes=int(shift_end_minute),
    )
    start_utc = start_pk - timedelta(hours=PKT_OFFSET_HOURS)
    end_utc = end_pk - timedelta(hours=PKT_OFFSET_HOURS)
    return start_utc, end_utc

def _get_latlng_at(cursor, imei, dt_tracker):
    """
    Best-effort lat/lng lookup from gs_object_data_<imei> at exact dt_tracker.
    Returns (lat,lng) or (None,None).
    """
    try:
        table_name = f"gs_object_data_{imei}"
        cursor.execute(
            f"SELECT lat, lng FROM {table_name} WHERE dt_tracker = %s LIMIT 1",
            (dt_tracker,),
        )
        row = cursor.fetchone()
        if not row:
            return None, None
        return row.get("lat"), row.get("lng")
    except Exception:
        return None, None

def send_daily_trip_summary_email(imei, report_date_pk, trips, totals, cursor_for_loc):
    """
    Send one daily summary per vehicle for the PKT day.
    trips: list of dicts with start_dt, end_dt, liters_used, distance_km
    totals: dict with trip_count, total_distance_km, total_liters_used, overall_km_per_l
    """
    smtp_server = "192.168.20.204"
    port = 587
    sender_email = "broadcast@itecknologi.com"
    password = "Karachi@123"
    receivers = [
        "atif.khatri@itecknologi.com",
        "owais.akhlaq@itecknologi.com",
        "muhammad.anas@itecknologi.com",
        "ahsanrazazaidi182@gmail.com"
    ]

    vehicle_name = IMEI_NAME_MAP.get(imei, imei)
    # report_date_pk is the PKT date at the END of the overnight window (email sends at 09:00 PKT on this date)
    subject = f"📊 Daily Mileage Report — {vehicle_name} — {report_date_pk.strftime('%Y-%m-%d')}"

    # Build BOTH: plain text (aligned) + HTML (proper table)
    # Plain text uses short map references (S1/E1) so long URLs don't destroy alignment.
    try:
        import html as _html
    except Exception:
        _html = None

    def _esc(s: str) -> str:
        if not _html:
            return str(s)
        return _html.escape(str(s), quote=True)

    def _fmt_dt_pk(dt_utc: datetime) -> str:
        try:
            return _pk_dt(dt_utc).strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return "N/A"

    def _fmt_num(v, width: int, prec: int = 2) -> str:
        try:
            return f"{float(v):{width}.{prec}f}"
        except Exception:
            return f"{0.0:{width}.{prec}f}"

    plain_lines = []
    plain_lines.append("Dear User,")
    plain_lines.append("")
    plain_lines.append(f"Vehicle: {vehicle_name}")
    plain_lines.append(f"Report Date (PKT): {report_date_pk.strftime('%Y-%m-%d')}")
    cfg = _daily_summary_cfg_for_imei(imei)
    shift_start_pk = datetime.combine(report_date_pk - timedelta(days=1), datetime.min.time()) + timedelta(
        hours=int(cfg["shift_start_hour"]),
        minutes=int(cfg.get("shift_start_minute", 0)),
    )
    shift_end_pk = datetime.combine(report_date_pk, datetime.min.time()) + timedelta(
        hours=int(cfg["shift_end_hour"]),
        minutes=int(cfg.get("shift_end_minute", 0)),
    )
    plain_lines.append(
        f"Report Window (PKT): {shift_start_pk.strftime('%Y-%m-%d %H:%M:%S')} to {shift_end_pk.strftime('%Y-%m-%d %H:%M:%S')}"
    )
    plain_lines.append("")
    plain_lines.append("DAY TOTALS")
    plain_lines.append(f"Trips: {totals['trip_count']}")
    plain_lines.append(f"Total Distance: {totals['total_distance_km']:.2f} km")
    plain_lines.append(f"Total Fuel Used: {totals['total_liters_used']:.2f} L")
    plain_lines.append(f"Overall Mileage: {totals['overall_km_per_l']:.2f} km/L")
    plain_lines.append("")
    plain_lines.append("TRIPS")
    plain_lines.append(
        "No | Start (PKT)           | End (PKT)             | Dist(km) | Fuel(L) |  km/L | Start |  End"
    )
    plain_lines.append(
        "---|------------------------|------------------------|---------:|--------:|-----:|------:|-----:"
    )

    # HTML body
    html_rows = []
    html_rows.append(f"<p>Dear User,</p>")
    html_rows.append("<p>")
    html_rows.append(f"<b>Vehicle:</b> {_esc(vehicle_name)}<br>")
    html_rows.append(f"<b>Report Date (PKT):</b> {_esc(report_date_pk.strftime('%Y-%m-%d'))}<br>")
    html_rows.append(
        f"<b>Report Window (PKT):</b> {_esc(shift_start_pk.strftime('%Y-%m-%d %H:%M:%S'))} to {_esc(shift_end_pk.strftime('%Y-%m-%d %H:%M:%S'))}"
    )
    html_rows.append("</p>")
    html_rows.append("<p><b>DAY TOTALS</b><br>")
    html_rows.append(f"Trips: {_esc(totals['trip_count'])}<br>")
    html_rows.append(f"Total Distance: {_esc(format(float(totals.get('total_distance_km', 0.0) or 0.0), '.2f'))} km<br>")
    html_rows.append(f"Total Fuel Used: {_esc(format(float(totals.get('total_liters_used', 0.0) or 0.0), '.2f'))} L<br>")
    html_rows.append(f"Overall Mileage: {_esc(format(float(totals.get('overall_km_per_l', 0.0) or 0.0), '.2f'))} km/L")
    html_rows.append("</p>")

    html_rows.append("<p><b>TRIPS</b></p>")
    html_rows.append(
        """
<table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:13px;">
  <thead>
    <tr>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:right;">No</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:left;">Start (PKT)</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:left;">End (PKT)</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:right;">Dist (km)</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:right;">Fuel (L)</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:right;">km/L</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:left;">Start Map</th>
      <th style="border:1px solid #bbb;padding:6px 8px;text-align:left;">End Map</th>
    </tr>
  </thead>
  <tbody>
        """.strip()
    )

    map_refs = []  # (idx, s_map, e_map)

    for idx, t in enumerate(trips, start=1):
        start_dt = t["start_dt"]
        end_dt = t["end_dt"]
        dist = float(t.get("distance_km", 0) or 0)
        liters = float(t.get("liters_used", 0) or 0)
        kmpl = (dist / liters) if liters > 0 else 0.0

        s_lat, s_lng = _get_latlng_at(cursor_for_loc, imei, start_dt)
        e_lat, e_lng = _get_latlng_at(cursor_for_loc, imei, end_dt)
        s_map = google_maps_link(s_lat, s_lng)
        e_map = google_maps_link(e_lat, e_lng)
        map_refs.append((idx, s_map, e_map))

        # Plain text row (aligned columns, no long URLs)
        s_ref = f"S{idx}" if s_map else "N/A"
        e_ref = f"E{idx}" if e_map else "N/A"
        plain_lines.append(
            f"{idx:>2} | {_fmt_dt_pk(start_dt):<22} | {_fmt_dt_pk(end_dt):<22} | "
            f"{_fmt_num(dist, 8, 2)} | {_fmt_num(liters, 7, 2)} | {_fmt_num(kmpl, 5, 2)} | {s_ref:>5} | {e_ref:>4}"
        )

        # HTML row (clickable)
        s_link = f'<a href="{_esc(s_map)}">Open</a>' if s_map else "N/A"
        e_link = f'<a href="{_esc(e_map)}">Open</a>' if e_map else "N/A"
        html_rows.append(
            "<tr>"
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:right;">{idx}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:left;white-space:nowrap;">{_esc(_fmt_dt_pk(start_dt))}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:left;white-space:nowrap;">{_esc(_fmt_dt_pk(end_dt))}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:right;">{_esc(f"{dist:.2f}")}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:right;">{_esc(f"{liters:.2f}")}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:right;">{_esc(f"{kmpl:.2f}")}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:left;">{s_link}</td>'
            f'<td style="border:1px solid #bbb;padding:6px 8px;text-align:left;">{e_link}</td>'
            "</tr>"
        )

    html_rows.append(
        """
  </tbody>
</table>
        """.strip()
    )

    # Plain text: map links section (kept out of table so layout stays clean)
    plain_lines.append("")
    plain_lines.append("MAP LINKS")
    for idx, s_map, e_map in map_refs:
        if s_map:
            plain_lines.append(f"S{idx}: {s_map}")
        if e_map:
            plain_lines.append(f"E{idx}: {e_map}")

    body_plain = "\n".join(plain_lines)
    body_html = "\n".join(html_rows)

    message = MIMEMultipart("alternative")
    message["From"] = sender_email
    message["To"] = ", ".join(receivers)
    message["Subject"] = subject
    message.attach(MIMEText(body_plain, "plain"))
    message.attach(MIMEText(body_html, "html"))

    server = smtplib.SMTP(smtp_server, port)
    server.starttls()
    server.login(sender_email, password)
    server.sendmail(sender_email, receivers, message.as_string())
    server.quit()
    print(f"[EMAIL] Daily trip summary sent for vehicle: {vehicle_name} date={report_date_pk}")
    _write_debug_log(
        "F-daily-summary",
        "aysis-latest.py:send_daily_trip_summary_email",
        "Daily mileage email sent",
        {
            "imei": imei,
            "vehicle_name": vehicle_name,
            "report_date_pk": str(report_date_pk),
            "trip_count": int(totals.get("trip_count", 0) or 0),
            "total_distance_km": round(float(totals.get("total_distance_km", 0.0) or 0.0), 2),
            "total_liters_used": round(float(totals.get("total_liters_used", 0.0) or 0.0), 2),
        },
    )

def backfill_trip_segments_for_window(conn, cursor, imei: str, start_utc: datetime, end_utc: datetime) -> int:
    """
    Recompute and insert missing trip segments from historical gs_object_data_<imei>
    so daily summaries still work even if the monitoring process restarted.

    Source-of-truth for ignition: params['io239'] (0/1).
    Source-of-truth for fuel: calibrated sensors in gs_object_sensors for this IMEI (param in ('io327','fuel1')).

    Returns number of inserted segments.
    """
    try:
        table_name = f"gs_object_data_{imei}"
        cursor.execute(
            f"""
            SELECT dt_tracker, lat, lng, params
            FROM {table_name}
            WHERE dt_tracker >= %s AND dt_tracker < %s
            ORDER BY dt_tracker ASC
            """,
            (start_utc, end_utc),
        )
        hist_rows = cursor.fetchall() or []
    except Exception as e:
        _write_debug_log(
            "F-daily-summary",
            "aysis-latest.py:backfill_trip_segments_for_window",
            "Backfill read failed",
            {"imei": imei, "error": str(e)},
        )
        return 0

    if not hist_rows:
        return 0

    # Load calibrated fuel sensors for this IMEI
    cursor.execute(
        """
        SELECT param, calibration, formula
        FROM gs_object_sensors
        WHERE imei=%s
          AND param IN ('fuel1', 'io327')
          AND calibration IS NOT NULL
          AND TRIM(calibration) <> '[]'
        """,
        (imei,),
    )
    sensor_rows = cursor.fetchall() or []
    sensors = []
    for s in sensor_rows:
        calib = parse_calibration(s.get("calibration"))
        if not calib:
            continue
        sensors.append({"param": s.get("param"), "calibration": calib, "formula": s.get("formula")})

    if not sensors:
        return 0

    inserted = 0

    for sensor in sensors:
        param = sensor["param"]
        calibration = sensor["calibration"]
        formula = sensor.get("formula")

        # Replay the same core logic as update_mileage_segment, but using historical rows.
        active = False
        start_dt = None
        last_lat = last_lng = None
        last_fuel = None
        distance_km = 0.0
        consumed_liters = 0.0

        for r in hist_rows:
            dt_tracker = r.get("dt_tracker")
            if not dt_tracker:
                continue
            try:
                params = json.loads(r.get("params")) if r.get("params") else {}
            except Exception:
                params = {}
            if not isinstance(params, dict):
                params = {}

            ignition_bit = _safe_int_bit(params, "io239", default=1)

            # Fuel for this sensor param (requires param present)
            if param not in params:
                continue
            try:
                raw_v = float(params.get(param))
            except Exception:
                continue

            scaled_v = apply_sensor_formula(raw_v, formula)
            fuel_l = voltage_to_fuel(scaled_v, calibration)
            if fuel_l is None:
                continue

            lat = r.get("lat")
            lng = r.get("lng")
            if lat is None or lng is None:
                continue

            # Ignition OFF closes an active trip
            if ignition_bit == 0:
                if active:
                    # Apply thresholds (same as script)
                    if distance_km >= TRIP_MIN_DISTANCE_KM and consumed_liters >= TRIP_MIN_LITERS_USED:
                        # Avoid duplicates (idempotent backfill)
                        cursor.execute(
                            """
                            SELECT segment_id
                            FROM fuel_mileage_segments
                            WHERE imei=%s AND param=%s AND start_dt=%s AND end_dt=%s
                            LIMIT 1
                            """,
                            (imei, param, start_dt, dt_tracker),
                        )
                        if not cursor.fetchone():
                            km_per_l = (distance_km / consumed_liters) if consumed_liters > 0 else 0.0
                            cursor.execute(
                                """
                                INSERT INTO fuel_mileage_segments (imei, param, start_dt, end_dt, liters_used, distance_km, km_per_l)
                                VALUES (%s, %s, %s, %s, %s, %s, %s)
                                """,
                                (
                                    imei,
                                    param,
                                    start_dt,
                                    dt_tracker,
                                    float(round(consumed_liters, 3)),
                                    float(round(distance_km, 3)),
                                    float(round(km_per_l, 3)),
                                ),
                            )
                            inserted += 1
                    # reset trip
                    active = False
                    start_dt = None
                    last_lat = last_lng = None
                    last_fuel = None
                    distance_km = 0.0
                    consumed_liters = 0.0
                continue

            # Ignition ON: start or continue trip
            if not active:
                active = True
                start_dt = dt_tracker
                last_lat = float(lat)
                last_lng = float(lng)
                last_fuel = float(fuel_l)
                distance_km = 0.0
                consumed_liters = 0.0
                continue

            # distance accumulation (same filters)
            d_km = haversine_km(last_lat, last_lng, lat, lng)
            if MILEAGE_MIN_STEP_DISTANCE_KM <= d_km < 10:
                distance_km += float(d_km)
            last_lat = float(lat)
            last_lng = float(lng)

            # fuel consumption accumulation (same filters)
            try:
                drop = float(last_fuel) - float(fuel_l)
            except Exception:
                drop = 0.0

            if drop < 0:
                last_fuel = float(fuel_l)
                continue
            if drop > MILEAGE_MAX_LITER_DROP_PER_READING:
                last_fuel = float(fuel_l)
                continue
            consumed_liters += float(drop)
            last_fuel = float(fuel_l)

    if inserted:
        try:
            conn.commit()
        except Exception:
            pass

    _write_debug_log(
        "F-daily-summary",
        "aysis-latest.py:backfill_trip_segments_for_window",
        "Backfill completed",
        {"imei": imei, "inserted_segments": int(inserted)},
    )
    return inserted


def compute_portal_like_trips_for_window(cursor, imei: str, start_utc: datetime, end_utc: datetime):
    """
    Compute trips + totals directly from GPS packets (portal-like distance),
    while still using ignition (io239) to split trips.

    Distance:
      - uses ALL lat/lng points in gs_object_data_<imei> within [start_utc, end_utc)
      - sums haversine step distances
      - ignores tiny jitter < PORTAL_DISTANCE_MIN_STEP_KM and absurd jumps >= PORTAL_DISTANCE_MAX_STEP_KM

    Fuel (liters_used):
      - best-effort from calibrated sensor (prefer io327, else fuel1)
      - if sensor not available, liters_used stays 0.0

    Returns:
      (trips, totals)
        trips: list of dicts with start_dt, end_dt, liters_used, distance_km
        totals: dict with trip_count, total_distance_km, total_liters_used, overall_km_per_l
    """
    # Pick fuel sensor calibration for this IMEI (prefer io327).
    cursor.execute(
        """
        SELECT param, calibration, formula
        FROM gs_object_sensors
        WHERE imei=%s
          AND param IN ('io327', 'fuel1')
          AND calibration IS NOT NULL
          AND TRIM(calibration) <> '[]'
        """,
        (imei,),
    )
    sensor_rows = cursor.fetchall() or []
    sensor_rows = [r for r in sensor_rows if parse_calibration(r.get("calibration"))]
    sensor_rows.sort(key=lambda r: 0 if str(r.get("param")) == "io327" else 1)
    fuel_param = None
    calibration = None
    formula = None
    if sensor_rows:
        fuel_param = sensor_rows[0].get("param")
        calibration = parse_calibration(sensor_rows[0].get("calibration"))
        formula = sensor_rows[0].get("formula")

    table_name = f"gs_object_data_{imei}"
    cursor.execute(
        f"""
        SELECT dt_tracker, lat, lng, params
        FROM {table_name}
        WHERE dt_tracker >= %s AND dt_tracker < %s
        ORDER BY dt_tracker ASC
        """,
        (start_utc, end_utc),
    )
    hist_rows = cursor.fetchall() or []

    trips = []
    active = False
    trip = None

    def _start_trip(dt_tracker, lat, lng):
        return {
            "start_dt": dt_tracker,
            "end_dt": dt_tracker,
            "distance_km": 0.0,
            "liters_used": 0.0,
            "last_lat": float(lat) if lat is not None else None,
            "last_lng": float(lng) if lng is not None else None,
            "last_fuel": None,
        }

    def _update_distance(trip_obj, lat, lng):
        if lat is None or lng is None:
            return
        if trip_obj.get("last_lat") is None or trip_obj.get("last_lng") is None:
            trip_obj["last_lat"] = float(lat)
            trip_obj["last_lng"] = float(lng)
            return
        d_km = haversine_km(trip_obj["last_lat"], trip_obj["last_lng"], lat, lng)
        if PORTAL_DISTANCE_MIN_STEP_KM <= d_km < PORTAL_DISTANCE_MAX_STEP_KM:
            trip_obj["distance_km"] = float(trip_obj.get("distance_km", 0.0) or 0.0) + float(d_km)
        trip_obj["last_lat"] = float(lat)
        trip_obj["last_lng"] = float(lng)

    def _maybe_update_fuel(trip_obj, params_dict):
        if not fuel_param or not calibration:
            return
        if not isinstance(params_dict, dict) or fuel_param not in params_dict:
            return
        try:
            raw_v = float(params_dict.get(fuel_param))
        except Exception:
            return
        scaled_v = apply_sensor_formula(raw_v, formula)
        fuel_l = voltage_to_fuel(scaled_v, calibration)
        if fuel_l is None:
            return
        fuel_l = float(fuel_l)

        last_fuel = trip_obj.get("last_fuel")
        if last_fuel is None:
            trip_obj["last_fuel"] = fuel_l
            return

        drop = float(last_fuel) - float(fuel_l)
        if drop < 0:
            # refuel happened; don't count negative consumption
            trip_obj["last_fuel"] = fuel_l
            return
        if drop > float(MILEAGE_MAX_LITER_DROP_PER_READING or 2.0):
            # sudden jump/noise; baseline only
            trip_obj["last_fuel"] = fuel_l
            return
        trip_obj["liters_used"] = float(trip_obj.get("liters_used", 0.0) or 0.0) + float(drop)
        trip_obj["last_fuel"] = fuel_l

    last_dt_seen = None
    for r in hist_rows:
        dt_tracker = r.get("dt_tracker")
        if not dt_tracker:
            continue
        last_dt_seen = dt_tracker

        lat = r.get("lat")
        lng = r.get("lng")
        try:
            params = json.loads(r.get("params")) if r.get("params") else {}
        except Exception:
            params = {}
        if not isinstance(params, dict):
            params = {}

        ignition_bit = _safe_int_bit(params, "io239", default=1)

        # ignition OFF closes an active trip
        if ignition_bit == 0:
            if active and trip:
                trip["end_dt"] = dt_tracker
                # include trip if it has meaningful distance
                if float(trip.get("distance_km", 0.0) or 0.0) >= float(TRIP_MIN_DISTANCE_KM or 0.0):
                    trips.append(
                        {
                            "start_dt": trip["start_dt"],
                            "end_dt": trip["end_dt"],
                            "liters_used": float(trip.get("liters_used", 0.0) or 0.0),
                            "distance_km": float(trip.get("distance_km", 0.0) or 0.0),
                        }
                    )
            active = False
            trip = None
            continue

        # ignition ON: start or continue trip
        if not active or not trip:
            active = True
            trip = _start_trip(dt_tracker, lat, lng)
            _maybe_update_fuel(trip, params)
            continue

        _update_distance(trip, lat, lng)
        _maybe_update_fuel(trip, params)
        trip["end_dt"] = dt_tracker

    # If trip is still active at window end, close it at last packet time within window (portal counts it).
    if active and trip and last_dt_seen:
        trip["end_dt"] = last_dt_seen
        if float(trip.get("distance_km", 0.0) or 0.0) >= float(TRIP_MIN_DISTANCE_KM or 0.0):
            trips.append(
                {
                    "start_dt": trip["start_dt"],
                    "end_dt": trip["end_dt"],
                    "liters_used": float(trip.get("liters_used", 0.0) or 0.0),
                    "distance_km": float(trip.get("distance_km", 0.0) or 0.0),
                }
            )

    total_distance = sum(float(t.get("distance_km", 0) or 0) for t in trips)
    total_liters = sum(float(t.get("liters_used", 0) or 0) for t in trips)
    overall_kmpl = (total_distance / total_liters) if total_liters > 0 else 0.0
    totals = {
        "trip_count": len(trips),
        "total_distance_km": float(total_distance),
        "total_liters_used": float(total_liters),
        "overall_km_per_l": float(overall_kmpl),
    }
    return trips, totals

def maybe_send_daily_trip_summaries(conn, cursor):
    """
    Catch up and send any missing daily summaries (last DAILY_SUMMARY_LOOKBACK_DAYS),
    computing portal-like distance directly from packets so the mileage report matches the GPS portal.
    """
    now_pk = _pk_dt(datetime.utcnow())
    today_pk = now_pk.date()

    # Include days_back=0 so today's 09:00 email (yesterday 16:00 -> today 08:00) can be sent.
    for days_back in range(0, DAILY_SUMMARY_LOOKBACK_DAYS + 1):
        report_date_pk = today_pk - timedelta(days=days_back)

        for imei in ALERT_IMEIS:
            cfg = _daily_summary_cfg_for_imei(imei)

            # Don't send today's report before configured send time (PKT).
            if report_date_pk == today_pk:
                send_gate_pk = datetime.combine(report_date_pk, datetime.min.time()) + timedelta(
                    hours=int(cfg["send_hour"]),
                    minutes=int(cfg["send_minute"]),
                )
                if now_pk < send_gate_pk:
                    _write_debug_log(
                        "F-daily-summary",
                        "aysis-latest.py:maybe_send_daily_trip_summaries",
                        "Daily mileage email not sent yet",
                        {
                            "imei": imei,
                            "report_date_pk": str(report_date_pk),
                            "reason": "before_send_time",
                            "now_pk": now_pk.strftime("%Y-%m-%d %H:%M:%S"),
                            "send_gate_pk": send_gate_pk.strftime("%Y-%m-%d %H:%M:%S"),
                        },
                    )
                    continue

            start_utc, end_utc = _pk_shift_bounds_utc(
                report_date_pk,
                shift_start_hour=cfg["shift_start_hour"],
                shift_end_hour=cfg["shift_end_hour"],
                shift_start_minute=cfg.get("shift_start_minute", 0),
                shift_end_minute=cfg.get("shift_end_minute", 0),
            )

            # Skip if already emailed for this imei/date
            cursor.execute(
                "SELECT summary_id FROM fuel_daily_trip_summaries WHERE imei=%s AND report_date=%s LIMIT 1",
                (imei, report_date_pk),
            )
            if cursor.fetchone():
                _write_debug_log(
                    "F-daily-summary",
                    "aysis-latest.py:maybe_send_daily_trip_summaries",
                    "Daily mileage email not sent",
                    {
                        "imei": imei,
                        "report_date_pk": str(report_date_pk),
                        "reason": "already_emailed",
                    },
                )
                continue

            try:
                rows, totals = compute_portal_like_trips_for_window(cursor, imei, start_utc, end_utc)
            except Exception as e:
                _write_debug_log(
                    "F-daily-summary",
                    "aysis-latest.py:maybe_send_daily_trip_summaries",
                    "Daily mileage email not sent",
                    {
                        "imei": imei,
                        "report_date_pk": str(report_date_pk),
                        "reason": "compute_error",
                        "error": str(e),
                    },
                )
                continue

            if not rows:
                _write_debug_log(
                    "F-daily-summary",
                    "aysis-latest.py:maybe_send_daily_trip_summaries",
                    "Daily mileage email not sent",
                    {
                        "imei": imei,
                        "report_date_pk": str(report_date_pk),
                        "reason": "no_trip_rows",
                    },
                )
                continue

            # Send email (uses cursor to get maps links)
            send_daily_trip_summary_email(imei, report_date_pk, rows, totals, cursor)

            # Persist sent marker in DB so restarts won't duplicate/miss
            cursor.execute(
                """
                INSERT INTO fuel_daily_trip_summaries
                  (imei, report_date, trip_count, total_distance_km, total_liters_used, overall_km_per_l, emailed_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    imei,
                    report_date_pk,
                    totals["trip_count"],
                    totals["total_distance_km"],
                    totals["total_liters_used"],
                    totals["overall_km_per_l"],
                ),
            )
            conn.commit()

def _safe_int_bit(params: dict, key: str, default: int = 1) -> int:
    """
    Read IO bit from params dict. Returns 0 or 1.
    Fail-safe default=1 (treat as ON/moving) to avoid alerts if key missing/bad.
    """
    try:
        v = params.get(key, default)
        # params values can be strings like "0" / "1" / "0.0"
        return 1 if int(float(v)) != 0 else 0
    except Exception:
        return default

def _get_speed_kmh(cursor, imei, dt_tracker, loc_cache) -> float:
    loc = get_location_at(cursor, imei, dt_tracker, loc_cache)
    if not loc:
        return 0.0
    try:
        return float(loc.get("speed", 0) or 0)
    except Exception:
        return 0.0

def _update_idle_tracker(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh):
    """
    Track continuous idle time per (imei,param). Idle means: movement_bit==0 and speed<=IDLE_SPEED_KMH.
    """
    key = (imei, param)
    is_idle_now = (movement_bit == 0) and (speed_kmh <= IDLE_SPEED_KMH)
    with _idle_lock:
        if ignition_bit == 0:
            # ignition off: consider idle baseline satisfied
            _idle_since[key] = dt_tracker
            return
        if is_idle_now:
            if key not in _idle_since:
                _idle_since[key] = dt_tracker
        else:
            _idle_since.pop(key, None)

def _is_allowed_for_fuel_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh) -> bool:
    """
    Allowed if:
    - ignition off, OR
    - ignition on AND not moving AND speed <= IDLE_SPEED_KMH
    """
    # ignition off -> allow regardless of movement/speed
    if ignition_bit == 0:
        return True
    # ignition on: allow only if not moving and low/idle speed
    try:
        speed_f = float(speed_kmh or 0.0)
    except Exception:
        speed_f = 0.0
    return (movement_bit == 0) and (speed_f <= IDLE_SPEED_KMH)

def _is_allowed_for_fuel_drop_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh) -> bool:
    """
    Fuel DROP gating — avoid alerting on normal fuel consumption:
    - ignition off → always allow (parked, engine off), OR
    - ignition on → allow only if speed <= DROP_GATING_MAX_SPEED_KMH
    We intentionally do not use movement_bit here.
    """
    if ignition_bit == 0:
        return True
    try:
        speed_f = float(speed_kmh or 0.0)
    except Exception:
        speed_f = 0.0
    return speed_f <= DROP_GATING_MAX_SPEED_KMH

def _is_allowed_for_fuel_rise_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh) -> bool:
    """
    Fuel RISE gating:
    - Allowed if speed <= RISE_GATING_MAX_SPEED_KMH (10.0), regardless of ignition or movement bit.
    """
    try:
        speed_f = float(speed_kmh or 0.0)
    except Exception:
        speed_f = 0.0
    return speed_f <= RISE_GATING_MAX_SPEED_KMH

def get_location_at(cursor, imei, dt_tracker, loc_cache):
    """
    Fetch lat/lng/speed at a specific dt_tracker from per-IMEI history table.
    Uses a per-cycle cache to avoid duplicate queries (e.g., fuel1 + io327 for same IMEI).
    """
    cache_key = (imei, dt_tracker.strftime("%Y-%m-%d %H:%M:%S"))
    if cache_key in loc_cache:
        return loc_cache[cache_key]

    table_name = f"gs_object_data_{imei}"
    cursor.execute(
        # LIMIT 1 prevents mysql-connector "Unread result found" if dt_tracker isn't unique
        f"SELECT lat, lng, speed FROM {table_name} WHERE dt_tracker = %s LIMIT 1",
        (dt_tracker,)
    )
    row = cursor.fetchone()
    if not row:
        loc_cache[cache_key] = None
        return None

    loc = {
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "speed": float(row.get("speed", 0) or 0),
    }
    loc_cache[cache_key] = loc
    return loc

def update_mileage_segment(cursor, mileage_state, loc_cache, imei, param, dt_tracker, fuel_value, calibration, formula, ignition_bit):
    """
    Trip-based mileage (Ignition ON -> Ignition OFF).
    While ignition is ON, accumulate:
      - distance_km (from lat/lng haversine, filtered for GPS jitter)
      - consumed_liters (sum of small fuel decreases; ignores refuel increases and big sensor jumps)
    When ignition turns OFF, record one segment + email:
      km_per_l = distance_km / consumed_liters
    """
    key = f"{imei}:{param}"
    trip = mileage_state.get(key)

    loc = get_location_at(cursor, imei, dt_tracker, loc_cache)
    if not loc:
        return

    lat, lng, speed = loc["lat"], loc["lng"], loc["speed"]
    if lat is None or lng is None:
        return

    # Normalize legacy state (older "segment" format) into a fresh trip.
    if trip and isinstance(trip, dict) and trip.get("active") not in (True, False):
        trip = None

    def _start_trip():
        mileage_state[key] = {
            "active": True,
            "start_dt": dt_tracker.strftime("%Y-%m-%d %H:%M:%S"),
            "start_fuel": float(fuel_value),
            "distance_km": 0.0,
            "consumed_liters": 0.0,
            "last_dt": dt_tracker.strftime("%Y-%m-%d %H:%M:%S"),
            "last_lat": float(lat),
            "last_lng": float(lng),
            "last_fuel": float(fuel_value),
        }

    # Ignition OFF: close trip if active
    if int(ignition_bit or 0) == 0:
        if not (trip and isinstance(trip, dict) and trip.get("active") is True):
            return
        try:
            start_dt = datetime.strptime(trip["start_dt"], "%Y-%m-%d %H:%M:%S")
        except Exception:
            mileage_state.pop(key, None)
            return

        distance_km = float(trip.get("distance_km", 0.0) or 0.0)
        liters_used = float(trip.get("consumed_liters", 0.0) or 0.0)
        if distance_km < TRIP_MIN_DISTANCE_KM or liters_used < TRIP_MIN_LITERS_USED:
            # Not a meaningful trip; drop it quietly.
            mileage_state.pop(key, None)
            return

        km_per_l = distance_km / liters_used if liters_used > 0 else 0.0
        cursor.execute(
            """
            INSERT INTO fuel_mileage_segments (imei, param, start_dt, end_dt, liters_used, distance_km, km_per_l)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                imei,
                param,
                start_dt,
                dt_tracker,
                float(round(liters_used, 3)),
                float(round(distance_km, 3)),
                float(round(km_per_l, 3)),
            ),
        )

        vehicle_name = IMEI_NAME_MAP.get(imei, imei)
        print(f"[MILEAGE] {vehicle_name} ({imei}) {param}: {km_per_l:.2f} km/L over {liters_used:.2f}L, {distance_km:.2f} km (trip)")

        # Optional per-trip mileage email (disabled when you want daily summaries only)
        if ENABLE_TRIP_MILEAGE_EMAILS:
            # Email once per trip end (dedupe per (imei,param,end_dt))
            alert_key = (imei, param)
            end_key = dt_tracker.strftime("%Y-%m-%d %H:%M:%S")
            if already_alerted_mileage.get(alert_key) != end_key and imei in ALERT_IMEIS:
                already_alerted_mileage[alert_key] = end_key
                threading.Thread(
                    target=send_mileage_email,
                    args=(imei, param, start_dt, dt_tracker, liters_used, distance_km, km_per_l, calibration, formula),
                    daemon=True
                ).start()

        mileage_state.pop(key, None)
        return

    # Ignition ON: start or continue trip
    if not (trip and isinstance(trip, dict) and trip.get("active") is True):
        _start_trip()
        return

    # Continue trip
    try:
        last_dt = datetime.strptime(trip["last_dt"], "%Y-%m-%d %H:%M:%S")
    except Exception:
        mileage_state.pop(key, None)
        _start_trip()
        return

    gap_min = abs((dt_tracker - last_dt).total_seconds()) / 60.0
    if gap_min > MILEAGE_MAX_GAP_MINUTES:
        # too old; start new trip window
        mileage_state.pop(key, None)
        _start_trip()
        return

    # distance update (filter GPS jitter and absurd jumps)
    d_km = haversine_km(trip.get("last_lat"), trip.get("last_lng"), lat, lng)
    # Filter GPS jitter and absurd jumps. We don't rely on speed because it can be noisy/zero.
    try:
        min_step = float(MILEAGE_MIN_STEP_DISTANCE_KM)
    except Exception:
        min_step = 0.05
    if min_step <= d_km < 10:
        trip["distance_km"] = float(trip.get("distance_km", 0.0)) + d_km

    # update last point
    trip["last_dt"] = dt_tracker.strftime("%Y-%m-%d %H:%M:%S")
    trip["last_lat"] = float(lat)
    trip["last_lng"] = float(lng)

    last_fuel = float(trip.get("last_fuel", fuel_value))

    # Fuel consumption accumulation:
    # - ignore refuel increases
    # - ignore big sudden drops (sensor jump/noise)
    try:
        drop = float(last_fuel) - float(fuel_value)
    except Exception:
        drop = 0.0

    if drop < 0:
        # refuel happened while ignition ON; don't count negative consumption
        trip["last_fuel"] = float(fuel_value)
        return

    # Big sudden drop between two readings = fuel sensor jump/drift -> do not count
    try:
        max_drop = float(MILEAGE_MAX_LITER_DROP_PER_READING)
    except Exception:
        max_drop = 2.0

    if drop > max_drop:
        # Treat as noise/jump; update baseline only
        trip["last_fuel"] = float(fuel_value)
        return

    # Normal consumption
    trip["consumed_liters"] = float(trip.get("consumed_liters", 0.0)) + float(drop)
    trip["last_fuel"] = float(fuel_value)



def create_alert_table(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fuel_drop_alerts (
            alert_id INT AUTO_INCREMENT PRIMARY KEY,
            imei VARCHAR(30),
            previous_fuel FLOAT,
            current_fuel FLOAT,
            drop_amount FLOAT,
            dt_tracker DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fuel_rise_alerts (
            alert_id INT AUTO_INCREMENT PRIMARY KEY,
            imei VARCHAR(30),
            previous_fuel FLOAT,
            current_fuel FLOAT,
            rise_amount FLOAT,
            dt_tracker DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fuel_mileage_segments (
            segment_id INT AUTO_INCREMENT PRIMARY KEY,
            imei VARCHAR(30),
            param VARCHAR(20),
            start_dt DATETIME,
            end_dt DATETIME,
            liters_used FLOAT,
            distance_km FLOAT,
            km_per_l FLOAT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fuel_low_alerts (
            alert_id INT AUTO_INCREMENT PRIMARY KEY,
            imei VARCHAR(30),
            fuel_value FLOAT,
            dt_tracker DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS fuel_daily_trip_summaries (
            summary_id INT AUTO_INCREMENT PRIMARY KEY,
            imei VARCHAR(30) NOT NULL,
            report_date DATE NOT NULL,
            trip_count INT NOT NULL,
            total_distance_km FLOAT NOT NULL,
            total_liters_used FLOAT NOT NULL,
            overall_km_per_l FLOAT NOT NULL,
            emailed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_imei_date (imei, report_date)
        )
    """)

def plot_fuel_graph(imei, event_time, calibration, cursor, param_to_use=None, event_label="Event Time", title_context="Event", formula_to_use=None) -> str:
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter

    table_name = f"gs_object_data_{imei}"
    start_time = event_time - timedelta(hours=1)
    end_time = event_time + timedelta(hours=1)

    cursor.execute(f"""
        SELECT dt_tracker, params, speed FROM {table_name}
        WHERE dt_tracker BETWEEN %s AND %s
        ORDER BY dt_tracker
    """, (start_time, end_time))
    rows = cursor.fetchall()

    times, fuel_values, speed_values = [], [], []

    for row in rows:
        dt = row['dt_tracker']
        try:
            params = json.loads(row['params']) if row['params'] else {}
        except:
            continue

        fuel = None
        if param_to_use:
            if param_to_use in params:
                try:
                    voltage = float(params[param_to_use])
                    scaled_value = apply_sensor_formula(voltage, formula_to_use)
                    fuel = voltage_to_fuel(scaled_value, calibration)
                except:
                    fuel = None
        else:
            for param in ('fuel1', 'io327'):
                if param in params:
                    try:
                        voltage = float(params[param])
                        scaled_value = apply_sensor_formula(voltage, formula_to_use if param == param_to_use else None)
                        fuel = voltage_to_fuel(scaled_value, calibration)
                        break
                    except:
                        continue

        if fuel is not None:
            times.append(dt + timedelta(hours=5))  # Adjust to PKT
            fuel_values.append(fuel)
            speed_values.append(float(row.get('speed', 0)))

    if not times:
        print(f"[GRAPH] No fuel data found for IMEI {imei} around drop time.")
        return None

    # Create plot
    fig, ax1 = plt.subplots(figsize=(12, 6))
    fig.patch.set_facecolor('#f9f9f9')

    # Fuel line
    ax1.plot(times, fuel_values, color='royalblue', marker='o', label='Fuel Level (L)', linewidth=2)
    ax1.axvline(x=event_time + timedelta(hours=5), color='red', linestyle='--', linewidth=1.5, label=event_label)

    ax1.set_xlabel('Time', fontsize=12)
    ax1.set_ylabel('Fuel (Liters)', color='royalblue', fontsize=12)
    ax1.tick_params(axis='y', labelcolor='royalblue')
    ax1.grid(True, linestyle='--', alpha=0.3)
    ax1.xaxis.set_major_formatter(DateFormatter('%H:%M'))

    # Speed overlay
    ax2 = ax1.twinx()
    ax2.plot(times, speed_values, color='seagreen', linestyle='-', label='Speed (km/h)', linewidth=1.5)
    ax2.set_ylabel('Speed (km/h)', color='seagreen', fontsize=12)
    ax2.tick_params(axis='y', labelcolor='seagreen')

    # Title and legends
    vehicle_name = IMEI_NAME_MAP.get(imei, imei)
    # Avoid emoji glyph warnings on servers without emoji fonts
    plt.title(f"Fuel & Speed Around {title_context} — {vehicle_name}", fontsize=14, fontweight='bold')

    ax1.legend(loc='upper left')
    ax2.legend(loc='upper right')

    plt.xticks(rotation=45)
    fig.tight_layout()

    # Save
    filename = f"fuel_graph_{imei}_{event_time.strftime('%Y%m%d%H%M%S')}.png"
    plt.savefig(filename, dpi=120, bbox_inches='tight')
    plt.close()
    print(f"[GRAPH] Fuel graph saved as: {filename}")
    return filename



def send_fuel_drop_email(imei, param, drop, last_val, fuel_value, dt_tracker, calibration, formula):
    # Create new DB connection for this function
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)

    # Step 1: Get location
    table_name = f"gs_object_data_{imei}"
    cursor.execute(f"SELECT lat, lng, altitude, angle, speed FROM {table_name} WHERE dt_tracker = %s LIMIT 1", (dt_tracker,))
    loc = cursor.fetchone()
    if not loc:
        location_str = "Location not available"
    else:
        lat, lng, altitude, angle, speed = loc['lat'], loc['lng'], loc['altitude'], loc['angle'], loc['speed']
        maps_url = google_maps_link(lat, lng)
        location_str = f"Google Maps: {maps_url}" if maps_url else "Location not available"

        import requests
        api_url = (
            f"http://192.168.20.170/api/api_loc.php?"
            f"imei={imei}&dt={dt_tracker}&lat={lat}&lng={lng}&altitude={altitude}&angle={angle}&speed={speed}&loc_valid=1&event=sos"
        )
        try:
            requests.get(api_url, timeout=5)
            print(f"[API] Location API triggered for IMEI: {imei}")
        except requests.RequestException as e:
            print(f"[ERROR] API call failed: {e}")

    # Step 2: Generate graph
    graph_path = plot_fuel_graph(
        imei,
        dt_tracker,
        calibration,
        cursor,
        param_to_use=param,
        event_label="Drop Time",
        title_context="Drop Time",
        formula_to_use=formula,
    )

    # Step 3: Email setup
    smtp_server = "192.168.20.204"
    port = 587
    sender_email = "broadcast@itecknologi.com"
    password = "Karachi@123"
    receivers = [
        "atif.khatri@itecknologi.com",
        "owais.akhlaq@itecknologi.com",
        "muhammad.anas@itecknologi.com",
        "ahsanrazazaidi182@gmail.com"
    ]

    dt_local = dt_tracker + timedelta(hours=5)
    dt_local_str = dt_local.strftime("%Y-%m-%d %H:%M:%S")
    vehicle_name = IMEI_NAME_MAP.get(imei, imei)

    subject = f"🚨 Fuel Drop Alert Detected for Vehicle [{vehicle_name}] "
    body = f"""
Dear User,

We have detected an unusual fuel drop in one of your vehicles. Please find the details below:
__________________________________________________________

📅 Date & Time of Detection: {dt_local_str}
⛽ Fuel Drop Detected:
• Fuel Level Dropped: {drop:.2f} liters
• Previous Fuel Level: {last_val:.2f} liters
• Current Fuel Level: {fuel_value:.2f} liters

📍 Last Known Location:
{location_str}

__________________________________________________________

Please investigate this alert to ensure vehicle security and prevent fuel theft or leakage.

Best regards,  
iTecknologi Tracking Service Pvt Ltd  
Fuel Monitoring System  
📞 021-111-148-325 ext: 800  
📧 owais.akhlaq@itecknologi.com  
"""

    message = MIMEMultipart()
    message["From"] = sender_email
    message["To"] = ", ".join(receivers)
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    if graph_path and os.path.exists(graph_path):
        with open(graph_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(graph_path)}")
        message.attach(part)

    try:
        server = smtplib.SMTP(smtp_server, port)
        server.starttls()
        server.login(sender_email, password)
        server.sendmail(sender_email, receivers, message.as_string())
        server.quit()
        print(f"[EMAIL] Fuel drop alert email sent for IMEI: {imei}")
    except Exception as e:
        print(f"[ERROR] Failed to send email: {e}")
    finally:
        cursor.close()
        conn.close()

def send_fuel_rise_email(imei, param, rise, last_val, fuel_value, dt_tracker, calibration, formula):
    # Create new DB connection for this function
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)

    # Step 1: Get location
    table_name = f"gs_object_data_{imei}"
    cursor.execute(f"SELECT lat, lng, altitude, angle, speed FROM {table_name} WHERE dt_tracker = %s LIMIT 1", (dt_tracker,))
    loc = cursor.fetchone()
    if not loc:
        location_str = "Location not available"
        speed_str = "N/A"
    else:
        lat, lng, altitude, angle, speed = loc['lat'], loc['lng'], loc['altitude'], loc['angle'], loc['speed']
        try:
            speed_str = f"{float(speed or 0):.1f} km/h"
        except Exception:
            speed_str = "N/A"
        maps_url = google_maps_link(lat, lng)
        location_str = f"Google Maps: {maps_url}" if maps_url else "Location not available"

        import requests
        api_url = (
            f"http://192.168.20.170/api/api_loc.php?"
            f"imei={imei}&dt={dt_tracker}&lat={lat}&lng={lng}&altitude={altitude}&angle={angle}&speed={speed}&loc_valid=1&event=sos"
        )
        try:
            requests.get(api_url, timeout=5)
            print(f"[API] Location API triggered for IMEI: {imei}")
        except requests.RequestException as e:
            print(f"[ERROR] API call failed: {e}")

    # Step 2: Generate graph
    graph_path = plot_fuel_graph(
        imei,
        dt_tracker,
        calibration,
        cursor,
        param_to_use=param,
        event_label="Rise Time",
        title_context="Rise Time",
        formula_to_use=formula,
    )

    # Step 3: Email setup
    smtp_server = "192.168.20.204"
    port = 587
    sender_email = "broadcast@itecknologi.com"
    password = "Karachi@123"
    receivers = [
        "atif.khatri@itecknologi.com",
        "owais.akhlaq@itecknologi.com",
        "muhammad.anas@itecknologi.com",
        "ahsanrazazaidi182@gmail.com"
    ]

    dt_local = dt_tracker + timedelta(hours=5)
    dt_local_str = dt_local.strftime("%Y-%m-%d %H:%M:%S")
    vehicle_name = IMEI_NAME_MAP.get(imei, imei)

    subject = f"⛽ Fuel Rise Alert Detected for Vehicle [{vehicle_name}] "
    body = f"""
Dear User,

We have detected an unusual fuel rise in one of your vehicles. Please find the details below:
__________________________________________________________

📅 Date & Time of Detection: {dt_local_str}
⛽ Fuel Rise Detected:
• Fuel Level Increased: {rise:.2f} liters
• Previous Fuel Level: {last_val:.2f} liters
• Current Fuel Level: {fuel_value:.2f} liters

📍 Last Known Location:
{location_str}

🚗 Speed (at time):
{speed_str}

__________________________________________________________

This may indicate refueling activity or sensor recalibration. Please verify as needed.

Best regards,  
iTecknologi Tracking Service Pvt Ltd  
Fuel Monitoring System  
📞 021-111-148-325 ext: 800  
📧 owais.akhlaq@itecknologi.com  
"""

    message = MIMEMultipart()
    message["From"] = sender_email
    message["To"] = ", ".join(receivers)
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    if graph_path and os.path.exists(graph_path):
        with open(graph_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(graph_path)}")
        message.attach(part)

    try:
        server = smtplib.SMTP(smtp_server, port)
        server.starttls()
        server.login(sender_email, password)
        server.sendmail(sender_email, receivers, message.as_string())
        server.quit()
        print(f"[EMAIL] Fuel rise alert email sent for IMEI: {imei}")
    except Exception as e:
        print(f"[ERROR] Failed to send email: {e}")
    finally:
        cursor.close()
        conn.close()

def send_mileage_email(imei, param, start_dt, end_dt, liters_used, distance_km, km_per_l, calibration, formula):
    """
    Email each time mileage tracker records a >= 1L consumed segment.
    """
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Location at end_dt (best effort)
        table_name = f"gs_object_data_{imei}"
        cursor.execute(f"SELECT lat, lng, altitude, angle, speed FROM {table_name} WHERE dt_tracker = %s LIMIT 1", (end_dt,))
        loc = cursor.fetchone()
        if not loc:
            location_str = "Location not available"
            speed_str = "N/A"
        else:
            lat, lng, altitude, angle, speed = loc['lat'], loc['lng'], loc['altitude'], loc['angle'], loc['speed']
            try:
                speed_str = f"{float(speed or 0):.1f} km/h"
            except Exception:
                speed_str = "N/A"
            maps_url = google_maps_link(lat, lng)
            location_str = f"Google Maps: {maps_url}" if maps_url else "Location not available"

        # Graph around end time (same sensor param)
        graph_path = plot_fuel_graph(
            imei,
            end_dt,
            calibration,
            cursor,
            param_to_use=param,
            event_label="1L Consumed",
            title_context="Mileage Segment",
            formula_to_use=formula,
        )

        smtp_server = "192.168.20.204"
        port = 587
        sender_email = "broadcast@itecknologi.com"
        password = "Karachi@123"
        receivers = [
            "atif.khatri@itecknologi.com",
            "owais.akhlaq@itecknologi.com",
            "muhammad.anas@itecknologi.com",
            "ahsanrazazaidi182@gmail.com"
        ]

        vehicle_name = IMEI_NAME_MAP.get(imei, imei)
        start_local = start_dt + timedelta(hours=5)
        end_local = end_dt + timedelta(hours=5)

        subject = f"📏 Mileage (1L) — {vehicle_name} — {km_per_l:.2f} km/L"
        body = f"""
Dear User,

Vehicle: {vehicle_name}

Start (PKT): {start_local.strftime("%Y-%m-%d %H:%M:%S")}
End (PKT):   {end_local.strftime("%Y-%m-%d %H:%M:%S")}

Fuel used: {liters_used:.2f} L
Distance: {distance_km:.2f} km
Mileage:  {km_per_l:.2f} km/L

Last Known Location (at End):
{location_str}

Speed (at End):
{speed_str}
"""

        message = MIMEMultipart()
        message["From"] = sender_email
        message["To"] = ", ".join(receivers)
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        if graph_path and os.path.exists(graph_path):
            with open(graph_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(graph_path)}")
            message.attach(part)

        server = smtplib.SMTP(smtp_server, port)
        server.starttls()
        server.login(sender_email, password)
        server.sendmail(sender_email, receivers, message.as_string())
        server.quit()
        vehicle_name = IMEI_NAME_MAP.get(imei, imei)
        print(f"[EMAIL] Mileage email sent for vehicle: {vehicle_name}")

    except Exception as e:
        print(f"[ERROR] Failed to send mileage email: {e}")
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

def send_low_fuel_email(imei, fuel_value, dt_tracker, calibration, param, formula):
    """
    Low fuel alarm email when fuel_value <= LOW_FUEL_THRESHOLD.
    (param is only used to generate the correct graph; it is not shown in the email.)
    """
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Location at dt_tracker
        table_name = f"gs_object_data_{imei}"
        cursor.execute(f"SELECT lat, lng, altitude, angle, speed FROM {table_name} WHERE dt_tracker = %s LIMIT 1", (dt_tracker,))
        loc = cursor.fetchone()
        if not loc:
            location_str = "Location not available"
            speed_str = "N/A"
        else:
            lat, lng, altitude, angle, speed = loc['lat'], loc['lng'], loc['altitude'], loc['angle'], loc['speed']
            try:
                speed_str = f"{float(speed or 0):.1f} km/h"
            except Exception:
                speed_str = "N/A"
            maps_url = google_maps_link(lat, lng)
            location_str = f"Google Maps: {maps_url}" if maps_url else "Location not available"

        graph_path = plot_fuel_graph(
            imei,
            dt_tracker,
            calibration,
            cursor,
            param_to_use=param,
            event_label="Low Fuel",
            title_context="Low Fuel",
            formula_to_use=formula,
        )

        smtp_server = "192.168.20.204"
        port = 587
        sender_email = "broadcast@itecknologi.com"
        password = "Karachi@123"
        receivers = [
            "atif.khatri@itecknologi.com",
            "owais.akhlaq@itecknologi.com",
            "muhammad.anas@itecknologi.com",
            "ahsanrazazaidi182@gmail.com"
        ]

        vehicle_name = IMEI_NAME_MAP.get(imei, imei)
        dt_local = dt_tracker + timedelta(hours=5)

        subject = f"⛽ Low Fuel Alarm — {vehicle_name} — {fuel_value:.1f} L"
        body = f"""
Dear User,

Low fuel alarm detected.

Vehicle: {vehicle_name}
Date & Time (PKT): {dt_local.strftime("%Y-%m-%d %H:%M:%S")}
Fuel Level: {fuel_value:.2f} liters (Threshold: {LOW_FUEL_THRESHOLD:.2f} liters)

Last Known Location:
{location_str}

Speed (at time):
{speed_str}
"""

        message = MIMEMultipart()
        message["From"] = sender_email
        message["To"] = ", ".join(receivers)
        message["Subject"] = subject
        message.attach(MIMEText(body, "plain"))

        if graph_path and os.path.exists(graph_path):
            with open(graph_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename={os.path.basename(graph_path)}")
            message.attach(part)

        server = smtplib.SMTP(smtp_server, port)
        server.starttls()
        server.login(sender_email, password)
        server.sendmail(sender_email, receivers, message.as_string())
        server.quit()
        print(f"[EMAIL] Low fuel alarm email sent for vehicle: {vehicle_name}")

    except Exception as e:
        print(f"[ERROR] Failed to send low fuel email: {e}")
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

def is_fake_spike(cursor, imei, dt_tracker, calibration, param, formula):
    try:
        table_name = f"gs_object_data_{imei}"
        check_start = dt_tracker - timedelta(minutes=SPIKE_WINDOW_MINUTES)
        check_end = dt_tracker + timedelta(minutes=SPIKE_WINDOW_MINUTES)

        cursor.execute(f"""
            SELECT dt_tracker, params, speed FROM {table_name}
            WHERE dt_tracker BETWEEN %s AND %s
            ORDER BY dt_tracker ASC
        """, (check_start, check_end))

        rows = cursor.fetchall()
        fuel_readings = []

        for row in rows:
            try:
                params = json.loads(row["params"]) if row["params"] else {}
                try:
                    sp = float(row.get("speed", 0) or 0)
                except Exception:
                    sp = 0.0
                # Speed veto: only apply to rows AFTER the detected event time.
                # Rows BEFORE dt_tracker are from the vehicle approaching/driving — that is
                # normal and should not disqualify a real fuel drop that happened after parking.
                row_dt = row.get("dt_tracker")
                is_after_event = row_dt is not None and row_dt > dt_tracker
                if is_after_event and sp > DROP_GATING_MAX_SPEED_KMH:
                    print(f"[SKIP] Drop window (post-event) contains speed>{DROP_GATING_MAX_SPEED_KMH}. Treating as spike/noise.")
                    # #region agent log
                    import json as _jmvd, time as _tmvd; _lp='/home/bilalabdulrahman/aysis/debug.log'
                    try:
                        open(_lp,'a').write(_jmvd.dumps({"hypothesisId":"C3-movement-veto-drop","location":"aysis-latest.py:is_fake_spike:movement_veto","timestamp":int(_tmvd.time()*1000),"message":"DROP blocked by post-event speed veto","data":{"imei":imei,"param":param,"row_dt":str(row_dt),"speed":sp,"drop_gating_max":DROP_GATING_MAX_SPEED_KMH,"event_dt":str(dt_tracker)}})+'\n')
                    except Exception as _e: open(_lp,'a').write(_jmvd.dumps({"hypothesisId":"C3-movement-veto-drop","location":"aysis-latest.py:is_fake_spike:movement_veto","timestamp":int(_tmvd.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
                    # #endregion
                    return True
                voltage = float(params.get(param, 0))
                scaled_value = apply_sensor_formula(voltage, formula)
                fuel = voltage_to_fuel(scaled_value, calibration)
                if fuel is not None:
                    fuel_readings.append((row['dt_tracker'], fuel))
            except Exception as e:
                print(f"[ERROR] While parsing fuel in is_fake_spike: {e}")
                traceback.print_exc()
                continue

        if not fuel_readings:
            print(f"[SPIKE CHECK] No fuel readings found for IMEI: {imei}")
            return False

        start_time, start_fuel = fuel_readings[0]
        final_time, final_fuel = fuel_readings[-1]
        drop_amount = start_fuel - final_fuel

        if final_fuel >= start_fuel:
            print(f"[SPIKE DETECTED] Fuel dropped and recovered fully or exceeded: {start_fuel:.2f} → {final_fuel:.2f}")
            return True
        elif abs(final_fuel - start_fuel) <= DROP_THRESHOLD:
            print(f"[SPIKE DETECTED] Fuel dropped but nearly recovered: {start_fuel:.2f} → {final_fuel:.2f}")
            return True

        for i in range(len(fuel_readings) - 1):
            t1, f1 = fuel_readings[i]
            t2, f2 = fuel_readings[i + 1]
            delta = f1 - f2
            if delta >= DROP_THRESHOLD:
                stayed_low = all(abs(f3 - f1) > DROP_THRESHOLD for _, f3 in fuel_readings[i+1:])
                if stayed_low:
                    print(f"[REAL DROP] Sudden drop {f1:.2f} → {f2:.2f} at {t2}, and stayed low")
                    return False
                else:
                    print(f"[FAKE SPIKE] Sudden drop but fuel returned near previous after {t2}")
                    return True

        print(f"[REAL DROP] No recovery & no fake spike pattern. Fuel drop confirmed.")
        return False

    except Exception as e:
        print(f"[SPIKE CHECK ERROR] IMEI: {imei}, Error: {e}")
        traceback.print_exc()
        return False

def is_fake_rise(cursor, imei, dt_tracker, calibration, param, formula):
    """
    Inverse of is_fake_spike: identify "rise then quickly falls back" patterns (noise).
    Returns True if the rise looks fake/spiky, False if it appears to be a real rise (stays high).
    """
    try:
        table_name = f"gs_object_data_{imei}"
        check_start = dt_tracker - timedelta(minutes=SPIKE_WINDOW_MINUTES)
        check_end = dt_tracker + timedelta(minutes=SPIKE_WINDOW_MINUTES)

        cursor.execute(f"""
            SELECT dt_tracker, params, speed FROM {table_name}
            WHERE dt_tracker BETWEEN %s AND %s
            ORDER BY dt_tracker ASC
        """, (check_start, check_end))

        rows = cursor.fetchall()
        fuel_readings = []

        for row in rows:
            try:
                params = json.loads(row["params"]) if row["params"] else {}
                try:
                    sp = float(row.get("speed", 0) or 0)
                except Exception:
                    sp = 0.0
                # Movement veto: only apply to rows AFTER the detected event time.
                # Rows BEFORE dt_tracker are from the vehicle driving to the fuel station — that is
                # normal and should not disqualify a real refuel that happened after the vehicle stopped.
                row_dt = row.get("dt_tracker")
                is_after_event = row_dt is not None and row_dt > dt_tracker
                if is_after_event and _safe_int_bit(params, "io240", default=1) == 1 and sp > RISE_GATING_MAX_SPEED_KMH:
                    print(f"[SKIP] Rise window (post-event) contains movement (io240=1) with speed>{RISE_GATING_MAX_SPEED_KMH}. Treating as spike/noise.")
                    # #region agent log
                    import json as _jmvr, time as _tmvr; _lp='/home/bilalabdulrahman/aysis/debug.log'
                    try:
                        open(_lp,'a').write(_jmvr.dumps({"hypothesisId":"C4-movement-veto-rise","location":"aysis-latest.py:is_fake_rise:movement_veto","timestamp":int(_tmvr.time()*1000),"message":"RISE blocked by post-event movement veto","data":{"imei":imei,"param":param,"row_dt":str(row_dt),"speed":sp,"io240":_safe_int_bit(params,"io240",default=1),"rise_gating_max":RISE_GATING_MAX_SPEED_KMH,"event_dt":str(dt_tracker)}})+'\n')
                    except Exception as _e: open(_lp,'a').write(_jmvr.dumps({"hypothesisId":"C4-movement-veto-rise","location":"aysis-latest.py:is_fake_rise:movement_veto","timestamp":int(_tmvr.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
                    # #endregion
                    return True
                voltage = float(params.get(param, 0))
                scaled_value = apply_sensor_formula(voltage, formula)
                fuel = voltage_to_fuel(scaled_value, calibration)
                if fuel is not None:
                    fuel_readings.append((row['dt_tracker'], fuel))
            except Exception as e:
                print(f"[ERROR] While parsing fuel in is_fake_rise: {e}")
                traceback.print_exc()
                continue

        if not fuel_readings:
            print(f"[RISE CHECK] No fuel readings found for IMEI: {imei}")
            return False

        start_time, start_fuel = fuel_readings[0]
        final_time, final_fuel = fuel_readings[-1]

        if final_fuel <= start_fuel:
            print(f"[RISE SPIKE DETECTED] Fuel rose and fell back or lower: {start_fuel:.2f} → {final_fuel:.2f}")
            return True
        elif abs(final_fuel - start_fuel) <= RISE_THRESHOLD:
            print(f"[RISE SPIKE DETECTED] Fuel rose but did not stay high: {start_fuel:.2f} → {final_fuel:.2f}")
            return True

        for i in range(len(fuel_readings) - 1):
            t1, f1 = fuel_readings[i]
            t2, f2 = fuel_readings[i + 1]
            delta = f2 - f1
            if delta >= RISE_THRESHOLD:
                stayed_high = all(abs(f3 - f1) > RISE_THRESHOLD for _, f3 in fuel_readings[i+1:])
                if stayed_high:
                    print(f"[REAL RISE] Sudden rise {f1:.2f} → {f2:.2f} at {t2}, and stayed high")
                    return False
                else:
                    print(f"[FAKE RISE] Sudden rise but fuel returned near previous after {t2}")
                    return True

        print(f"[REAL RISE] No fall-back & no fake rise pattern. Fuel rise confirmed.")
        return False

    except Exception as e:
        print(f"[RISE CHECK ERROR] IMEI: {imei}, Error: {e}")
        traceback.print_exc()
        return False

def is_recovery_rise(cursor, imei, dt_tracker, calibration, param, formula, baseline_fuel, peak_fuel) -> bool:
    """
    Detect "dip then recover" patterns: fuel was already near the final/peak level shortly BEFORE dt_tracker,
    then dipped (baseline) and came back up. That's usually a sensor jerk, not a real refuel.
    Returns True if this looks like a recovery (skip refuel), else False.
    """
    try:
        table_name = f"gs_object_data_{imei}"
        lookback_min = int(RISE_RECOVERY_LOOKBACK_MINUTES or 0)
        if lookback_min <= 0:
            return False
        check_start = dt_tracker - timedelta(minutes=lookback_min)
        check_end = dt_tracker

        cursor.execute(
            f"""
            SELECT dt_tracker, params
            FROM {table_name}
            WHERE dt_tracker BETWEEN %s AND %s
            ORDER BY dt_tracker ASC
            """,
            (check_start, check_end),
        )
        rows = cursor.fetchall() or []
        if not rows:
            return False

        fuels = []
        for row in rows:
            try:
                params = json.loads(row.get("params")) if row.get("params") else {}
                voltage = float(params.get(param, 0))
                scaled_value = apply_sensor_formula(voltage, formula)
                f = voltage_to_fuel(scaled_value, calibration)
                if f is None:
                    continue
                fuels.append(float(f))
            except Exception:
                continue

        if len(fuels) < 3:
            return False

        pre_max = max(fuels)
        pre_min = min(fuels)

        eps = float(RISE_RECOVERY_EPS_LITERS or 0.0)
        # Condition:
        # - there was already a value near peak before the "rise" time (pre_max close to peak),
        # - and there was a dip in that lookback window (pre_min close to baseline),
        # - and the swing is large (>= RISE_THRESHOLD).
        if pre_max >= float(peak_fuel) - eps and pre_min <= float(baseline_fuel) + eps and (pre_max - pre_min) >= float(RISE_THRESHOLD):
            print(f"[SKIP] Recovery rise detected (dip then return): IMEI={imei} pre_max={pre_max:.2f} pre_min={pre_min:.2f} baseline={baseline_fuel:.2f} peak={peak_fuel:.2f}")
            return True

        return False
    except Exception as e:
        print(f"[RECOVERY RISE CHECK ERROR] IMEI={imei} err={e}")
        return False




# def handle_fuel_drop(imei, param, last_val, voltage, dt_tracker, calibration):
#     conn = get_mysql_connection()
#     cursor = conn.cursor(dictionary=True)
#
#     try:
#         print(f"[THREAD] Waiting 6 mins to confirm drop for IMEI: {imei}")
#         time.sleep(360)
#
#         cursor.execute("SELECT * FROM gs_objects WHERE imei = %s", (imei,))
#         new_obj = cursor.fetchone()
#         if not new_obj:
#             return
#
#         new_params = json.loads(new_obj['params']) if new_obj['params'] else {}
#         new_voltage = float(new_params.get(param, voltage))
#         new_fuel = voltage_to_fuel(new_voltage, calibration)
#
#         # ✅ Debug print before condition
#         print(f"[DEBUG] IMEI={imei} | last_val={last_val}, new_voltage={new_voltage}, new_fuel={new_fuel}")
#
#         if new_fuel is None:
#             print(f"[SKIP] Calibration failed for IMEI={imei}, voltage={new_voltage}")
#             return
#
#         drop_confirmed = new_fuel < last_val and abs(last_val - new_fuel) >= DROP_THRESHOLD
#
#         if not drop_confirmed:
#             print(f"[SKIP] Not a valid drop: IMEI={imei}, Previous={last_val:.2f}, Current={new_fuel:.2f}")
#             return
#
#         if is_fake_spike(cursor, imei, dt_tracker, calibration, param):
#             print(f"[SKIP] Spike pattern confirmed after revalidation for IMEI: {imei}")
#             return
#
#         # if already_alerted.get(imei) == round(new_fuel, 1):
#         #     print(f"[SKIP] Already alerted for IMEI={imei} at fuel={new_fuel:.2f}")
#         #     return
#
#         already_alerted_record = already_alerted.get(imei)
#         if already_alerted_record:
#             last_alert_fuel = already_alerted_record['fuel']
#             last_alert_time = datetime.strptime(already_alerted_record['dt'], "%Y-%m-%d %H:%M:%S")
#             fuel_diff = abs(new_fuel - last_alert_fuel)
#             time_diff = abs((dt_tracker - last_alert_time).total_seconds())
#
#             if fuel_diff < 0.5 or time_diff < 300:
#                 print(
#                     f"[SKIP] Duplicate alert blocked for IMEI={imei} | Fuel diff={fuel_diff:.2f} | Time diff={time_diff}s")
#                 return
#
#         # Save alert & send email
#         cursor.execute("""
#             INSERT INTO fuel_drop_alerts (imei, previous_fuel, current_fuel, drop_amount, dt_tracker)
#             VALUES (%s, %s, %s, %s, %s)
#         """, (imei, last_val, new_fuel, last_val - new_fuel, dt_tracker))
#         conn.commit()
#
#         print(f"[ALERT] Drop detected: IMEI={imei}, {(last_val - new_fuel):.2f}L at {new_obj['dt_tracker']}")
#
#         if imei in ALERT_IMEIS:
#             send_fuel_drop_email(imei, last_val - new_fuel, last_val, new_fuel, dt_tracker, calibration)
#
#         already_alerted[imei] = {
#             'fuel': round(new_fuel, 1),
#             'dt': dt_tracker.strftime("%Y-%m-%d %H:%M:%S")
#         }
#
#         # already_alerted[imei] = round(new_fuel, 1)
#
#     except Exception as e:
#         print(f"[THREAD ERROR] IMEI: {imei}, Error: {e}")
#         traceback.print_exc()  # ✅ Print full stack trace
#     finally:
#         cursor.close()
#         conn.close()
#         processing_drops.discard((imei, dt_tracker.strftime("%Y-%m-%d %H:%M:%S")))

def handle_fuel_drop(imei, param, last_val, voltage, dt_tracker, calibration, formula):
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        delay_min = max(1, int(round(VERIFY_DELAY_SECONDS / 60)))
        print(f"[THREAD] Waiting ~{delay_min} min(s) to confirm drop for IMEI: {imei}")
        time.sleep(VERIFY_DELAY_SECONDS)

        cursor.execute("SELECT * FROM gs_objects WHERE imei = %s LIMIT 1", (imei,))
        new_obj = cursor.fetchone()
        if not new_obj:
            return

        new_params = json.loads(new_obj['params']) if new_obj['params'] else {}
        # Gate: only alert if ignition off/no-movement OR stable idle
        ignition_bit = _safe_int_bit(new_params, "io239", default=1)
        movement_bit = _safe_int_bit(new_params, "io240", default=1)
        loc_cache = {}
        speed_kmh = _get_speed_kmh(cursor, imei, new_obj.get("dt_tracker", dt_tracker), loc_cache)
        if not _is_allowed_for_fuel_drop_alarm(imei, param, new_obj.get("dt_tracker", dt_tracker), ignition_bit, movement_bit, speed_kmh):
            print(f"[SKIP] Drop verification cancelled (moving/ignition on): IMEI={imei} io239={ignition_bit} io240={movement_bit} speed={speed_kmh:.1f}")
            return
        new_voltage = float(new_params.get(param, voltage))
        new_scaled_value = apply_sensor_formula(new_voltage, formula)
        new_fuel = voltage_to_fuel(new_scaled_value, calibration)

        print(f"[DEBUG] IMEI={imei} | last_val={last_val}, new_voltage={new_voltage}, new_fuel={new_fuel}")

        if new_fuel is None:
            print(f"[SKIP] Calibration failed for IMEI={imei}, voltage={new_voltage}")
            return

        drop_confirmed = new_fuel < last_val and abs(last_val - new_fuel) >= DROP_THRESHOLD

        # #region agent log
        import json as _jfd, time as _tfd; _lp='/home/bilalabdulrahman/aysis/debug.log'
        try:
            open(_lp,'a').write(_jfd.dumps({"hypothesisId":"C-drop-thread","location":"aysis-latest.py:handle_fuel_drop:post_verify","timestamp":int(_tfd.time()*1000),"message":"Drop thread post-verify","data":{"imei":imei,"param":param,"last_val":round(float(last_val),2),"new_fuel":round(float(new_fuel),2),"drop_confirmed":drop_confirmed,"ignition_bit":ignition_bit,"movement_bit":movement_bit,"speed_kmh":round(speed_kmh,1)}})+'\n')
        except Exception as _e: open(_lp,'a').write(_jfd.dumps({"hypothesisId":"C-drop-thread","location":"aysis-latest.py:handle_fuel_drop:post_verify","timestamp":int(_tfd.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
        # #endregion

        if not drop_confirmed:
            print(f"[SKIP] Not a valid drop: IMEI={imei}, Previous={last_val:.2f}, Current={new_fuel:.2f}")
            return

        _fake_spike_result = is_fake_spike(cursor, imei, dt_tracker, calibration, param, formula)
        # #region agent log
        import json as _jfs, time as _tfs; _lp='/home/bilalabdulrahman/aysis/debug.log'
        try:
            open(_lp,'a').write(_jfs.dumps({"hypothesisId":"C2-fake-spike","location":"aysis-latest.py:handle_fuel_drop:is_fake_spike","timestamp":int(_tfs.time()*1000),"message":"is_fake_spike result","data":{"imei":imei,"param":param,"is_fake_spike":_fake_spike_result,"last_val":round(float(last_val),2),"new_fuel":round(float(new_fuel),2)}})+'\n')
        except Exception as _e: open(_lp,'a').write(_jfs.dumps({"hypothesisId":"C2-fake-spike","location":"aysis-latest.py:handle_fuel_drop:is_fake_spike","timestamp":int(_tfs.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
        # #endregion
        if _fake_spike_result:
            print(f"[SKIP] Spike pattern confirmed after revalidation for IMEI: {imei}")
            return

        # Post-confirm verification: if it snaps back up shortly after, treat as sensor glitch (fake drop).
        try:
            post_wait = int(POST_DROP_VERIFY_SECONDS or 0)
        except Exception:
            post_wait = 0
        if post_wait > 0:
            time.sleep(post_wait)
            try:
                cursor.execute("SELECT * FROM gs_objects WHERE imei = %s LIMIT 1", (imei,))
                v_obj = cursor.fetchone()
                if v_obj:
                    v_params = json.loads(v_obj['params']) if v_obj.get('params') else {}
                    try:
                        v_voltage = float(v_params.get(param, new_voltage))
                    except Exception:
                        v_voltage = new_voltage
                    v_scaled_value = apply_sensor_formula(v_voltage, formula)
                    v_fuel = voltage_to_fuel(v_scaled_value, calibration)
                    if v_fuel is not None:
                        v_fuel = float(v_fuel)
                        eps = float(POST_DROP_VERIFY_EPS_LITERS or 0.0)
                        # #region agent log
                        import json as _jpd, time as _tpd; _lp='/home/bilalabdulrahman/aysis/debug.log'
                        try:
                            open(_lp,'a').write(_jpd.dumps({"hypothesisId":"D-post-drop-verify","location":"aysis-latest.py:handle_fuel_drop:post_drop_verify","timestamp":int(_tpd.time()*1000),"message":"Post drop verify result","data":{"imei":imei,"param":param,"last_val":round(float(last_val),2),"new_fuel":round(float(new_fuel),2),"v_fuel":round(v_fuel,2),"eps":eps,"recovered":v_fuel>=float(last_val)-eps}})+'\n')
                        except Exception as _e: open(_lp,'a').write(_jpd.dumps({"hypothesisId":"D-post-drop-verify","location":"aysis-latest.py:handle_fuel_drop:post_drop_verify","timestamp":int(_tpd.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
                        # #endregion
                        # If it recovered close to baseline, skip the drop alert as fake/noise.
                        if v_fuel >= float(last_val) - eps:
                            print(f"[SKIP] Drop recovered after confirm window (fake jerk): IMEI={imei} baseline={last_val:.2f} verify={v_fuel:.2f} eps={eps:.2f}")
                            return
            except Exception as e:
                print(f"[POST DROP VERIFY ERROR] IMEI={imei} param={param}: {e}")

        # --- ⏳ Expiry Logic: Reset if older than 15 minutes
        alert_key = (imei, param)
        already_alerted_record = already_alerted.get(alert_key)
        if already_alerted_record:
            last_alert_time = datetime.strptime(already_alerted_record['dt'], "%Y-%m-%d %H:%M:%S")
            if (dt_tracker - last_alert_time).total_seconds() > 900:  # 15 minutes
                already_alerted.pop(alert_key, None)
                already_alerted_record = None

        # --- ❌ Duplicate Alert Check
        if already_alerted_record:
            last_alert_fuel = already_alerted_record['fuel']
            last_alert_time = datetime.strptime(already_alerted_record['dt'], "%Y-%m-%d %H:%M:%S")
            fuel_diff = abs(new_fuel - last_alert_fuel)
            time_diff = abs((dt_tracker - last_alert_time).total_seconds())

            if fuel_diff < 0.5 or time_diff < 300:
                print(f"[SKIP] Duplicate alert blocked for IMEI={imei} | Fuel diff={fuel_diff:.2f} | Time diff={time_diff}s")
                return

        # --- ✅ Save to DB & Send Email
        cursor.execute("""
            INSERT INTO fuel_drop_alerts (imei, previous_fuel, current_fuel, drop_amount, dt_tracker)
            VALUES (%s, %s, %s, %s, %s)
        """, (imei, last_val, new_fuel, last_val - new_fuel, dt_tracker))
        conn.commit()

        print(f"[ALERT] Drop detected: IMEI={imei}, {(last_val - new_fuel):.2f}L at {new_obj['dt_tracker']}")

        if imei in ALERT_IMEIS:
            send_fuel_drop_email(imei, param, last_val - new_fuel, last_val, new_fuel, dt_tracker, calibration, formula)

        # --- 🔐 Record this alert
        already_alerted[alert_key] = {
            'fuel': round(new_fuel, 1),
            'dt': dt_tracker.strftime("%Y-%m-%d %H:%M:%S")
        }

    except Exception as e:
        print(f"[THREAD ERROR] IMEI: {imei}, Error: {e}")
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()
        processing_drops.discard((imei, param, dt_tracker.strftime("%Y-%m-%d %H:%M:%S")))

def handle_fuel_rise(imei, param, last_val, voltage, dt_tracker, calibration, formula):
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        delay_min = max(1, int(round(VERIFY_DELAY_SECONDS / 60)))
        print(f"[THREAD] Waiting ~{delay_min} min(s) to confirm rise for IMEI: {imei}")
        time.sleep(VERIFY_DELAY_SECONDS)

        cursor.execute("SELECT * FROM gs_objects WHERE imei = %s LIMIT 1", (imei,))
        new_obj = cursor.fetchone()
        if not new_obj:
            return

        new_params = json.loads(new_obj['params']) if new_obj['params'] else {}
        # Gate: only alert if ignition off/no-movement OR stable idle
        ignition_bit = _safe_int_bit(new_params, "io239", default=1)
        movement_bit = _safe_int_bit(new_params, "io240", default=1)
        loc_cache = {}
        speed_kmh = _get_speed_kmh(cursor, imei, new_obj.get("dt_tracker", dt_tracker), loc_cache)
        if not _is_allowed_for_fuel_rise_alarm(imei, param, new_obj.get("dt_tracker", dt_tracker), ignition_bit, movement_bit, speed_kmh):
            print(f"[SKIP] Rise verification cancelled (High Speed): IMEI={imei} speed={speed_kmh:.1f} (limit={RISE_GATING_MAX_SPEED_KMH})")
            return
        new_voltage = float(new_params.get(param, voltage))
        new_scaled_value = apply_sensor_formula(new_voltage, formula)
        new_fuel = voltage_to_fuel(new_scaled_value, calibration)

        print(f"[DEBUG] (RISE) IMEI={imei} | last_val={last_val}, new_voltage={new_voltage}, new_fuel={new_fuel}")

        if new_fuel is None:
            print(f"[SKIP] (RISE) Calibration failed for IMEI={imei}, voltage={new_voltage}")
            return

        rise_confirmed = new_fuel > last_val and abs(new_fuel - last_val) >= RISE_THRESHOLD
        if not rise_confirmed:
            print(f"[SKIP] Not a valid rise: IMEI={imei}, Previous={last_val:.2f}, Current={new_fuel:.2f}")
            return

        if is_fake_rise(cursor, imei, dt_tracker, calibration, param, formula):
            print(f"[SKIP] Rise spike pattern confirmed after revalidation for IMEI: {imei}")
            return

        # #region agent log
        import json as _jrc, time as _trc; _lp='/home/bilalabdulrahman/aysis/debug.log'
        try:
            open(_lp,'a').write(_jrc.dumps({"hypothesisId":"E-rise-thread","location":"aysis-latest.py:handle_fuel_rise:post_fake_rise","timestamp":int(_trc.time()*1000),"message":"Rise thread passed fake-rise check, entering consolidation","data":{"imei":imei,"param":param,"last_val":round(float(last_val),2),"new_fuel":round(float(new_fuel),2),"rise_confirmed":rise_confirmed}})+ '\n')
        except Exception as _e: open(_lp,'a').write(_jrc.dumps({"hypothesisId":"E-rise-thread","location":"aysis-latest.py:handle_fuel_rise:post_fake_rise","timestamp":int(_trc.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
        # #endregion

        # --- ⏳ Expiry Logic: Reset if older than 15 minutes
        alert_key = (imei, param)
        already_alerted_record = already_alerted_rise.get(alert_key)
        if already_alerted_record:
            last_alert_time = datetime.strptime(already_alerted_record['dt'], "%Y-%m-%d %H:%M:%S")
            if (dt_tracker - last_alert_time).total_seconds() > 900:  # 15 minutes
                already_alerted_rise.pop(alert_key, None)
                already_alerted_record = None

        # --- ❌ Duplicate Alert Check
        if already_alerted_record:
            last_alert_fuel = already_alerted_record['fuel']
            last_alert_time = datetime.strptime(already_alerted_record['dt'], "%Y-%m-%d %H:%M:%S")
            fuel_diff = abs(new_fuel - last_alert_fuel)
            time_diff = abs((dt_tracker - last_alert_time).total_seconds())
            if fuel_diff < 0.5 or time_diff < 300:
                print(f"[SKIP] Duplicate rise alert blocked for IMEI={imei} | Fuel diff={fuel_diff:.2f} | Time diff={time_diff}s")
                return

        # Consolidate refuel: track peak fuel until it stabilizes, then send ONE rise alert.
        baseline_fuel = float(last_val)
        peak_fuel = float(new_fuel)
        peak_dt = new_obj.get("dt_tracker", dt_tracker)

        stable_for = 0
        tracked = 0
        while tracked < REFUEL_MAX_TRACK_SECONDS:
            time.sleep(max(5, int(REFUEL_POLL_SECONDS)))
            tracked += max(5, int(REFUEL_POLL_SECONDS))

            cursor.execute("SELECT * FROM gs_objects WHERE imei = %s LIMIT 1", (imei,))
            cur_obj = cursor.fetchone()
            if not cur_obj:
                break

            cur_params = json.loads(cur_obj['params']) if cur_obj['params'] else {}
            try:
                cur_voltage = float(cur_params.get(param, new_voltage))
            except Exception:
                cur_voltage = new_voltage
            cur_scaled_value = apply_sensor_formula(cur_voltage, formula)
            cur_fuel = voltage_to_fuel(cur_scaled_value, calibration)
            if cur_fuel is None:
                continue

            cur_fuel = float(cur_fuel)
            if cur_fuel > peak_fuel + REFUEL_EPS_LITERS:
                peak_fuel = cur_fuel
                peak_dt = cur_obj.get("dt_tracker", peak_dt)
                stable_for = 0
            else:
                stable_for += max(5, int(REFUEL_POLL_SECONDS))

            if stable_for >= REFUEL_STABLE_SECONDS:
                break

        # Post-stability verification: wait and ensure it doesn't fall back (fake jerk).
        try:
            post_wait = int(POST_REFUEL_VERIFY_SECONDS or 0)
        except Exception:
            post_wait = 0
        if post_wait > 0:
            time.sleep(post_wait)
            try:
                cursor.execute("SELECT * FROM gs_objects WHERE imei = %s LIMIT 1", (imei,))
                v_obj = cursor.fetchone()
                if v_obj:
                    v_params = json.loads(v_obj['params']) if v_obj.get('params') else {}
                    try:
                        v_voltage = float(v_params.get(param, new_voltage))
                    except Exception:
                        v_voltage = new_voltage
                    v_scaled_value = apply_sensor_formula(v_voltage, formula)
                    v_fuel = voltage_to_fuel(v_scaled_value, calibration)
                    if v_fuel is not None:
                        v_fuel = float(v_fuel)
                        eps = float(POST_REFUEL_VERIFY_EPS_LITERS or 0.0)
                        # If it fell back notably from the peak, treat as fake jerk/spike.
                        if v_fuel < float(peak_fuel) - eps:
                            print(f"[SKIP] Refuel fell back after stable window (fake jerk): IMEI={imei} peak={peak_fuel:.2f} verify={v_fuel:.2f} eps={eps:.2f}")
                            return
            except Exception as e:
                print(f"[POST VERIFY ERROR] IMEI={imei} param={param}: {e}")

        rise_amount_final = float(peak_fuel) - float(baseline_fuel)
        if rise_amount_final < RISE_THRESHOLD:
            print(f"[SKIP] Consolidated rise below threshold: IMEI={imei}, Rise={rise_amount_final:.2f}L")
            return

        # If this "rise" is actually just recovery back to earlier normal level (dip then return), skip.
        if is_recovery_rise(cursor, imei, dt_tracker, calibration, param, formula, baseline_fuel, peak_fuel):
            return

        # --- ✅ Save to DB & Send Email (once, using baseline->peak)
        cursor.execute("""
            INSERT INTO fuel_rise_alerts (imei, previous_fuel, current_fuel, rise_amount, dt_tracker)
            VALUES (%s, %s, %s, %s, %s)
        """, (imei, baseline_fuel, peak_fuel, rise_amount_final, peak_dt))
        conn.commit()

        print(f"[ALERT] Rise detected (consolidated): IMEI={imei}, {rise_amount_final:.2f}L at {peak_dt}")

        if ENABLE_FUEL_RISE_ALERTS and imei in ALERT_IMEIS:
            # Geofence check: Log polygon status but send email regardless of location
            try:
                table_name = f"gs_object_data_{imei}"
                cursor.execute(
                    f"SELECT lat, lng FROM {table_name} WHERE dt_tracker = %s LIMIT 1",
                    (peak_dt,),
                )
                loc = cursor.fetchone() or {}
                # #region agent log
                import json as _jfr, time as _tfr; _lp='/home/bilalabdulrahman/aysis/debug.log'
                try:
                    _in_poly = _is_in_any_rise_polygon(loc.get("lat"), loc.get("lng"))
                    open(_lp,'a').write(_jfr.dumps({"hypothesisId":"A-geofence","location":"aysis-latest.py:handle_fuel_rise:geofence","timestamp":int(_tfr.time()*1000),"message":"Rise geofence check","data":{"imei":imei,"param":param,"baseline_fuel":round(float(baseline_fuel),2),"peak_fuel":round(float(peak_fuel),2),"rise_amount_final":round(float(rise_amount_final),2),"lat":str(loc.get("lat")),"lng":str(loc.get("lng")),"in_polygon":_in_poly,"polygon_list":list(POLYGON_LIST.keys())}})+'\n')
                except Exception as _e: open(_lp,'a').write(_jfr.dumps({"hypothesisId":"A-geofence","location":"aysis-latest.py:handle_fuel_rise:geofence","timestamp":int(_tfr.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
                # #endregion
                # Send email regardless of polygon location
                _in_poly = _is_in_any_rise_polygon(loc.get("lat"), loc.get("lng"))
                send_fuel_rise_email(imei, param, rise_amount_final, baseline_fuel, peak_fuel, peak_dt, calibration, formula)
                if not _in_poly:
                    print(f"[INFO] Rise email sent (outside Qayumabad polygon): IMEI={imei} lat={loc.get('lat')} lng={loc.get('lng')} dt={peak_dt}")
            except Exception as e:
                print(f"[GEOFENCE ERROR] Rise email check failed: IMEI={imei} dt={peak_dt} err={e}")

        # --- 🔐 Record this alert
        already_alerted_rise[alert_key] = {
            'fuel': round(peak_fuel, 1),
            'dt': peak_dt.strftime("%Y-%m-%d %H:%M:%S") if hasattr(peak_dt, "strftime") else str(peak_dt),
        }

    except Exception as e:
        print(f"[THREAD ERROR] (RISE) IMEI: {imei}, Error: {e}")
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()
        # Ensure these are cleaned up atomically to avoid racey double-spawns
        with _refuel_lock:
            processing_rises.discard((imei, param, dt_tracker.strftime("%Y-%m-%d %H:%M:%S")))
            processing_refuels.discard((imei, param))

def monitor_fuel_drop():
    conn = get_mysql_connection()
    cursor = conn.cursor(dictionary=True)
    create_alert_table(cursor)
    last_fuel_data = load_last_state()
    mileage_state = load_mileage_state()

    while True:
        try:
            # Daily summaries are computed from DB segments, so restarts won't miss them.
            try:
                maybe_send_daily_trip_summaries(conn, cursor)
            except Exception as e:
                print(f"[DAILY SUMMARY ERROR] {e}")

            loc_cache = {}
            cursor.execute("""
                SELECT * FROM gs_object_sensors
                WHERE param IN ('fuel1', 'io327') 
                AND calibration IS NOT NULL 
                AND TRIM(calibration) <> '[]'
            """)
            sensors = cursor.fetchall()

            for sensor in sensors:
                imei = sensor['imei']
                param = sensor['param']
                if imei not in ALERT_IMEIS:
                    continue  # Only monitor the hard-coded IMEIs above.
                calibration = parse_calibration(sensor['calibration'])
                formula = sensor.get('formula')

                if not calibration:
                    continue

                cursor.execute("SELECT * FROM gs_objects WHERE imei = %s LIMIT 1", (imei,))
                obj = cursor.fetchone()
                if not obj:
                    continue

                dt_tracker = obj['dt_tracker']
                params = json.loads(obj['params']) if obj['params'] else {}

                if param not in params:
                    continue

                try:
                    voltage = float(params[param])
                except ValueError:
                    continue

                scaled_value = apply_sensor_formula(voltage, formula)
                fuel_value = voltage_to_fuel(scaled_value, calibration)
                if fuel_value is None:
                    continue

                # Raw value for graphs/mileage, filtered value for alarms/state to suppress jerks.
                fuel_value_raw = float(fuel_value)
                fuel_value_alarm = _filter_fuel_for_alarms(imei, param, dt_tracker, fuel_value_raw)
                if fuel_value_alarm is None:
                    continue

                # Update idle tracker from io239/io240 + speed
                ignition_bit = _safe_int_bit(params, "io239", default=1)
                movement_bit = _safe_int_bit(params, "io240", default=1)
                speed_kmh = _get_speed_kmh(cursor, imei, dt_tracker, loc_cache)
                _update_idle_tracker(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh)

                # Low fuel alarm: if fuel <= threshold, send max 1 email per vehicle per hour
                try:
                    last_record_for_low = get_last_record(last_fuel_data, imei, param)
                    if last_record_for_low and float(fuel_value_alarm) <= LOW_FUEL_THRESHOLD:
                        now_key = dt_tracker.strftime("%Y-%m-%d %H:%M:%S")
                        last_sent = already_alerted_low_fuel.get(imei)

                        allow_send = True
                        if last_sent:
                            try:
                                last_sent_dt = datetime.strptime(last_sent, "%Y-%m-%d %H:%M:%S")
                                if abs((dt_tracker - last_sent_dt).total_seconds()) < (LOW_FUEL_DEDUPE_MINUTES * 60):
                                    allow_send = False
                            except Exception:
                                allow_send = True

                        if allow_send:
                            already_alerted_low_fuel[imei] = now_key
                            cursor.execute(
                                "INSERT INTO fuel_low_alerts (imei, fuel_value, dt_tracker) VALUES (%s, %s, %s)",
                                (imei, float(fuel_value_alarm), dt_tracker),
                            )
                            conn.commit()
                            threading.Thread(
                                target=send_low_fuel_email,
                                args=(imei, float(fuel_value_alarm), dt_tracker, calibration, param, formula),
                                daemon=True
                            ).start()
                except Exception as e:
                    print(f"[LOW FUEL ERROR] IMEI={imei} param={param}: {e}")
                    traceback.print_exc()

                # Mileage tracking (Ignition ON -> OFF trip)
                try:
                    update_mileage_segment(cursor, mileage_state, loc_cache, imei, param, dt_tracker, fuel_value_raw, calibration, formula, ignition_bit)
                except Exception as e:
                    print(f"[MILEAGE ERROR] IMEI={imei} param={param}: {e}")
                    traceback.print_exc()

                last_record = get_last_record(last_fuel_data, imei, param)
                if last_record:
                    last_val = last_record["fuel"]
                    last_time = datetime.strptime(last_record["dt_tracker"], "%Y-%m-%d %H:%M:%S")
                    time_diff = dt_tracker - last_time
                    drop = last_val - fuel_value_alarm

                    # #region agent log
                    import json as _jd, time as _td; _lp='/home/bilalabdulrahman/aysis/debug.log'
                    try:
                        _allowed_drop = _is_allowed_for_fuel_drop_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh)
                        open(_lp,'a').write(_jd.dumps({"hypothesisId":"B-D","location":"aysis-latest.py:monitor_drop_check","timestamp":int(_td.time()*1000),"message":"Drop check result","data":{"imei":imei,"param":param,"last_val":round(float(last_val),2),"fuel_alarm":round(float(fuel_value_alarm),2),"drop":round(float(drop),2),"threshold":DROP_THRESHOLD,"time_diff_min":round(time_diff.total_seconds()/60,2),"ignition_bit":ignition_bit,"movement_bit":movement_bit,"speed_kmh":round(speed_kmh,1),"drop_ge_threshold":drop>=DROP_THRESHOLD,"time_ok":time_diff<=timedelta(minutes=35),"allowed_for_drop":_allowed_drop,"already_processing":str((imei,param,dt_tracker.strftime("%Y-%m-%d %H:%M:%S")))in str(processing_drops)}})+'\n')
                    except Exception as _e: open(_lp,'a').write(_jd.dumps({"hypothesisId":"B-D","location":"aysis-latest.py:monitor_drop_check","timestamp":int(_td.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
                    # #endregion

                    if time_diff <= timedelta(minutes=35) and drop >= DROP_THRESHOLD:
                        if _is_allowed_for_fuel_drop_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh):
                            print(f"[DETECTED] Suspected drop for IMEI: {imei}, spawning thread.")
                            drop_key = (imei, param, dt_tracker.strftime("%Y-%m-%d %H:%M:%S"))
                            if drop_key not in processing_drops:
                                processing_drops.add(drop_key)
                                threading.Thread(
                                    target=handle_fuel_drop,
                                    args=(imei, param, last_val, voltage, dt_tracker, calibration, formula),
                                    daemon=True
                                ).start()
                        else:
                            print(f"[SKIP] Drop ignored (moving/ignition on): IMEI={imei} io239={ignition_bit} io240={movement_bit} speed={speed_kmh:.1f}")

                    if ENABLE_FUEL_RISE_ALERTS:
                        rise = fuel_value_alarm - last_val
                        # #region agent log
                        import json as _jr, time as _tr; _lp='/home/bilalabdulrahman/aysis/debug.log'
                        try:
                            _allowed_rise = _is_allowed_for_fuel_rise_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh)
                            open(_lp,'a').write(_jr.dumps({"hypothesisId":"B-D-rise","location":"aysis-latest.py:monitor_rise_check","timestamp":int(_tr.time()*1000),"message":"Rise check result","data":{"imei":imei,"param":param,"last_val":round(float(last_val),2),"fuel_alarm":round(float(fuel_value_alarm),2),"rise":round(float(rise),2),"threshold":RISE_THRESHOLD,"time_diff_min":round(time_diff.total_seconds()/60,2),"ignition_bit":ignition_bit,"movement_bit":movement_bit,"speed_kmh":round(speed_kmh,1),"rise_ge_threshold":rise>=RISE_THRESHOLD,"time_ok":time_diff<=timedelta(minutes=35),"allowed_for_rise":_allowed_rise,"refuel_active":(imei,param)in processing_refuels}})+'\n')
                        except Exception as _e: open(_lp,'a').write(_jr.dumps({"hypothesisId":"B-D-rise","location":"aysis-latest.py:monitor_rise_check","timestamp":int(_tr.time()*1000),"message":"LOG ERROR","data":{"err":str(_e)}})+'\n')
                        # #endregion
                        if time_diff <= timedelta(minutes=35) and rise >= RISE_THRESHOLD:
                            if _is_allowed_for_fuel_rise_alarm(imei, param, dt_tracker, ignition_bit, movement_bit, speed_kmh):
                                print(f"[DETECTED] Suspected rise for IMEI: {imei}, spawning thread.")
                                rise_key = (imei, param, dt_tracker.strftime("%Y-%m-%d %H:%M:%S"))
                                should_start = False
                                with _refuel_lock:
                                    if (imei, param) in processing_refuels:
                                        print(f"[SKIP] Rise already tracking refuel for IMEI={imei} param={param}")
                                    elif rise_key in processing_rises:
                                        # Same dt_tracker already queued/processing
                                        pass
                                    else:
                                        # Start exactly one consolidation thread per (imei,param)
                                        processing_refuels.add((imei, param))
                                        processing_rises.add(rise_key)
                                        should_start = True

                                if should_start:
                                    threading.Thread(
                                        target=handle_fuel_rise,
                                        args=(imei, param, last_val, voltage, dt_tracker, calibration, formula),
                                        daemon=True
                                    ).start()
                            else:
                                print(f"[SKIP] Rise ignored (moving/ignition on): IMEI={imei} io239={ignition_bit} io240={movement_bit} speed={speed_kmh:.1f}")

                # Update last-known state per (imei, param) so we never mix fuel1 vs io327.
                # When fuel drops below threshold, HOLD the baseline for up to 10 minutes
                # so gradual/stepped drains are measured from the original higher level.
                existing = get_last_record(last_fuel_data, imei, param)
                if not existing:
                    set_last_record(last_fuel_data, imei, param, float(fuel_value_alarm), dt_tracker)
                elif dt_tracker > datetime.strptime(existing["dt_tracker"], "%Y-%m-%d %H:%M:%S"):
                    prev_fuel = float(existing["fuel"])
                    prev_time = datetime.strptime(existing["dt_tracker"], "%Y-%m-%d %H:%M:%S")
                    baseline_age = (dt_tracker - prev_time).total_seconds()
                    if fuel_value_alarm < prev_fuel and (prev_fuel - fuel_value_alarm) < DROP_THRESHOLD and baseline_age <= 600:
                        # Small drop within 10-min window: hold old baseline to detect cumulative drops
                        pass
                    else:
                        set_last_record(last_fuel_data, imei, param, float(fuel_value_alarm), dt_tracker)

            save_last_state(last_fuel_data)
            save_mileage_state(mileage_state)
            time.sleep(CHECK_INTERVAL)

        except mysql.connector.errors.InternalError as e:
            # Most common cause: "Unread result found" due to duplicate rows. Recover by reconnecting.
            print(f"[MYSQL RECOVER] InternalError: {e}. Reconnecting and continuing...")
            try:
                cursor.close()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(2)
            conn = get_mysql_connection()
            cursor = conn.cursor(dictionary=True)
            continue
        except mysql.connector.Error as e:
            print(f"[MYSQL RECOVER] MySQL error: {e}. Reconnecting and continuing...")
            try:
                cursor.close()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(2)
            conn = get_mysql_connection()
            cursor = conn.cursor(dictionary=True)
            continue
        except Exception as e:
            print(f"[ERROR] monitor_fuel_drop loop error: {e}")
            traceback.print_exc()
            time.sleep(2)
            continue




monitor_fuel_drop()
