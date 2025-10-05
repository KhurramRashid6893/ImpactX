from __future__ import annotations
import functions_framework

# ============================================
# Meteor Madness - Flask Backend (Extended)
# Folium Impact Map + Reverse Geocode + Session persist
# ============================================

from flask import Flask, render_template, jsonify, request, session, Response
import math
import requests
import datetime
import google.generativeai as genai
import json
import os
import time
from typing import List, Dict, Any, Optional, Tuple
from requests_cache import CachedSession

# Optional: Folium for impact visualization (server-side map)
try:
    import folium
except Exception:
    folium = None

# --------------------------------------------
# Flask Initialization
# --------------------------------------------
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-aione")

# --------------------------------------------
# Configuration / API Keys
# --------------------------------------------

# NASA
NASA_API_KEY = os.getenv("NASA_API_KEY", "kyEL8vr6ELgMBpO0tvqWU4pUJQY6vq3VNzdcoqDv")
NEO_API_URL = "https://api.nasa.gov/neo/rest/v1/feed"

# Gemini (Google) - rotation
GEMINI_API_KEYS: List[str] = [
    os.getenv("GEMINI_API_KEY_1", "AIzaSyBK_HgT50xaDwG22mhIXj56Nu1FLtRUn1k"),
    os.getenv("GEMINI_API_KEY_2", "AIzaSyD4WPqh0BNOGmwy9TCinChk7fffWWl5nsU"),
    os.getenv("GEMINI_API_KEY_3", "AIzaSyCix_QOd0xyagkQx81K4-mG7wgOdxm9adQ"),
    os.getenv("GEMINI_API_KEY_4", "AIzaSyBPusVyHoEU1TT2FVCQvVbpEyWTqbezAsY"),
]
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Weather (OpenWeatherMap) - rotation
WEATHER_API_KEYS: List[str] = [
    os.getenv("OPENWEATHER_KEY_1", "db83f392c85c123d055ccf38a08b1bbe"),
    os.getenv("OPENWEATHER_KEY_2", "91a117fb9b77add436ed5765d40b5e03"),
    os.getenv("OPENWEATHER_KEY_3", "PLACEHOLDER_OPENWEATHER_KEY_3"),
    os.getenv("OPENWEATHER_KEY_4", "PLACEHOLDER_OPENWEATHER_KEY_4"),
]
WEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather"

# Google Maps Elevation (fallback)
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "AIzaSyDiEFsjjAl_9_-b8v90Cm-dmZbSJsmv42I")
GOOGLE_ELEVATION_API_URL = "https://maps.googleapis.com/maps/api/elevation/json"

# Nominatim (OpenStreetMap) for reverse geocoding (rate-limited; be gentle)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_UA = os.getenv("NOMINATIM_UA", "meteor-madness-app/1.0 (contact: you@example.com)")

# --------------------------------------------
# Cache for NASA NEO (12 hours)
# --------------------------------------------
session_cache = CachedSession("neo_cache", expire_after=datetime.timedelta(hours=12))

# --------------------------------------------
# Physics Constants
# --------------------------------------------
PI = 3.14159
ASTEROID_DENSITY = 3000             # kg/m^3 (stony)
TARGET_DENSITY_LAND = 2700          # kg/m^3
TARGET_DENSITY_WATER = 1025         # kg/m^3
GRAVITY = 9.81
AVG_OCEAN_DEPTH = 4000              # m (used in tsunami scaling)
BASE_POP_DENSITY_SQKM = 150         # avg. population density
MU_EARTH = 3.986004418e14           # m^3/s^2
R_EARTH = 6371000                   # m

# --------------------------------------------
# Helpers
# --------------------------------------------
def safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def get_gemini_response_with_retry(prompt: str) -> str:
    """
    Try Gemini keys in order. Skip placeholders.
    Raise with a clear message if all fail.
    """
    last_error: Optional[Exception] = None
    for i, api_key in enumerate(GEMINI_API_KEYS):
        if not api_key or "PLACEHOLDER" in api_key:
            app.logger.info(f"[Gemini] Skipping placeholder/empty key at index {i}.")
            continue
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(DEFAULT_GEMINI_MODEL)
            response = model.generate_content(prompt)
            app.logger.info(f"[Gemini] Success with key index {i}.")
            return response.text or ""
        except Exception as e:
            app.logger.warning(f"[Gemini] Error with key index {i}: {e}. Trying next...")
            last_error = e
            continue
    raise RuntimeError(f"All Gemini API keys failed. Last error: {last_error}")

def openweather_with_rotation(lat: str, lon: str, units: str = "metric") -> Dict[str, Any]:
    """
    Try OpenWeather keys in order. Rotate on 401/429.
    """
    params_base = {"lat": lat, "lon": lon, "units": units}
    last_status = None
    last_text = None
    for i, key in enumerate(WEATHER_API_KEYS):
        if not key or "PLACEHOLDER" in key:
            app.logger.info(f"[Weather] Skipping placeholder/empty key at index {i}.")
            continue
        params = dict(params_base)
        params["appid"] = key
        try:
            resp = requests.get(WEATHER_API_URL, params=params, timeout=7)
            last_status = resp.status_code
            last_text = resp.text
            if resp.status_code == 200:
                app.logger.info(f"[Weather] Success with key index {i}.")
                return resp.json()
            if resp.status_code in (401, 429):
                app.logger.warning(f"[Weather] Key index {i} returned {resp.status_code}. Rotating...")
                continue
            app.logger.error(f"[Weather] API error {resp.status_code} with key index {i}: {resp.text[:200]}")
            raise RuntimeError(f"Weather API error {resp.status_code}: {resp.text[:400]}")
        except requests.exceptions.RequestException as e:
            app.logger.error(f"[Weather] Network error with key index {i}: {e}")
            continue
    raise RuntimeError(f"All OpenWeather keys failed. Last status={last_status}, body={str(last_text)[:400]}")

def get_elevation(lat: float, lon: float) -> float:
    """
    Fetch elevation using USGS EPQS; fallback to Google Elevation.
    Returns elevation (m).
    """
    usgs_url = f"https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&units=Meters&output=json"
    try:
        response = requests.get(usgs_url, timeout=5)
        response.raise_for_status()
        data = response.json()
        elevation = data.get("value")
        if elevation is not None:
            return float(elevation)
    except Exception as e:
        app.logger.warning(f"USGS EPQS failed: {e}. Falling back to Google Elevation API.")

    params = {"locations": f"{lat},{lon}", "key": GOOGLE_MAPS_API_KEY}
    try:
        response = requests.get(GOOGLE_ELEVATION_API_URL, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        if data.get("status") == "OK" and data.get("results"):
            return float(data["results"][0]["elevation"])
    except Exception as e:
        app.logger.error(f"Google Elevation API failed: {e}")

    return 0.0

def kepler_to_cartesian(a: float, e: float, i: float, omega_asc: float, omega_peri: float, nu: float) -> float:
    """
    Kepler → velocity magnitude (km/s)
    """
    a_m = a * 1000
    i_rad = math.radians(i)
    omega_asc_rad = math.radians(omega_asc)
    omega_peri_rad = math.radians(omega_peri)
    nu_rad = math.radians(nu)

    r_mag = a_m * (1 - e**2) / (1 + e * math.cos(nu_rad))
    _h_mag = math.sqrt(MU_EARTH * a_m * (1 - e**2))

    p_x = r_mag * math.cos(nu_rad)
    p_y = r_mag * math.sin(nu_rad)
    p_z = 0.0

    v_x = -math.sqrt(MU_EARTH / (a_m * (1 - e**2))) * math.sin(nu_rad)
    v_y =  math.sqrt(MU_EARTH / (a_m * (1 - e**2))) * (e + math.cos(nu_rad))
    v_z = 0.0

    Rz_omega_asc = [
        [math.cos(-omega_asc_rad), -math.sin(-omega_asc_rad), 0],
        [math.sin(-omega_asc_rad),  math.cos(-omega_asc_rad), 0],
        [0, 0, 1],
    ]
    Rx_i = [
        [1, 0, 0],
        [0, math.cos(-i_rad), -math.sin(-i_rad)],
        [0, math.sin(-i_rad),  math.cos(-i_rad)],
    ]
    Rz_omega_peri = [
        [math.cos(-omega_peri_rad), -math.sin(-omega_peri_rad), 0],
        [math.sin(-omega_peri_rad),  math.cos(-omega_peri_rad), 0],
        [0, 0, 1],
    ]

    # R = Rz(-Ω) * Rx(-i) * Rz(-ω)
    def matmul(A, B):
        C = [[0.0, 0.0, 0.0] for _ in range(3)]
        for r in range(3):
            for c in range(3):
                C[r][c] = A[r][0]*B[0][c] + A[r][1]*B[1][c] + A[r][2]*B[2][c]
        return C

    R1 = matmul(Rz_omega_peri, Rx_i)
    R = matmul(R1, Rz_omega_asc)

    pos_peri = [p_x, p_y, p_z]
    vel_peri = [v_x, v_y, v_z]

    def apply(R, v):
        return [
            R[0][0]*v[0] + R[0][1]*v[1] + R[0][2]*v[2],
            R[1][0]*v[0] + R[1][1]*v[1] + R[1][2]*v[2],
            R[2][0]*v[0] + R[2][1]*v[1] + R[2][2]*v[2],
        ]

    vel_eci = apply(R, vel_peri)
    velocity_mag_ms = math.sqrt(vel_eci[0]**2 + vel_eci[1]**2 + vel_eci[2]**2)
    return velocity_mag_ms / 1000.0

def reverse_geocode(lat: float, lon: float) -> Dict[str, Any]:
    """
    Server-side Nominatim reverse geocode with UA.
    """
    try:
        headers = {"User-Agent": NOMINATIM_UA}
        params = {"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 10, "addressdetails": 1}
        r = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=6)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        app.logger.warning(f"[Nominatim] Reverse geocode failed: {e}")
        return {"error": str(e)}

# --------------------------------------------
# Page Routes
# --------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/simulation")
def simulation():
    return render_template("simulation.html")

@app.route("/impact")
def impact():
    # Keep template as-is; your frontend can embed the Folium map via <iframe src="/impact_map?...">
    return render_template("impact.html", GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY)

@app.route("/mitigation")
def mitigation():
    return render_template("mitigation.html")

@app.route("/resources")
def resources():
    return render_template("resources.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/defend")
def defend():
    return render_template("defend.html")

@app.route("/learn")
def learn():
    return render_template("learn.html")

# --------------------------------------------
# API: NASA NEO (with cache)
# --------------------------------------------
@app.route("/get_neos")
def get_neos():
    today = datetime.date.today()
    start_date = today.strftime("%Y-%m-%d")
    end_date = (today + datetime.timedelta(days=7)).strftime("%Y-%m-%d")

    params = {"start_date": start_date, "end_date": end_date, "api_key": NASA_API_KEY}
    try:
        response = session_cache.get(NEO_API_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if getattr(response, "from_cache", False):
            app.logger.info("NASA NEO data served from cache.")
        else:
            app.logger.info("NASA NEO data fetched fresh and cached.")
    except requests.exceptions.RequestException as e:
        app.logger.warning(f"NASA API live fetch failed: {e}. Trying cache fallback...")
        try:
            prepared = session_cache.prepare_request(requests.Request("GET", NEO_API_URL, params=params))
            cached_response = session_cache.cache.get_response(prepared)
            if cached_response:
                data = json.loads(cached_response.content.decode())
                app.logger.info("NASA NEO data loaded from cache fallback.")
            else:
                return jsonify({"error": "Could not fetch live data and no cache available."}), 502
        except Exception as cache_e:
            app.logger.error(f"Cache fallback failed: {cache_e}")
            return jsonify({"error": "Could not fetch live data and cache is unavailable."}), 502

    neo_list = []
    for _, neos in data.get("near_earth_objects", {}).items():
        for neo in neos:
            try:
                est = neo.get("estimated_diameter", {}).get("meters", {})
                dmin = est.get("estimated_diameter_min")
                dmax = est.get("estimated_diameter_max")
                diameter_m = None
                if dmin is not None and dmax is not None:
                    diameter_m = round((float(dmin) + float(dmax)) / 2.0, 2)

                cad0 = neo.get("close_approach_data", [{}])[0]
                rel_v = cad0.get("relative_velocity", {}).get("kilometers_per_second", "0")
                velocity_km_s = round(float(rel_v), 2)

                neo_list.append({
                    "id": neo.get("id"),
                    "name": neo.get("name"),
                    "diameter_m": diameter_m,
                    "velocity_km_s": velocity_km_s,
                    "is_hazardous": bool(neo.get("is_potentially_hazardous_asteroid", False)),
                })
            except Exception:
                continue
    return jsonify(neo_list)

# --------------------------------------------
# API: USGS & NOAA Data Integration
# --------------------------------------------
@app.route("/api/dem/elevation")
def get_dem_elevation():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if not lat or not lon:
        return jsonify({"error": "lat and lon parameters are required."}), 400
    return jsonify({"elevation": get_elevation(float(lat), float(lon))})

@app.route("/api/seismic/history")
def get_seismic_history():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    radius_km = request.args.get("radius_km", "300")
    start = request.args.get("start", "1970-01-01")
    minmag = request.args.get("minmag", "4.5")

    if not lat or not lon:
        return jsonify({"error": "lat and lon parameters are required."}), 400

    params = {
        "format": "geojson",
        "starttime": start,
        "endtime": datetime.date.today().strftime("%Y-%m-%d"),
        "latitude": lat,
        "longitude": lon,
        "maxradiuskm": radius_km,
        "minmagnitude": minmag,
    }
    try:
        response = requests.get("https://earthquake.usgs.gov/fdsnws/event/1/query", params=params, timeout=10)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Failed to fetch seismic data: {e}"}), 500

@app.route("/api/tsunami/layer")
def get_tsunami_layer():
    return jsonify({
        "url": "https://ngdc.noaa.gov/wms/wcs/wms",
        "layer": "etopo1",
        "parameters": {
            "service": "WMS",
            "version": "1.1.1",
            "request": "GetMap",
            "styles": "gray",
            "format": "image/png",
            "transparent": "true",
        },
    })

# --------------------------------------------
# API: Physics Simulation (Upgraded)
# --------------------------------------------
@app.route("/simulate", methods=["POST"])
def run_simulation():
    """
    Runs the asteroid impact physics simulation.
    Tsunami now uses constant depth instead of fetching elevation.
    """
    data = request.get_json(silent=True) or {}

    diameter = safe_float(data.get("size"), 0.0)
    velocity_km_s = safe_float(data.get("speed"), 0.0)
    angle_deg = safe_float(data.get("angle"), 0.0)
    impact_lat = safe_float(data.get("lat"), 0.0)
    impact_lng = safe_float(data.get("lng"), 0.0)

    # If orbital elements provided, compute velocity from Keplerian
    if all(k in data for k in ["a", "e", "i", "omega_asc", "omega_peri", "nu"]):
        a = safe_float(data.get("a"), 0.0)
        e = safe_float(data.get("e"), 0.0)
        i = safe_float(data.get("i"), 0.0)
        omega_asc = safe_float(data.get("omega_asc"), 0.0)
        omega_peri = safe_float(data.get("omega_peri"), 0.0)
        nu = safe_float(data.get("nu"), 0.0)
        try:
            velocity_km_s = kepler_to_cartesian(a, e, i, omega_asc, omega_peri, nu)
        except Exception as e:
            app.logger.error(f"Keplerian conversion failed: {e}")
            velocity_km_s = 0.0

    velocity = velocity_km_s * 1000.0
    angle_rad = math.radians(angle_deg)

    # --- CHANGED HERE ---
    # Instead of fetching elevation/depth, use constant average ocean depth
    location = "ocean"
    depth_m = AVG_OCEAN_DEPTH
    # ---------------------

    radius = max(diameter / 2.0, 0.0)
    volume = (4.0 / 3.0) * PI * (radius ** 3)
    mass = ASTEROID_DENSITY * volume
    kinetic_energy = 0.5 * mass * (velocity ** 2)
    energy_mt = kinetic_energy / 4.184e15

    target_density = TARGET_DENSITY_WATER if location in ("ocean", "coastal") else TARGET_DENSITY_LAND

    # Holsapple-Schmidt crater scaling (simplified)
    try:
        crater_diameter_m = (
            1.161
            * (target_density / ASTEROID_DENSITY) ** (1.0 / 3.0)
            * (diameter ** 0.78)
            * (max(velocity, 1.0) ** 0.44)
            * (max(math.sin(angle_rad), 0.1) ** (1.0 / 3.0))
        )
    except Exception:
        crater_diameter_m = 0.0

    crater_diameter_km = crater_diameter_m / 1000.0

    # Seismic magnitude (empirical)
    seismic_magnitude = 0.0
    if kinetic_energy > 0:
        try:
            seismic_magnitude = 0.67 * math.log10(kinetic_energy) - 5.87
        except Exception:
            seismic_magnitude = 0.0

    # Tsunami (always uses constant depth now)
    tsunami_height = 0.0
    if location in ("ocean", "coastal") and depth_m >= 0:
        try:
            tsunami_height = 8.5 * (max(energy_mt, 0.0) ** 0.5) * (max(depth_m, 1.0) / 4000.0) ** -0.25
        except Exception:
            tsunami_height = 0.0

    # Blast radius (very simplified)
    blast_radius_km = 0.0
    try:
        blast_radius_km = 3.0 * (max(energy_mt, 0.0) ** 0.33)
    except Exception:
        blast_radius_km = 0.0

    affected_population = int(PI * (blast_radius_km ** 2) * BASE_POP_DENSITY_SQKM)

    results = {
        "energy": round(energy_mt, 2),
        "crater_diameter": round(crater_diameter_km, 2),
        "seismic_magnitude": max(0.0, round(seismic_magnitude, 1)),
        "tsunami_height": round(tsunami_height, 1),
        "blast_radius": round(blast_radius_km, 2),
        "affected_population": affected_population,
        "impact_lat": impact_lat,
        "impact_lng": impact_lng,
        "impact_location_type": location,
        "elevation_m": round(depth_m, 2),  # report constant depth as elevation
        "velocity_km_s": round(velocity_km_s, 2),
        "asteroid_size_m": round(diameter, 2),
    }

    # Save to session
    try:
        session["last_simulation"] = results
    except Exception as e:
        app.logger.warning(f"Could not store simulation in session: {e}")

    return jsonify(results)
# --------------------------------------------
# API: Chatbot (Gemini with rotation)
# --------------------------------------------
@app.route("/chatbot", methods=["POST"])
def chatbot_api():
    try:
        data = request.get_json(silent=True) or {}
        user_message = (data.get("message") or "").strip()
        if not user_message:
            return jsonify({"error": "Empty message"}), 400

        prompt = f"""
You are 'Sentinel AI', a friendly and professional public safety assistant for the NASA-powered 'Meteor Madness' asteroid application. Your primary goal is to provide clear, actionable advice and easily understandable facts about asteroid threats, planetary defense, and local safety precautions. Act as a resource on NEOs, impact science, and preparedness.

Keep your responses concise, encouraging, and focused on public preparedness. Always link technical terms back to real-world implications.

User Query: {user_message}
"""
        response_text = get_gemini_response_with_retry(prompt)
        return jsonify({"response": response_text})
    except Exception as e:
        app.logger.error(f"Sentinel AI Chatbot error: {e}")
        return jsonify({"error": f"Sentinel AI is offline. {e}"}), 502

# --------------------------------------------
# API: Impact Explanation (AI)
# --------------------------------------------
@app.route("/ai_explain_impact", methods=["POST"])
def ai_explain_impact():
    try:
        data = request.get_json(silent=True) or {}
        prompt = f"""
Analyze the following asteroid impact simulation results and generate a concise, human-readable safety advisory.
Focus on the immediate dangers and 3-5 clear, actionable public safety steps.

--- SIMULATION DATA ---
Energy Release (MT): {data.get('energy', 'N/A')}
Crater Diameter (km): {data.get('crater_diameter', 'N/A')}
Seismic Magnitude (Richter): {data.get('seismic_magnitude', 'N/A')}
Blast Radius (km): {data.get('blast_radius', 'N/A')}
Tsunami Height (m): {data.get('tsunami_height', 'N/A')}
Affected Population (Est.): {data.get('affected_population', 'N/A')}
-------------------------

ADVISORY TASK:
1. Summarize the greatest threat (e.g., Blast, Tsunami, Seismic).
2. State the primary danger zone size clearly in KM.
3. Provide 3-5 steps for immediate public action.
Keep the tone authoritative but calm. Do not use markdown.
"""
        response_text = get_gemini_response_with_retry(prompt)
        return jsonify({"advisory": response_text})
    except Exception as e:
        app.logger.error(f"AI Explainability error: {e}")
        return jsonify({"advisory": "ERROR: Could not generate safety advisory. Please check connection or API key rotation status."}), 502

# --------------------------------------------
# API: Weather (OpenWeather with rotation)
# --------------------------------------------
@app.route("/get_weather", methods=["GET"])
def get_weather():
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if not lat or not lon:
        return jsonify({"error": "Latitude and longitude required"}), 400
    try:
        data = openweather_with_rotation(lat=lat, lon=lon, units="metric")
        weather_data = {
            "name": data.get("name", "Unknown Location"),
            "description": (
                ((data.get("weather") or [{}])[0].get("description", "unknown").capitalize())
                if data.get("weather") else "Unknown"
            ),
            "temp": (data.get("main") or {}).get("temp"),
            "humidity": (data.get("main") or {}).get("humidity"),
            "wind_speed": (data.get("wind") or {}).get("speed"),
        }
        return jsonify(weather_data)
    except RuntimeError as e:
        app.logger.error(f"Weather API error chain: {e}")
        return jsonify({"error": str(e)}), 502
    except Exception as e:
        app.logger.exception("Unexpected weather handler failure")
        return jsonify({"error": f"Unexpected error: {e}"}), 500

# --------------------------------------------
# API: Mitigation Strategies
# --------------------------------------------
@app.route("/api/mitigation/kinetic-impactor", methods=["POST"])
def kinetic_impactor_api():
    data = request.get_json() or {}
    delta_v = safe_float(data.get("delta_v"))
    lead_time_days = safe_float(data.get("lead_time_days"))
    if delta_v <= 0 or lead_time_days <= 0:
        return jsonify({"error": "delta_v and lead_time_days must be positive numbers."}), 400
    deflection_km = delta_v * lead_time_days * 86400 / 1000.0
    return jsonify({"deflection_km": deflection_km})

@app.route("/api/mitigation/gravity-tractor", methods=["POST"])
def gravity_tractor_api():
    data = request.get_json() or {}
    asteroid_mass = safe_float(data.get("asteroid_mass"))
    spacecraft_mass = safe_float(data.get("spacecraft_mass"))
    hover_distance = safe_float(data.get("hover_distance"))
    years = safe_float(data.get("years"))

    if asteroid_mass <= 0 or spacecraft_mass <= 0 or hover_distance <= 0 or years <= 0:
        return jsonify({"error": "All parameters must be positive numbers."}), 400

    G = 6.67430e-11
    force = (G * spacecraft_mass * asteroid_mass) / (hover_distance ** 2)
    acceleration = force / asteroid_mass
    delta_v = acceleration * years * 31536000
    return jsonify({"delta_v_ms": delta_v})

@app.route("/api/mitigation/nuclear-educational", methods=["POST"])
def nuclear_educational_api():
    data = request.get_json() or {}
    yield_mt = safe_float(data.get("yield_mt"))
    if yield_mt <= 0:
        return jsonify({"error": "Yield must be a positive number."}), 400
    fragmentation_probability = min(yield_mt / 1000.0, 1.0)
    estimated_fragments = int(fragmentation_probability * yield_mt)
    return jsonify({
        "fragmentation_probability": fragmentation_probability,
        "estimated_fragments": estimated_fragments,
    })

# --------------------------------------------
# NEW: Reverse Geocoding Proxy (Nominatim)
# --------------------------------------------
@app.route("/api/reverse_geocode")
def api_reverse_geocode():
    lat = safe_float(request.args.get("lat"))
    lon = safe_float(request.args.get("lon"))
    if lat == 0.0 and lon == 0.0 and ("lat" not in request.args or "lon" not in request.args):
        return jsonify({"error": "lat and lon are required"}), 400
    result = reverse_geocode(lat, lon)
    return jsonify(result)

# --------------------------------------------
# NEW: Folium Impact Map Endpoint
# --------------------------------------------
def _build_folium_map(lat: float, lon: float, blast_km: float, crater_km: float, tsunami_m: float) -> str:
    """
    Builds a Folium map HTML string with crater, blast, and optional tsunami overlays.
    """
    if folium is None:
        # If Folium is not installed, show a basic HTML warning page
        return f"""
        <html><head><meta charset="utf-8"><title>Folium Missing</title></head>
        <body style="font-family: sans-serif; background:#0b001a; color:#fff;">
          <h2>Folium Not Installed</h2>
          <p>Install with <code>pip install folium</code> to enable server-side map rendering.</p>
          <p>Requested location: ({lat:.4f}, {lon:.4f})</p>
        </body></html>
        """

    # Centered map
    m = folium.Map(
        location=[lat, lon],
        zoom_start=6,
        tiles="CartoDB dark_matter",  # nice dark theme
        control_scale=True,
    )

    # Reverse geocode for nicer popup text (best effort only)
    display_line = f"Lat: {lat:.4f}, Lon: {lon:.4f}"
    try:
        geo = reverse_geocode(lat, lon)
        if isinstance(geo, dict) and "display_name" in geo:
            display_line = geo["display_name"]
    except Exception:
        pass

    # Ground Zero Marker
    folium.Marker(
        [lat, lon],
        tooltip="Ground Zero",
        popup=folium.Popup(f"<b>Impact Point</b><br>{display_line}", max_width=300),
        icon=folium.Icon(color="red", icon="info-sign"),
    ).add_to(m)

    # Crater Circle (inner)
    crater_radius_m = max(crater_km, 0.0) * 1000.0 / 2.0  # crater_diameter/2
    if crater_radius_m > 0:
        folium.Circle(
            radius=crater_radius_m,
            location=[lat, lon],
            color="#e81d1d",
            weight=2,
            fill=True,
            fill_opacity=0.5,
            popup=f"Crater radius: {(crater_radius_m/1000.0):.2f} km",
        ).add_to(m)

    # Blast Circle (outer)
    blast_radius_m = max(blast_km, 0.0) * 1000.0
    if blast_radius_m > 0:
        folium.Circle(
            radius=blast_radius_m,
            location=[lat, lon],
            color="#ff8c00",
            weight=2,
            fill=True,
            fill_opacity=0.15,
            popup=f"Blast radius: {blast_km:.2f} km",
        ).add_to(m)

    # Tsunami crude ring for demo (fixed 200 km if tsunami present)
    if tsunami_m and tsunami_m > 0:
        folium.Circle(
            radius=200000,
            location=[lat, lon],
            color="#3a82f7",
            weight=1,
            fill=True,
            fill_opacity=0.1,
            popup=f"Tsunami indicator (peak est: {tsunami_m:.1f} m)",
        ).add_to(m)

    # Lat/Lng popup on click
    m.add_child(folium.LatLngPopup())

    # Add a mini legend
    legend_html = """
    <div style="
        position: fixed; 
        bottom: 20px; left: 20px; width: 220px; z-index: 9999;
        background: rgba(0,0,0,0.65); color: #fff; padding: 12px;
        border-radius: 8px; font-size: 13px; line-height: 1.4;">
        <b>Legend</b><br>
        <span style="display:inline-block;width:10px;height:10px;background:#e81d1d;border-radius:50%;margin-right:6px;"></span>
        Crater (radius)<br>
        <span style="display:inline-block;width:10px;height:10px;background:#ff8c00;border-radius:50%;margin-right:6px;"></span>
        Blast Zone<br>
        <span style="display:inline-block;width:10px;height:10px;background:#3a82f7;border-radius:50%;margin-right:6px;"></span>
        Tsunami (indicative)
    </div>
    """
    m.get_root().html.add_child(folium.Element(legend_html))

    # Return full HTML
    return m.get_root().render()

@app.route("/impact_map")
def impact_map():
    """
    Returns a Folium map HTML page.
    Priority of inputs:
      1) Query params: lat, lon, blast_km, crater_km, tsunami_m
      2) Session["last_simulation"] (if present)
      3) Defaults
    """
    # 1) Query params
    qp_lat = request.args.get("lat")
    qp_lon = request.args.get("lon")
    qp_blast = request.args.get("blast_km")
    qp_crater = request.args.get("crater_km")
    qp_tsunami = request.args.get("tsunami_m")

    lat: float
    lon: float
    blast_km: float
    crater_km: float
    tsunami_m: float

    if qp_lat and qp_lon:
        lat = safe_float(qp_lat, 0.0)
        lon = safe_float(qp_lon, 0.0)
        blast_km = safe_float(qp_blast, 0.0)
        crater_km = safe_float(qp_crater, 0.0)
        tsunami_m = safe_float(qp_tsunami, 0.0)
    else:
        # 2) session fallback
        last = session.get("last_simulation")
        if last:
            lat = float(last.get("impact_lat", 0.0))
            lon = float(last.get("impact_lng", 0.0))
            blast_km = float(last.get("blast_radius", 0.0))
            crater_km = float(last.get("crater_diameter", 0.0))
            tsunami_m = float(last.get("tsunami_height", 0.0))
        else:
            # 3) defaults (Los Angeles)
            lat, lon = 34.0522, -118.2437
            blast_km = 50.0
            crater_km = 3.0
            tsunami_m = 0.0

    html = _build_folium_map(lat, lon, blast_km, crater_km, tsunami_m)
    return Response(html, mimetype="text/html; charset=utf-8")

# --------------------------------------------
# Entrypoint
# # --------------------------------------------
if __name__ == "__main__":
    import atexit
    atexit.register(lambda: session_cache.cache.close())
    app.run(debug=False, host="0.0.0.0", port=5000)




# @app.route("/")
# def home():
#     return "Hello from Flask on Firebase Functions!"

# # Expose Flask app as a Firebase Function
# @functions_framework.http
# def flask_app(request):
#     return app(request.environ, request.start_response)