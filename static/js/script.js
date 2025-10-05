/**
 * Cosmic Sentinel / Meteor Madness - Unified Client Script
 * ---------------------------------------------------------------------
 * - Simulation page: Cesium globe, param sliders, explosion effect, redirect.
 * - Impact page: Folium map (via iframe to /folium_map), results panel, weather.
 * - Mitigation page: strategy buttons (kinetic/gravity/nuclear demo endpoints).
 * - Resources page: AI advisory (Gemini), export to PDF.
 * - Defend page: timed challenge, leaderboard.
 * - Learn page: energy calculator + 3Q quiz.
 * - Global: chatbot, real-time clock + reverse geocode, tooltips.
 *
 * IMPORTANT: Impact map now uses Folium. Backend route required:
 *   GET /folium_map?lat=...&lng=...&results=ENCODED_JSON
 * (You already have the sample route scaffold from our earlier message.)
 * ---------------------------------------------------------------------
 */

(() => {
  // ---------------------------
  // Global App State
  // ---------------------------
  let cesiumViewer = null;
  let chatbotVisible = false;
  let colorblindMode = false;
  let neoData = [];

  const defaultImpact = { lat: 34.0522, lng: -118.2437 }; // LA
  const CITIES = {
    "New York": { lat: 40.7128, lng: -74.006 },
    "London": { lat: 51.5074, lng: -0.1278 },
    "Tokyo": { lat: 35.6895, lng: 139.6917 },
    "Dubai": { lat: 25.276987, lng: 55.296249 },
    "Rio de Janeiro": { lat: -22.9068, lng: -43.1729 },
  };

  // Elements used in multiple places (resolve lazily where needed)
  let impactLatInput, impactLngInput;

  // --------------------------------
  // Utility: DOM helpers & network
  // --------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const text = (el, t) => el && (el.textContent = t);
  const html = (el, h) => el && (el.innerHTML = h);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const getJSON = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  };

  const postJSON = async (url, body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  };

  const stringifyCompact = (obj) =>
    encodeURIComponent(JSON.stringify(obj || {}, (k, v) => (v === undefined ? null : v)));

  const parseLS = (key, fallback = null) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (_) {
      return fallback;
    }
  };

  const saveLS = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  // ---------------------------
  // Explosion FX (Simulation)
  // ---------------------------
  function triggerExplosionFX() {
    const snd = $("#impact-sound");
    if (snd) {
      try {
        snd.currentTime = 0;
        snd.volume = 0.7;
        snd.play().catch(() => {});
      } catch (_) {}
    }
    const overlay = $("#explosion-overlay");
    if (!overlay) return;
    overlay.classList.add("flash-active");
    document.body.classList.add("shake");
    setTimeout(() => {
      document.body.classList.remove("shake");
      overlay.classList.remove("flash-active");
    }, 1100);
  }

  // ---------------------------
  // Page Router
  // ---------------------------
  document.addEventListener("DOMContentLoaded", () => {
    wireGlobalUI();
    const path = window.location.pathname;

    if (path.includes("/simulation")) initSimulationPage();
    if (path.includes("/impact")) initImpactPage();
    if (path.includes("/mitigation")) initMitigationPage();
    if (path.includes("/resources")) initResourcesPage();
    if (path.includes("/learn")) initLearnPage();
    if (path.includes("/defend")) initDefendPage();
    if (path.includes("/about")) initAboutPage();

    startClockAndLocation();
  });

  // ---------------------------
  // Global UI (header/sidebar/chatbot/tooltips)
  // ---------------------------
  function wireGlobalUI() {
    const sidebarToggle = $("#sidebar-toggle");
    on(sidebarToggle, "click", () => $(".app-container").classList.toggle("sidebar-collapsed"));

    // Chatbot toggles exist in sidebar + header
    $$(".chatbot-link").forEach((btn) =>
      on(btn, "click", () => toggleChatbot(true))
    );
    on($("#close-chatbot-btn"), "click", () => toggleChatbot(false));

    // Chatbot input handlers
    on($("#chatbot-send-btn"), "click", sendChatMessage);
    on($("#chatbot-input"), "keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });

    // Tooltips
    installTooltipHandlers();
  }

  // Chatbot
  function toggleChatbot(state) {
    chatbotVisible = state;
    const box = $("#chatbot-container");
    if (!box) return;
    box.style.display = chatbotVisible ? "flex" : "none";
    if (chatbotVisible) $("#chatbot-input")?.focus();
  }

  async function sendChatMessage() {
    const input = $("#chatbot-input");
    const msg = (input?.value || "").trim();
    if (!msg) return;
    input.value = "";
    appendChat("user", msg);
    const status = $("#chat-status");
    if (status) status.textContent = "Sentinel AI is typing...";

    const loading = appendChat("ai", "...");
    loading.classList.add("loading-placeholder");

    try {
      const data = await postJSON("/chatbot", { message: msg });
      loading.classList.remove("loading-placeholder");
      loading.textContent = data.response || "No response.";
    } catch (err) {
      loading.classList.remove("loading-placeholder");
      loading.textContent = "Connection issue. Please try again.";
    } finally {
      if (status) status.textContent = "Online";
      const box = $("#chatbot-messages");
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  function appendChat(sender, textContent) {
    const msgBox = $("#chatbot-messages");
    if (!msgBox) return document.createElement("div");
    const wrap = document.createElement("div");
    wrap.className = `message ${sender === "user" ? "user-message" : "ai-message"}`;

    const icon = document.createElement("div");
    icon.className = "message-icon";
    icon.innerHTML = sender === "user" ? '<i class="fas fa-user-astronaut"></i>' : '<i class="fas fa-robot"></i>';

    const body = document.createElement("div");
    body.className = "message-content";
    body.textContent = textContent;

    wrap.appendChild(icon);
    wrap.appendChild(body);
    msgBox.appendChild(wrap);
    msgBox.scrollTop = msgBox.scrollHeight;
    return body;
  }

  // ---------------------------
  // Clock + Reverse Geocode (header sidebar)
  // ---------------------------
  function startClockAndLocation() {
    const tEl = $("#system-time");
    const dEl = $("#system-date");
    const lEl = $("#system-location");

    const tick = () => {
      const now = new Date();
      if (tEl) tEl.textContent = `Local: ${now.toLocaleTimeString("en-US", { hour12: false })}`;
      if (dEl)
        dEl.textContent = now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
    };
    tick();
    setInterval(tick, 1000);

    if (!lEl) return;
    if (!navigator.geolocation) {
      lEl.textContent = "Location: Geolocation not supported";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`;
          const data = await getJSON(url);
          const addr = data.address || {};
          const city = addr.city || addr.town || addr.village || addr.county || "";
          const country = addr.country || "";
          lEl.textContent = `Location: ${city}${city && country ? ", " : ""}${country}`;
        } catch (_) {
          lEl.textContent = "Location: N/A";
        }
      },
      () => (lEl.textContent = "Location: Denied"),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  // ---------------------------
  // Tooltips
  // ---------------------------
  function installTooltipHandlers() {
    const tipMap = {
      "tooltip-semimajor":
        "Semi-major axis (a): half the longest diameter of an ellipse; sets orbit size.",
      "tooltip-eccentricity":
        "Eccentricity (e): 0 is circular; values close to 1 are more elongated ellipses.",
      "tooltip-inclination":
        "Inclination (i): tilt of the orbital plane relative to a reference plane.",
      "tooltip-longAsc":
        "Longitude of ascending node (Ω): angle to the point where the orbit crosses upward.",
      "tooltip-argPeri":
        "Argument of periapsis (ω): angle from ascending node to the closest approach point.",
      "tooltip-trueAnomaly":
        "True anomaly (ν): angle from periapsis to the current position on the orbit.",
      "tooltip-energy":
        "Megatons (TNT) released: primary driver of downstream effects (blast, quake, tsunami).",
      "tooltip-crater": "Diameter of the impact crater left on the surface.",
      "tooltip-seismic": "Earthquake magnitude (Richter) generated by the impact.",
      "tooltip-tsunami":
        "Estimated peak wave height if impact is in water or near-coastal.",
      "tooltip-diameter":
        "Impact energy grows with the cube of diameter; size matters a LOT.",
      "tooltip-velocity":
        "Impact energy grows with the square of velocity; speed is critical.",
    };

    const container = $("#tooltip-container");
    const content = $("#tooltip-content");
    if (!container || !content) return;

    document.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-tooltip-id]");
      if (!el) return;
      const id = el.getAttribute("data-tooltip-id");
      content.textContent = tipMap[id] || "No info available.";
      const r = el.getBoundingClientRect();
      container.style.top = `${r.bottom + window.scrollY + 10}px`;
      container.style.left = `${r.left + window.scrollX}px`;
      container.style.display = "block";
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest("[data-tooltip-id]")) {
        setTimeout(() => {
          if (!container.matches(":hover")) container.style.display = "none";
        }, 80);
      }
    });
  }

  // ---------------------------
  // Page: Simulation (Cesium)
  // ---------------------------
  function initSimulationPage() {
    // Elements
    impactLatInput = $("#impact-lat");
    impactLngInput = $("#impact-lng");

    // Sliders + selects
    const sizeSlider = $("#asteroid-size");
    const speedSlider = $("#asteroid-speed");
    const angleSlider = $("#impact-angle");
    const locationSelect = $("#location");

    // Orbital elements
    const orbA = $("#orb-a");
    const orbE = $("#orb-e");
    const orbI = $("#orb-i");
    const orbAsc = $("#orb-omega-asc");
    const orbPeri = $("#orb-omega-peri");
    const orbNu = $("#orb-nu");

    // Values
    const sizeVal = $("#size-value");
    const speedVal = $("#speed-value");
    const angleVal = $("#angle-value");

    const neoSelect = $("#neo-select");
    const runButton = $("#run-simulation");

    // Cesium globe
    initCesium();

    // Values display
    const bindSlider = (slider, out, suffix) => {
      if (!slider || !out) return;
      const update = () => (out.textContent = `${slider.value} ${suffix}`);
      on(slider, "input", update);
      update();
    };
    bindSlider(sizeSlider, sizeVal, "m");
    bindSlider(speedSlider, speedVal, "km/s");
    bindSlider(angleSlider, angleVal, "°");

    // Fetch NEOs
    (async () => {
      try {
        const data = await getJSON("/get_neos");
        neoData = data || [];
        if (!neoSelect) return;
        neoSelect.innerHTML = `<option value="custom">-- Custom Scenario (Edit Inputs Below) --</option>`;
        neoData.forEach((n) => {
          const o = document.createElement("option");
          o.value = n.id;
          o.textContent = `${n.name} — ${n.diameter_m || "?"} m ${n.is_hazardous ? "⚠️" : ""}`;
          neoSelect.appendChild(o);
        });
      } catch (_) {
        if (neoSelect) {
          neoSelect.innerHTML =
            `<option value="custom">-- NEO Feed Offline (use custom) --</option>`;
        }
      }
    })();

    on(neoSelect, "change", () => {
      if (!neoSelect || neoSelect.value === "custom") return;
      const sel = neoData.find((n) => n.id === neoSelect.value);
      if (!sel) return;
      if (sizeSlider) sizeSlider.value = sel.diameter_m || sizeSlider.value;
      if (speedSlider) speedSlider.value = sel.velocity_km_s || speedSlider.value;
      sizeVal && (sizeVal.textContent = `${sizeSlider.value} m`);
      speedVal && (speedVal.textContent = `${speedSlider.value} km/s`);
    });

    on(runButton, "click", async () => {
      if (!impactLatInput || !impactLngInput) return;
      const lat = parseFloat(impactLatInput.value);
      const lng = parseFloat(impactLngInput.value);
      if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        alert("Please pick a valid impact location on the globe.");
        return;
      }

      runButton.disabled = true;
      runButton.innerHTML = `<i class="fas fa-hourglass-half"></i> Simulating...`;

      const useOrb =
        orbA?.value && orbE?.value && orbI?.value && orbAsc?.value && orbPeri?.value && orbNu?.value;

      const payload = useOrb
        ? {
            size: parseFloat(sizeSlider?.value || "0"),
            angle: parseFloat(angleSlider?.value || "45"),
            location: locationSelect?.value || "land",
            lat,
            lng,
            a: parseFloat(orbA.value),
            e: parseFloat(orbE.value),
            i: parseFloat(orbI.value),
            omega_asc: parseFloat(orbAsc.value),
            omega_peri: parseFloat(orbPeri.value),
            nu: parseFloat(orbNu.value),
          }
        : {
            size: parseFloat(sizeSlider?.value || "0"),
            speed: parseFloat(speedSlider?.value || "17"),
            angle: parseFloat(angleSlider?.value || "45"),
            location: locationSelect?.value || "land",
            lat,
            lng,
          };

      try {
        const results = await postJSON("/simulate", payload);
        saveLS("simulationResults", results);

        // Explosion effect + redirect
        triggerExplosionFX();
        await sleep(1200);
        window.location.href = "/impact";
      } catch (err) {
        console.error("Simulate failed:", err);
        alert("Simulation failed. Please try again.");
      } finally {
        runButton.disabled = false;
        runButton.innerHTML = `<i class="fas fa-play-circle"></i> Run Simulation & Analyze`;
      }
    });
  }

  function initCesium() {
    const container = $("#cesium-container");
    if (!container || typeof Cesium === "undefined") return;

    // Provide your Cesium token via env or keep as is if already configured in HTML
    // Cesium.Ion.defaultAccessToken = 'YOUR_TOKEN';

    cesiumViewer = new Cesium.Viewer("cesium-container", {
      terrainProvider: Cesium.createWorldTerrain(),
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
    });

    cesiumViewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0b001a");
    cesiumViewer.scene.globe.baseColor = new Cesium.Color(0.2, 0.2, 0.4, 1);

    const initial = Cesium.Cartesian3.fromDegrees(defaultImpact.lng, defaultImpact.lat, 15_000_000);
    cesiumViewer.camera.lookAt(initial, new Cesium.HeadingPitchRange(0, -Math.PI / 2, 25_000_000));

    // One draggable click marker
    let marker = null;
    const setMarker = (lat, lng) => {
      if (marker) cesiumViewer.entities.remove(marker);
      marker = cesiumViewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        point: {
          pixelSize: 15,
          color: Cesium.Color.RED,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    };
    setMarker(defaultImpact.lat, defaultImpact.lng);

    // Click handler
    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    handler.setInputAction((click) => {
      const ray = cesiumViewer.camera.getPickRay(click.position);
      const cart = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);
      if (!cart) return;
      const c = Cesium.Cartographic.fromCartesian(cart);
      const lat = Cesium.Math.toDegrees(c.latitude).toFixed(4);
      const lng = Cesium.Math.toDegrees(c.longitude).toFixed(4);
      if ($("#impact-lat")) $("#impact-lat").value = lat;
      if ($("#impact-lng")) $("#impact-lng").value = lng;
      setMarker(parseFloat(lat), parseFloat(lng));

      // Show human-readable address (simulation sidebar footer)
      reverseGeocodeToFields(lat, lng).catch(() => {});
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  async function reverseGeocodeToFields(lat, lng) {
    const nameEl = $("#current-location-city-country");
    const addrEl = $("#current-location-address");
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const data = await getJSON(url);
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.county || "N/A";
      const country = addr.country || "N/A";
      if (nameEl) nameEl.textContent = `${city}, ${country}`;
      if (addrEl) addrEl.textContent = data.display_name || `Lat ${lat}, Lng ${lng}`;
    } catch (e) {
      if (nameEl) nameEl.textContent = "N/A, N/A";
      if (addrEl) addrEl.textContent = `Lat ${lat}, Lng ${lng}`;
    }
  }

  // ---------------------------
  // Page: Impact (Folium map)
  // ---------------------------
  function initImpactPage() {
    const results = parseLS("simulationResults");
    const content = $("#impact-results-content");

    if (!results) {
      if (content)
        html(
          content,
          `
          <section class="info-panel thought-panel">
            <i class="fas fa-exclamation-triangle thought-icon icon-critical"></i>
            <div class="thought-content">
              <p class="thought-quote">"No Simulation Data Found. Please run a simulation first."</p>
              <span class="thought-source">- System Alert</span>
            </div>
          </section>
          <div class='warning-box module-card'>
            <h3>⚠️ No Simulation Data</h3>
            <p>Run a simulation to view global impact consequences and the Folium map.</p>
            <a href="/simulation" class="btn btn-warning btn-primary">Go to Simulation</a>
          </div>
        `
        );
      return;
    }

    // Primary metrics
    setImpactNumbers(results);

    // Weather
    fetchWeather(results.impact_lat, results.impact_lng);

    // Map controls
    wireImpactControls(results);

    // Build Folium iframe
    mountFoliumMap(results);
  }

  function setImpactNumbers(r) {
    text($("#energy-value"), `${(r.energy || 0).toLocaleString()} MT`);
    text($("#crater-value"), `${(r.crater_diameter || 0).toFixed(2)} km`);
    text($("#seismic-value"), `${(r.seismic_magnitude || 0).toFixed(1)}`);
    text($("#blast-value"), `${(r.blast_radius || 0).toFixed(2)} km`);
    text($("#tsunami-value"), `${(r.tsunami_height || 0).toFixed(1)} m`);
    text($("#population-value"), `${(r.affected_population || 0).toLocaleString()}`);
    text($("#impact-type"), `${(r.impact_location_type || "N/A").toUpperCase()}`);
    text($("#elevation-value"), `${r.elevation_m ?? "N/A"} m`);
    text($("#asteroid-size-value"), `${r.asteroid_size_m ?? "N/A"} m`);
    text($("#velocity-value"), `${r.velocity_km_s ?? "N/A"} km/s`);
  }

  function wireImpactControls(results) {
    const colorToggle = $("#colorblind-toggle");
    const citySelect = $("#city-select");

    on(colorToggle, "click", () => {
      colorblindMode = !colorblindMode;
      colorToggle.classList.toggle("active", colorblindMode);
      // Simply remount map with same results (server can adjust colors if desired)
      mountFoliumMap(results);
    });

    on(citySelect, "change", () => {
      const val = citySelect.value;
      if (!val || !CITIES[val]) return;
      const { lat, lng } = CITIES[val];
      const newR = { ...results, impact_lat: lat, impact_lng: lng };
      saveLS("simulationResults", newR);
      setImpactNumbers(newR);
      mountFoliumMap(newR);
      fetchWeather(lat, lng);
    });
  }

  function mountFoliumMap(results) {
    const container = $("#google-map-container") || $("#folium-map-container");
    if (!container) return;

    // We embed Folium via an iframe response from /folium_map
    const lat = results.impact_lat || 0;
    const lng = results.impact_lng || 0;
    const encoded = stringifyCompact({
      crater_diameter: results.crater_diameter || 0,
      blast_radius: results.blast_radius || 0,
      tsunami_height: results.tsunami_height || 0,
      colorblind: colorblindMode ? 1 : 0,
    });

    const src = `/folium_map?lat=${lat}&lng=${lng}&results=${encoded}`;

    // Create or replace iframe
    let frame = container.querySelector("iframe");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.setAttribute("title", "Folium Impact Map");
      frame.setAttribute("aria-label", "Global Impact Zone Map");
      frame.style.border = "0";
      frame.style.width = "100%";
      frame.style.height = "600px";
      container.appendChild(frame);
    }
    frame.src = src;
  }

  async function fetchWeather(lat, lng) {
    try {
      const w = await getJSON(`/get_weather?lat=${lat}&lon=${lng}`);
      text($("#weather-location"), w.name || "Unknown");
      text($("#weather-temp"), `${w.temp ?? "N/A"}°C`);
      text($("#weather-desc"), w.description || "N/A");
      text($("#weather-wind"), `${w.wind_speed ?? "N/A"} m/s`);
    } catch (e) {
      text($("#weather-location"), `N/A (${lat.toFixed(2)}, ${lng.toFixed(2)})`);
      text($("#weather-desc"), "Weather service offline or key invalid.");
      text($("#weather-temp"), "N/A");
      text($("#weather-wind"), "N/A");
    }
  }

  // ---------------------------
  // Page: Mitigation
  // ---------------------------
  function initMitigationPage() {
    const btns = $$(".mitigation-card .btn-simulate");
    btns.forEach((b) =>
      on(b, "click", async () => {
        const label = b.closest(".mitigation-card")?.querySelector("h3")?.textContent || "Strategy";
        try {
          if (/Kinetic/i.test(label)) {
            const data = await postJSON("/api/mitigation/kinetic-impactor", {
              delta_v: 2, // m/s
              lead_time_days: 365,
            });
            alert(`Kinetic Impactor ~ ${Number(data.deflection_km || 0).toFixed(1)} km along-track deflection`);
          } else if (/Gravity/i.test(label)) {
            const data = await postJSON("/api/mitigation/gravity-tractor", {
              asteroid_mass: 1.4e10,
              spacecraft_mass: 20000,
              hover_distance: 600,
              years: 5,
            });
            alert(`Gravity Tractor Δv ≈ ${Number(data.delta_v_ms || 0).toExponential(3)} m/s`);
          } else if (/Nuclear/i.test(label)) {
            const data = await postJSON("/api/mitigation/nuclear-educational", {
              yield_mt: 1,
            });
            alert(
              `Nuclear (educational): fragmentation probability ${(data.fragmentation_probability * 100).toFixed(
                1
              )}% with ~${data.estimated_fragments} fragments (toy model)`
            );
          }
        } catch (e) {
          alert("Mitigation simulation failed.");
        }
      })
    );
  }

  // ---------------------------
  // Page: Resources (AI advisory)
  // ---------------------------
  function initResourcesPage() {
    const explainBtn = $("#explain-impact-btn");
    const downloadBtn = $("#download-advisory-btn");
    const out = $("#ai-response-container");

    const res = parseLS("simulationResults");
    if (!out) return;

    if (!res) {
      html(out, `<p class="no-data-message">No simulation data. Run a simulation first.</p>`);
      if (explainBtn) explainBtn.disabled = true;
      if (downloadBtn) downloadBtn.disabled = true;
      return;
    }

    if (explainBtn) explainBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = true;
    html(out, `<p class="no-data-message">Click "Explain Last Impact" to generate a safety advisory.</p>`);

    on(explainBtn, "click", async () => {
      explainBtn.disabled = true;
      explainBtn.textContent = "Generating Advisory...";
      downloadBtn.disabled = true;
      html(out, `<p class="no-data-message">Generating...</p>`);
      try {
        const data = await postJSON("/ai_explain_impact", res);
        const advisory = data.advisory || "No advisory received.";
        html(out, `<p>${advisory}</p>`);
        downloadBtn.disabled = false;
      } catch (e) {
        html(
          out,
          `<p class="no-data-message">Error: Failed to generate advisory. Check AI connection.</p>`
        );
      } finally {
        explainBtn.disabled = false;
        explainBtn.textContent = "Explain Last Impact";
      }
    });

    // Simple PDF export with browser print fallback
    on(downloadBtn, "click", () => {
      const text = out.textContent?.trim();
      if (!text || text.startsWith("No simulation")) {
        alert("Generate an advisory first.");
        return;
      }
      // create blob + download as .txt (works universally); PDF generation requires a lib
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Impact-Advisory.txt";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ---------------------------
  // Page: Defend (mini-game)
  // ---------------------------
  function initDefendPage() {
    const commitBtn = $("#commit-btn");
    const countdown = $("#countdown-timer");
    const options = $$(".option-card");
    const outcome = $("#outcome-container");
    const leaderboardList = $("#leaderboard");

    if (!commitBtn || !countdown || !options.length || !outcome || !leaderboardList) return;

    let selected = null;
    let timeLeft = 60;
    let timer = null;

    const IMPACT = { size: 2500, speed: 35, angle: 45, lat: 34.0522, lng: -118.2437 };
    const MODS = {
      kinetic: { success_chance: 0.7, speed_mod: -5, size_mod: 0 },
      gravity: { success_chance: 0.4, speed_mod: -2, size_mod: 0 },
      nuclear: { success_chance: 0.95, speed_mod: -10, size_mod: -500 },
    };

    const renderLB = () => {
      const lb = parseLS("leaderboard", []);
      leaderboardList.innerHTML = "";
      lb.slice(0, 10).forEach((e, i) => {
        const li = document.createElement("li");
        li.className = "leaderboard-item";
        li.innerHTML = `<span class="leaderboard-rank">#${i + 1}</span>
                        <span class="leaderboard-name">${e.name}</span>
                        <span class="leaderboard-score">${e.score.toLocaleString()}</span>`;
        leaderboardList.appendChild(li);
      });
    };

    const updateLB = (score) => {
      if (score <= 0) return;
      const name = prompt("New High Score! Enter your name:") || "Anonymous";
      const lb = parseLS("leaderboard", []);
      lb.push({ name, score });
      lb.sort((a, b) => b.score - a.score);
      saveLS("leaderboard", lb.slice(0, 10));
      renderLB();
    };

    const endGame = (success, message, score) => {
      commitBtn.disabled = true;
      options.forEach((o) => (o.style.pointerEvents = "none"));
      outcome.style.display = "block";
      outcome.className = `outcome-container ${success ? "outcome-success" : "outcome-failure"}`;
      outcome.innerHTML = `<h3>${success ? "Mission Successful!" : "Mission Failed!"}</h3>
        <p>${message}</p>
        <button id="play-again-btn" class="btn btn-primary"><i class="fas fa-redo"></i> Play Again</button>`;
      on($("#play-again-btn"), "click", () => location.reload());
      if (success) updateLB(score);
    };

    const startTimer = () => {
      countdown.textContent = timeLeft;
      timer = setInterval(() => {
        timeLeft--;
        countdown.textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(timer);
          endGame(false, "You ran out of time! The asteroid hit with full force.", 0);
        }
      }, 1000);
    };

    options.forEach((card) => {
      on(card, "click", () => {
        options.forEach((o) => o.classList.remove("selected"));
        card.classList.add("selected");
        selected = card.dataset.strategy;
        commitBtn.disabled = false;
      });
      on(card, "keydown", (e) => {
        if (e.key === " " || e.key === "Enter") card.click();
      });
    });

    on(commitBtn, "click", async () => {
      if (!selected) return;
      clearInterval(timer);
      const mod = MODS[selected];
      const success = Math.random() < mod.success_chance;

      const finalPayload = {
        ...IMPACT,
        speed: success ? Math.max(5, IMPACT.speed + mod.speed_mod) : IMPACT.speed,
        size: success ? Math.max(10, IMPACT.size + mod.size_mod) : IMPACT.size,
      };

      try {
        const r = await postJSON("/simulate", finalPayload);
        const saved = Math.max(0, 100_000_000 - (r.affected_population || 0));
        const msg = success
          ? `You altered the trajectory! Blast radius reduced to ${r.blast_radius?.toFixed(
              2
            )} km. Estimated lives saved: ${saved.toLocaleString()}.`
          : `Strategy failed. Blast radius ${r.blast_radius?.toFixed(
              2
            )} km with affected population ${r.affected_population?.toLocaleString()}.`;
        endGame(success, msg, saved);
      } catch {
        endGame(false, "Simulation error occurred.", 0);
      }
    });

    renderLB();
    startTimer();
  }

  // ---------------------------
  // Page: Learn (Quiz + energy)
  // ---------------------------
  function initLearnPage() {
    const mSlider = $("#mass-slider");
    const vSlider = $("#velocity-slider");
    const mVal = $("#mass-value");
    const vVal = $("#velocity-value");
    const eVal = $("#energy-result");

    const updateEnergy = () => {
      if (!mSlider || !vSlider || !eVal) return;
      const m = parseFloat(mSlider.value);
      const v = parseFloat(vSlider.value) * 1000; // km/s -> m/s
      const E = 0.5 * m * v * v; // J
      text(eVal, `${(E / 1e6).toFixed(2)} MJ`);
      text(mVal, `${m.toLocaleString()} kg`);
      text(vVal, `${(v / 1000).toFixed(2)} km/s`);
    };
    if (mSlider && vSlider) {
      on(mSlider, "input", updateEnergy);
      on(vSlider, "input", updateEnergy);
      updateEnergy();
    }

    // Quiz
    const quiz = [
      {
        q: "What determines an asteroid’s impact energy?",
        options: ["Mass and Velocity", "Color and Shape", "Distance from Earth"],
        ans: 0,
      },
      {
        q: "Best strategy with long lead time?",
        options: ["Nuclear Deflection", "Kinetic Impactor", "Gravity Tractor"],
        ans: 2,
      },
      {
        q: "High eccentricity (close to 1) means:",
        options: ["Very elliptical orbit", "Perfect circle", "Unstable/no path"],
        ans: 0,
      },
    ];
    let qi = 0;
    const qText = $("#question-text");
    const btns = $$(".quiz-option");
    const nextBtn = $("#next-question-btn");
    const feedback = $("#feedback-message");

    const loadQ = () => {
      if (!qText || !btns.length || !feedback || !nextBtn) return;
      const cur = quiz[qi];
      text(qText, cur.q);
      btns.forEach((b, i) => {
        b.textContent = cur.options[i];
        b.classList.remove("correct", "incorrect");
        b.disabled = false;
      });
      text(feedback, "");
      nextBtn.style.display = "none";
    };
    const check = (i) => {
      const cur = quiz[qi];
      btns.forEach((b) => (b.disabled = true));
      if (i === cur.ans) {
        text(feedback, "Correct! Well done, Sentinel.");
        feedback.style.color = "var(--color-accent-green)";
      } else {
        text(feedback, "Incorrect. Try again to refine your knowledge.");
        feedback.style.color = "var(--color-accent-critical)";
      }
      btns.forEach((b, idx) => {
        if (idx === cur.ans) b.classList.add("correct");
        else if (idx === i) b.classList.add("incorrect");
      });
      nextBtn.style.display = "block";
      nextBtn.textContent = qi === quiz.length - 1 ? "Restart Quiz" : "Next Question";
    };

    if (btns.length) {
      btns.forEach((b, i) => on(b, "click", () => check(i)));
      on(nextBtn, "click", () => {
        qi = (qi + 1) % quiz.length;
        loadQ();
      });
      loadQ();
    }
  }

  // ---------------------------
  // Page: About (timeline)
  // ---------------------------
  function initAboutPage() {
    const data = [
      {
        title: "Phase 1: Detection",
        text:
          "On March 12, 2025, Impactor-2025 is detected. Initial orbit solves suggest non-zero impact probability.",
        icon: "fas fa-satellite-dish",
      },
      {
        title: "Phase 2: Simulation",
        text:
          "Using NASA NeoWs, we run ensembles. Worst-case energy ~250 MT, seismic ~M8.2 if Atlantic impact.",
        icon: "fas fa-microchip",
      },
      {
        title: "Phase 3: Response",
        text:
          "UN & PDCO coordinate risk refinement and mission planning for potential deflection.",
        icon: "fas fa-shield-halved",
      },
      {
        title: "Phase 4: Mitigation",
        text:
          "Kinetic Impactor alters trajectory; safe miss distance achieved.",
        icon: "fas fa-hand-fist",
      },
    ];
    const content = $("#narrative-content");
    const prev = $("#prev-stage-btn");
    const next = $("#next-stage-btn");
    const stages = $$(".timeline-stage");

    let idx = 0;
    const render = () => {
      if (!content) return;
      const s = data[idx];
      html(
        content,
        `<div class="narrative-content-card">
          <h4><i class="${s.icon}"></i> ${s.title}</h4>
          <p>${s.text}</p>
        </div>`
      );
      stages.forEach((st) => st.classList.remove("active"));
      const active = stages.find((st) => parseInt(st.dataset.stage, 10) === idx);
      active && active.classList.add("active");
      if (prev) prev.disabled = idx === 0;
      if (next) next.disabled = idx === data.length - 1;
    };
    stages.forEach((st) =>
      on(st, "click", () => {
        idx = parseInt(st.dataset.stage, 10) || 0;
        render();
      })
    );
    on(prev, "click", () => {
      idx = Math.max(0, idx - 1);
      render();
    });
    on(next, "click", () => {
      idx = Math.min(data.length - 1, idx + 1);
      render();
    });
    render();
  }
})();
