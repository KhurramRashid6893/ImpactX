# ImpactX – Meteor Madness: Planetary Defense Command

A Flask-based web app that turns near‑Earth object (NEO) data and basic impact physics into a civilian‑friendly **planetary defense dashboard**. It shows upcoming asteroids, lets you **simulate impact scenarios**, renders a **Folium map** of blast effects, provides **AI explanations** via Gemini, and includes **preparedness/mitigation modules**.

> Tech stack: Flask, Jinja2, JS/CSS, Folium, requests/requests-cache, Google Gemini (`google-generativeai`), OpenWeatherMap, NASA NEO API, OpenStreetMap Nominatim, Geopy, Gunicorn, Docker.

---

## Table of contents

- [Live demo](#live-demo)
- [Features](#features)
- [Project structure](#project-structure)
- [Screens](#screens)
- [API & routes](#api--routes)
- [Setup](#setup)
  - [1) Prerequisites](#1-prerequisites)
  - [2) Environment variables](#2-environment-variables)
  - [3) Local development](#3-local-development)
  - [4) Docker](#4-docker)
  - [5) Deployment notes](#5-deployment-notes)
- [Internationalization](#internationalization)
- [Caching & offline behavior](#caching--offline-behavior)
- [Security & limits](#security--limits)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Live demo

_https://the-quaser-effect.onrender.com_

---

## Features

- **NEO tracker** — pulls 7‑day feed from NASA’s NEO API and caches responses.
- **Impact simulation** — estimate overpressure, thermal, and (simplified) tsunami effects from size, speed, angle, and coordinates. Optional orbital elements to derive speed.
- **Interactive impact map** — Folium map centered on the impact lat/lng with thematic layers.
- **Reverse geocoding** — OpenStreetMap Nominatim to translate coordinates to places.
- **Weather overlay** — OpenWeatherMap current weather near the impact site.
- **Mitigation “playbooks”** — Kinetic Impactor, Gravity Tractor, and Nuclear (educational) endpoints return explanation/estimates.
- **Sentinel AI** — Gemini‑powered chatbot and impact explanation endpoint for plain‑language summaries.
- **Content pages** — Simulation, Data (Impact), Defense, Learn, Resources, About.
- **Basic i18n** — `static/lang/en.json`, `static/lang/hi.json`.

---

## Project structure

```
ImpactX/
├─ app.py                 # Flask app (routes, API calls, simulation, Folium map)
├─ requirements.txt
├─ Dockerfile
├─ templates/             # Jinja2 templates (base, index, simulation, impact, etc.)
├─ static/
│  ├─ css/                # page styles
│  ├─ js/                 # front-end behavior
│  ├─ lang/               # i18n json (en, hi)
│  └─ sounds/             # sfx
├─ .env                   # local env (do NOT commit)
├─ neo_cache.sqlite       # requests-cache SQLite DB (generated)
└─ meteor_madness.zip     # extra assets (not required at runtime)
```

---

## Screens

- **/** — Home (Sentinel Hub)
- **/simulation** — Input asteroid parameters and run the solver.
- **/impact** — Data exploration and NEO listing.
- **/mitigation** — Strategy explainers & calculators.
- **/defend** — Preparedness tips & modules.
- **/resources** — Links and guides.
- **/learn** — Educational mode.
- **/about** — Project info.
- **/impact_map** — Generated Folium map for the last simulation.

---

## API & routes

### UI routes
- `GET /`  
- `GET /simulation`  
- `GET /impact`  
- `GET /mitigation`  
- `GET /resources`  
- `GET /about`  
- `GET /defend`  
- `GET /learn`  
- `GET /impact_map` — returns HTML for the Folium map.

### Data/API routes (JSON unless noted)
- `GET /get_neos` — NASA NEO 7‑day feed (cached).  
  **Env:** `NASA_API_KEY`
- `POST /simulate` — run impact physics. Body fields:
  ```json
  {
    "size": 120,               // meters
    "speed": 19.5,             // km/s (if orbital elements absent)
    "angle": 45,               // degrees from horizontal
    "lat": 28.6139,
    "lng": 77.2090,

    // optional: derive speed from orbital elements
    "a": 1.1, "e": 0.2, "i": 5.0,
    "omega_asc": 80.0, "omega_peri": 110.0, "nu": 45.0
  }
  ```
  **Returns:** overpressure/thermal ranges, tsunami (simplified), and Folium HTML link.
- `POST /chatbot` — Gemini‑powered “Sentinel AI” chat.  
  **Env:** `GEMINI_API_KEY_*`, `GEMINI_MODEL`
- `POST /ai_explain_impact` — plain‑language explanation of the latest simulation.
- `GET /get_weather?lat=..&lng=..` — OpenWeather current weather near site.  
  **Env:** `OPENWEATHER_KEY_*`
- `GET /api/dem/elevation?lat=..&lng=..` — elevation helper (may use DEM service when enabled).
- `GET /api/seismic/history?...` — seismic history helper (educational).
- `GET /api/tsunami/layer?...` — tsunami layer helper (educational).
- `GET /api/reverse_geocode?lat=..&lng=..` — reverse geocode via Nominatim.  
  **Env:** `NOMINATIM_UA`

### Mitigation endpoints
- `POST /api/mitigation/kinetic-impactor`
- `POST /api/mitigation/gravity-tractor`
- `POST /api/mitigation/nuclear-educational`

> See `app.py` for exact payloads/fields and return shapes.

---

## Setup

### 1) Prerequisites
- Python 3.11+
- A NASA API key: https://api.nasa.gov
- An OpenWeatherMap API key: https://openweathermap.org/api
- A Google Gemini API key: https://aistudio.google.com/
- (Optional) Google Maps JS key if you wire maps on the client.

### 2) Environment variables

Create a `.env` **(do not commit)** in the project root:

```dotenv
# Flask
FLASK_SECRET_KEY=change-me

# NASA
NASA_API_KEY=your-nasa-api-key

# Gemini (rotation list; unused can be blank)
GEMINI_API_KEY_1=your-gemini-key-1
GEMINI_API_KEY_2=your-gemini-key-2
GEMINI_API_KEY_3=
GEMINI_API_KEY_4=
GEMINI_MODEL=gemini-2.5-flash

# OpenWeather (rotation list)
OPENWEATHER_KEY_1=your-openweather-key-1
OPENWEATHER_KEY_2=
OPENWEATHER_KEY_3=
OPENWEATHER_KEY_4=

# Reverse geocoding (identify your app/email per Nominatim policy)
NOMINATIM_UA=your-app-name (youremail@example.com)

# Optional
GOOGLE_MAPS_API_KEY=...
```

> **Important:** The sample `.env` in this repo contains placeholder/demo values. Replace all keys with your own and **remove** the sample file from version control.

### 3) Local development

```bash
# 1) Create virtualenv
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 2) Install deps
pip install -r requirements.txt

# 3) Export env (or use a .env loader like python-dotenv)
export $(grep -v '^#' .env | xargs)

# 4) Run
python app.py
# App: http://localhost:5000
```

### 4) Docker

```bash
# Build
docker build -t impactx .

# Run
docker run -p 8080:8080 --env-file .env impactx
# App: http://localhost:8080
```

The container uses Gunicorn to serve `app:app`.

### 5) Deployment notes

- **Cloud Run**: Build the same Docker image; set env vars in service config.
- **Render / Railway / Fly**: Use Dockerfile or `gunicorn -b :8080 app:app` as start command.
- **Functions**: `functions-framework` is included; `app.py` contains a commented adapter if you want to export Flask as an HTTP function.

---

## Internationalization

Client strings live in `static/lang/en.json` and `static/lang/hi.json`. Front‑end code reads these to switch labels and section titles.

---

## Caching & offline behavior

The app uses **`requests-cache`** with a local SQLite store (`neo_cache.sqlite`) to:
- cache NASA NEO feed responses,
- gracefully **fall back** to cached data if the live API temporarily fails.

You can delete the SQLite file to reset the cache.

---

## Security & limits

- Do **not** commit your real `.env` or API keys.
- Respect **Nominatim** usage policy: set a meaningful `NOMINATIM_UA` and rate‑limit requests.
- NASA / OpenWeather / Gemini enforce rate limits; the app rotates across multiple keys when provided.
- Gemini responses are for **educational** explanations; verify with authoritative sources for critical decisions.

---

## Troubleshooting

- **NASA feed errors** → confirm `NASA_API_KEY` and network, then check cache fallback in logs.
- **Gemini errors** → check `GEMINI_API_KEY_*` and `GEMINI_MODEL`. Some regions require a proxy/VPC egress.
- **OpenWeather 401/429** → key missing or rate‑limited; provide a secondary key and wait.
- **Reverse geocode fails** → verify `NOMINATIM_UA` header and backoff per their policy.
- **Folium map not updating** → clear browser cache and rerun `/simulate` to regenerate `/impact_map`.

---

## Roadmap

- Better physics (airburst depth, fragmentation, terrain coupling).
- Proper tsunami modeling with bathymetry.
- Progressive Web App (offline tiles, installable).
- User accounts & saved scenarios.
- Unit tests and GitHub Actions CI.

---

## Acknowledgements

- NASA: Near‑Earth Object Web Service (NeoWS)
- OpenStreetMap & Nominatim
- OpenWeatherMap
- Google DeepMind/Ai Studio — Gemini

---

## License

_No license file detected. Add one (e.g., MIT, Apache‑2.0) if you plan to open‑source._
