/**
 * Meteor Madness - Sentinel Core Script
 * Description: Manages all client-side interactions, navigation, simulation processing,
 * and Sentinel AI (Gemini Chatbot) communication across the multi-page application structure.
 */

document.addEventListener('DOMContentLoaded', function () {
    // --- Global State and Constants ---
    let neoData = [];
    let cesiumViewer = null; 
    let googleMap = null;    
    let impactCircles = [];
    let chatbotVisible = false;
    let colorblindMode = false;
    const defaultImpactLocation = { lat: 34.0522, lng: -118.2437 }; 
    const cityCoordinates = {
        "New York": { lat: 40.7128, lng: -74.0060 },
        "London": { lat: 51.5074, lng: -0.1278 },
        "Tokyo": { lat: 35.6895, lng: 139.6917 },
        "Dubai": { lat: 25.276987, lng: 55.296249 },
        "Rio de Janeiro": { lat: -22.9068, lng: -43.1729 }
    };
    
    // --- Narrative for About Page ---
    let currentStage = 0;
    const narrativeData = [
        {
            title: "Phase 1: Detection",
            text: "On March 12, 2025, a new object, Impactor-2025, was detected by a network of ground-based telescopes. Initial orbital analysis suggests a low-probability, but non-zero, chance of Earth impact.",
            icon: "fas fa-satellite-dish"
        },
        {
            title: "Phase 2: Simulation",
            text: "Using data from NASA's NeoWs API, we run millions of potential trajectories. Our simulations calculate a kinetic energy release of 250 MT and a seismic magnitude of 8.2 if a worst-case impact occurs in the Atlantic Ocean.",
            icon: "fas fa-microchip"
        },
        {
            title: "Phase 3: Response",
            text: "Based on our simulations, international bodies such as the UN and Planetary Defense Coordination Office (PDC) initiate a joint response protocol. The primary goal is to refine the trajectory and prepare for potential deflection.",
            icon: "fas fa-shield-halved"
        },
        {
            title: "Phase 4: Mitigation",
            text: "Multiple deflection strategies are evaluated. A Kinetic Impactor mission is launched, successfully altering the asteroid's trajectory. The impact threat is averted, and Impactor-2025 passes Earth at a safe distance.",
            icon: "fas fa-hand-fist"
        }
    ];

    // --- DOM Elements ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const chatbotToggles = document.querySelectorAll('.chatbot-link');
    const chatbotContainer = document.getElementById('chatbot-container');
    const chatbotInput = document.getElementById('chatbot-input');
    const chatbotSendBtn = document.getElementById('chatbot-send-btn');
    const chatbotMessages = document.getElementById('chatbot-messages');
    const closeChatbotBtn = document.getElementById('close-chatbot-btn');
    const chatStatus = document.getElementById('chat-status');
    const impactLatInput = document.getElementById('impact-lat');
    const impactLngInput = document.getElementById('impact-lng');
    const currentLocationCityCountry = document.getElementById('current-location-city-country');
    const currentLocationAddress = document.getElementById('current-location-address');
    
    const narrativeContentDiv = document.getElementById('narrative-content');
    const prevStageBtn = document.getElementById('prev-stage-btn');
    const nextStageBtn = document.getElementById('next-stage-btn');

    // --- UI/Global Event Listeners ---

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.querySelector('.app-container').classList.toggle('sidebar-collapsed');
        });
    }

    chatbotToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            chatbotVisible = !chatbotVisible;
            if (chatbotContainer) {
                chatbotContainer.style.display = chatbotVisible ? 'flex' : 'none';
            }
        });
    });

    if (closeChatbotBtn) {
        closeChatbotBtn.addEventListener('click', () => {
            chatbotVisible = false;
            if (chatbotContainer) {
                chatbotContainer.style.display = 'none';
            }
        });
    }

    // --- About Page Narrative Logic ---
    if(prevStageBtn && nextStageBtn && narrativeContentDiv) {
        prevStageBtn.addEventListener('click', () => {
            if(currentStage > 0) {
                currentStage--;
                updateNarrative();
            }
        });
        nextStageBtn.addEventListener('click', () => {
            if(currentStage < narrativeData.length - 1) {
                currentStage++;
                updateNarrative();
            }
        });

        document.querySelectorAll('.timeline-stage').forEach(stage => {
            stage.addEventListener('click', () => {
                currentStage = parseInt(stage.dataset.stage);
                updateNarrative();
            });
        });
    }
    
    function updateNarrative() {
        const data = narrativeData[currentStage];
        narrativeContentDiv.innerHTML = `
            <div class="narrative-content-card">
                <h4><i class="${data.icon}"></i> ${data.title}</h4>
                <p>${data.text}</p>
            </div>
        `;
        document.querySelectorAll('.timeline-stage').forEach(stage => {
            stage.classList.remove('active');
            if(parseInt(stage.dataset.stage) === currentStage) {
                stage.classList.add('active');
            }
        });
        prevStageBtn.disabled = currentStage === 0;
        nextStageBtn.disabled = currentStage === narrativeData.length - 1;
    }


    // --- Page-specific Initialization ---

    const currentPage = window.location.pathname;

    function initPage() {
        if (currentPage.includes('simulation')) {
            initCesiumGlobe();
            fetchAndPopulateNEOs();
            setupSimulationControls();
        } else if (currentPage.includes('impact')) {
            initGoogleMap();
            displayImpactResults();
            setupImpactPageControls();
        } else if (currentPage.includes('resources')) {
            setupResourcesPage();
        } else if (currentPage.includes('mitigation')) {
            setupMitigationControls();
        } else if (currentPage.includes('about')) {
            updateNarrative();
        } else if (currentPage.includes('defend')) {
            setupDefendChallenge();
        } else if (currentPage.includes('learn')) {
            setupLearnPage();
        }
        updateRealTimeClock();
    }
    
    // --- Visualization Functions ---

    /**
     * Initializes the CesiumJS 3D globe visualization and adds click handler.
     */
    function initCesiumGlobe() {
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOGU1MTVlNy03MDViLTRhY2MtYTVjZS0wYWMxMDY4NzM3YzAiLCJpZCI6MzQ2NjY3LCJpYXQiOjE3NTk0MjI3NzV9.-ee05zUWGmr8OiG4ib5iu7Ny8rW_NnOH1vZIAyr0Ags';
        const container = document.getElementById('cesium-container');

        if (container) {
            cesiumViewer = new Cesium.Viewer('cesium-container', {
                terrainProvider: Cesium.createWorldTerrain(),
                animation: false, timeline: false, geocoder: false, homeButton: false,
                sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false,
                infoBox: false, selectionIndicator: false, fullscreenButton: false,
            });
            
            cesiumViewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0b001a');
            cesiumViewer.scene.globe.baseColor = new Cesium.Color(0.2, 0.2, 0.4, 1);
            
            const initialPos = Cesium.Cartesian3.fromDegrees(defaultImpactLocation.lng, defaultImpactLocation.lat, 15000000);
            cesiumViewer.camera.lookAt(initialPos, new Cesium.HeadingPitchRange(0, -90 * Math.PI / 180, 25000000));

            const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
            handler.setInputAction((click) => {
                const ray = cesiumViewer.camera.getPickRay(click.position);
                const cartesian = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);

                if (cartesian) {
                    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                    const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
                    const lng = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
                    
                    impactLatInput.value = lat;
                    impactLngInput.value = lng;
                    
                    updateCesiumMarker(lat, lng);
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
            
            updateCesiumMarker(defaultImpactLocation.lat, defaultImpactLocation.lng);
        }
    }
    
    /**
     * Updates the Cesium viewer with a marker at the new location and reverse geocodes the name using Nominatim.
     */
    function updateCesiumMarker(lat, lng) {
        const entityId = 'impact-point-marker';
        const position = Cesium.Cartesian3.fromDegrees(lng, lat);

        const existingEntity = cesiumViewer.entities.getById(entityId);
        if (existingEntity) {
            cesiumViewer.entities.remove(existingEntity);
        }

        cesiumViewer.entities.add({
            id: entityId,
            position: position,
            point: {
                pixelSize: 15,
                color: Cesium.Color.RED,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 3,
                disableDepthTestDistance: Number.POSITIVE_INFINITY 
            }
        });
        
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
            .then(response => response.json())
            .then(data => {
                const address = data.address;
                const locationDetails = {
                    city: address.city || address.village || address.town || address.county || 'N/A',
                    state: address.state || 'N/A',
                    country: address.country || 'N/A',
                    fullAddress: data.display_name || `Lat: ${lat}, Lng: ${lng}`
                };
                
                if (currentLocationCityCountry) {
                    currentLocationCityCountry.textContent = `${locationDetails.city}, ${locationDetails.country}`;
                }
                if (currentLocationAddress) {
                    currentLocationAddress.textContent = locationDetails.fullAddress;
                }

                const locationSelect = document.getElementById('location');
                if (locationSelect) {
                    if (locationDetails.city !== 'N/A' && locationDetails.country !== 'N/A') {
                        locationSelect.value = 'land';
                    } else {
                        locationSelect.value = 'ocean'; 
                    }
                }

            })
            .catch(error => {
                console.error("Nominatim geocoding failed:", error);
                if (currentLocationCityCountry) {
                    currentLocationCityCountry.textContent = `N/A, N/A`;
                }
                if (currentLocationAddress) {
                    currentLocationAddress.textContent = `Ocean/Remote (${lat}° N, ${lng}° E)`;
                }
            });
    }

    /**
     * Initializes the Google Maps visualization.
     */
    function initGoogleMap() {
        const container = document.getElementById('google-map-container');
        if (container && window.google) {
            const mapOptions = {
                center: { lat: 0, lng: 0 }, 
                zoom: 3,
                mapTypeId: 'satellite',
                disableDefaultUI: true,
                zoomControl: true,
                styles: [
                    { "featureType": "all", "elementType": "all", "stylers": [{ "invert_lightness": true }, { "saturation": -100 }] },
                    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#01081a" }] }
                ]
            };
            googleMap = new google.maps.Map(container, mapOptions);
        }
    }
    
    // --- Simulation Core Logic ---

    async function fetchAndPopulateNEOs() {
        try {
            const response = await fetch('/get_neos');
            if (!response.ok) throw new Error('Failed to fetch NEO data from server');
            neoData = await response.json();
            const neoSelect = document.getElementById('neo-select');
            if (neoSelect) {
                neoSelect.innerHTML = `<option value="custom">-- Custom Scenario (Edit Inputs Below) --</option>`;
                neoData.forEach(neo => {
                    const option = document.createElement('option');
                    option.value = neo.id;
                    option.textContent = `${neo.name} - ${neo.diameter_m}m ${neo.is_hazardous ? '⚠️ HAZARDOUS' : ''}`;
                    neoSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error fetching NEOs:", error);
            const neoSelect = document.getElementById('neo-select');
            if (neoSelect) neoSelect.innerHTML = `<option value="custom">-- Data Offline: Use Custom Inputs --</option>`;
        }
    }

    function setupSimulationControls() {
        const sizeSlider = document.getElementById('asteroid-size');
        const speedSlider = document.getElementById('asteroid-speed');
        const angleSlider = document.getElementById('impact-angle');
        const neoSelect = document.getElementById('neo-select');
        const runSimulationBtn = document.getElementById('run-simulation');
        
        const orbA = document.getElementById('orb-a');
        const orbE = document.getElementById('orb-e');
        const orbI = document.getElementById('orb-i');
        const orbOmegaAsc = document.getElementById('orb-omega-asc');
        const orbOmegaPeri = document.getElementById('orb-omega-peri');
        const orbNu = document.getElementById('orb-nu');

        const setupSlider = (slider, display, unit) => {
            if (slider && document.getElementById(display)) {
                slider.addEventListener('input', () => {
                    document.getElementById(display).textContent = `${slider.value} ${unit}`;
                    if (neoSelect) neoSelect.value = 'custom';
                });
                document.getElementById(display).textContent = `${slider.value} ${unit}`;
            }
        };

        setupSlider(sizeSlider, 'size-value', 'm');
        setupSlider(speedSlider, 'speed-value', 'km/s');
        setupSlider(angleSlider, 'angle-value', '°');

        if (neoSelect) {
            neoSelect.addEventListener('change', (event) => {
                const selectedId = event.target.value;
                if (selectedId === 'custom') return;
                const selectedNeo = neoData.find(neo => neo.id === selectedId);
                if (selectedNeo) {
                    sizeSlider.value = selectedNeo.diameter_m;
                    speedSlider.value = selectedNeo.velocity_km_s;
                    sizeSlider.dispatchEvent(new Event('input'));
                    speedSlider.dispatchEvent(new Event('input'));
                }
            });
        }
        
        if (runSimulationBtn) {
            runSimulationBtn.addEventListener('click', async () => {
                runSimulationBtn.textContent = 'Analyzing...';
                runSimulationBtn.disabled = true;

                const lat = parseFloat(impactLatInput.value);
                const lng = parseFloat(impactLngInput.value);
                if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                     console.error("Invalid coordinates.");
                     runSimulationBtn.textContent = 'Run Simulation & Analyze';
                     runSimulationBtn.disabled = false;
                     return;
                }
                
                const orbitalElementsPresent = orbA.value && orbE.value && orbI.value && orbOmegaAsc.value && orbOmegaPeri.value && orbNu.value;
                
                let simulationParams = {};

                if (orbitalElementsPresent) {
                     simulationParams = {
                        size: sizeSlider.value,
                        angle: angleSlider.value,
                        location: document.getElementById('location').value,
                        lat: lat,
                        lng: lng,
                        a: orbA.value,
                        e: orbE.value,
                        i: orbI.value,
                        omega_asc: orbOmegaAsc.value,
                        omega_peri: orbOmegaPeri.value,
                        nu: orbNu.value
                     };
                } else {
                    simulationParams = {
                        size: sizeSlider.value,
                        speed: speedSlider.value,
                        angle: angleSlider.value,
                        location: document.getElementById('location').value,
                        lat: lat,
                        lng: lng
                    };
                }

                try {
                    const response = await fetch('/simulate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(simulationParams)
                    });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    
                    const results = await response.json();
                    
                    localStorage.setItem('simulationResults', JSON.stringify(results));
                    window.location.href = '/impact';

                } catch (error) {
                    console.error("Simulation failed:", error);
                } finally {
                    runSimulationBtn.textContent = 'Run Simulation & Analyze';
                    runSimulationBtn.disabled = false;
                }
            });
        }
    }

    // --- Impact Page Logic ---
    function setupImpactPageControls() {
        const citySelect = document.getElementById('city-select');
        const colorblindToggle = document.getElementById('colorblind-toggle');

        if (citySelect) {
            citySelect.addEventListener('change', (event) => {
                const cityName = event.target.value;
                if (cityCoordinates[cityName]) {
                    const { lat, lng } = cityCoordinates[cityName];
                    googleMap.setCenter({ lat, lng });
                    googleMap.setZoom(8);
                }
            });
        }

        if (colorblindToggle) {
            colorblindToggle.addEventListener('click', () => {
                colorblindMode = !colorblindMode;
                colorblindToggle.classList.toggle('active', colorblindMode);
                updateImpactMap(JSON.parse(localStorage.getItem('simulationResults')));
            });
        }
    }


    function displayImpactResults() {
        const results = JSON.parse(localStorage.getItem('simulationResults'));

        const content = document.getElementById('impact-results-content');
        if (!results) {
             if (content) {
                content.innerHTML = `<section class='info-panel thought-panel'>
                    <i class='fas fa-exclamation-triangle thought-icon icon-critical'></i>
                    <div class='thought-content'>
                        <p class='thought-quote'>"No Simulation Data Found. Please run a simulation first."</p>
                        <span class='thought-source'>- System Alert</span>
                    </div>
                </section>
                <div class='warning-box module-card'><h3>⚠️ No Simulation Data</h3><p>Please run a simulation on the Simulation page first to see results.</p><a href='/simulation' class='btn btn-warning btn-primary'>Go to Simulation</a></div>`;
            }
            return;
        }

        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };

        updateElement('energy-value', `${results.energy.toLocaleString()} MT`);
        updateElement('crater-value', `${results.crater_diameter.toFixed(2)} km`);
        updateElement('seismic-value', `${results.seismic_magnitude.toFixed(1)}`);
        updateElement('blast-value', `${results.blast_radius.toFixed(2)} km`);
        updateElement('tsunami-value', `${results.tsunami_height.toFixed(1)} m`);
        updateElement('population-value', `${results.affected_population.toLocaleString()}`);
        updateElement('impact-type', `${results.impact_location_type.toUpperCase()}`);
        updateElement('elevation-value', `${results.elevation_m} m`);
        updateElement('asteroid-size-value', `${results.asteroid_size_m} m`);
        updateElement('velocity-value', `${results.velocity_km_s} km/s`);
        
        updateImpactMap(results);
        fetchWeather(results.impact_lat, results.impact_lng);
    }
    
    async function fetchWeather(lat, lng) {
        try {
            const response = await fetch(`/get_weather?lat=${lat}&lon=${lng}`);
            if (!response.ok) throw new Error('Failed to fetch weather data.');
            const weather = await response.json();
            
            document.getElementById('weather-location').textContent = weather.name;
            document.getElementById('weather-temp').textContent = `${weather.temp}°C`;
            document.getElementById('weather-desc').textContent = weather.description;
            document.getElementById('weather-wind').textContent = `${weather.wind_speed} m/s`;
            
        } catch (error) {
            console.error("Weather data fetch failed:", error);
            document.getElementById('weather-location').textContent = `N/A (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
            document.getElementById('weather-desc').textContent = "Weather service currently offline or API key invalid.";
        }
    }

    function updateImpactMap(results) {
        if (!googleMap) initGoogleMap();
        
        const impactLatLng = { lat: results.impact_lat, lng: results.impact_lng };

        impactCircles.forEach(circle => circle.setMap(null));
        impactCircles = [];
        
        googleMap.setCenter(impactLatLng);
        googleMap.setZoom(5);

        const kmToMeters = (km) => km * 1000;
        
        const palette = colorblindMode ? {
            blast: { stroke: '#0066ff', fill: '#0066ff' },
            crater: { stroke: '#ff0000', fill: '#ff0000' },
            tsunami: { stroke: '#ffc300', fill: '#ffc300' }
        } : {
            blast: { stroke: '#ff8c00', fill: '#ff8c00' },
            crater: { stroke: '#e81d1d', fill: '#e81d1d' },
            tsunami: { stroke: '#3a82f7', fill: '#3a82f7' }
        };

        const blastRadiusMeters = kmToMeters(results.blast_radius);
        const blastCircle = new google.maps.Circle({
            strokeColor: palette.blast.stroke,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: palette.blast.fill,
            fillOpacity: 0.15,
            map: googleMap,
            center: impactLatLng,
            radius: blastRadiusMeters,
            zIndex: 1
        });
        
        const infoWindow = new google.maps.InfoWindow({
            content: `<b>Blast Radius:</b><br>${results.blast_radius.toFixed(2)} km<br><br><b>Location:</b><br>Impact Zone`
        });
        
        const marker = new google.maps.Marker({
            position: impactLatLng,
            map: googleMap,
            title: "Ground Zero",
            icon: {
                 path: google.maps.SymbolPath.CIRCLE,
                 scale: 8,
                 fillColor: '#FFFFFF',
                 fillOpacity: 1,
                 strokeWeight: 1,
                 strokeColor: '#000000',
            },
            zIndex: 3
        });

        google.maps.event.addListener(blastCircle, 'mouseover', (e) => {
             blastCircle.setOptions({fillOpacity: 0.35, strokeWeight: 4});
             infoWindow.setPosition(e.latLng);
             infoWindow.open(googleMap);
        });
        google.maps.event.addListener(blastCircle, 'mouseout', () => {
             blastCircle.setOptions({fillOpacity: 0.15, strokeWeight: 2});
             infoWindow.close();
        });
        
        impactCircles.push(blastCircle);

        const craterRadiusMeters = kmToMeters(results.crater_diameter / 2);
        const craterCircle = new google.maps.Circle({
            strokeColor: palette.crater.stroke,
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: palette.crater.fill,
            fillOpacity: 0.5,
            map: googleMap,
            center: impactLatLng,
            radius: craterRadiusMeters,
            zIndex: 2
        });
        impactCircles.push(craterCircle);
        impactCircles.push(marker);

        if (results.tsunami_height > 0) {
            const tsunamiCircle = new google.maps.Circle({
                strokeColor: palette.tsunami.stroke,
                strokeOpacity: 0.4,
                strokeWeight: 1,
                fillColor: palette.tsunami.fill,
                fillOpacity: 0.1,
                map: googleMap,
                center: impactLatLng,
                radius: 200000, 
                zIndex: 0
            });
             impactCircles.push(tsunamiCircle);
        }

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(blastCircle.getBounds().getNorthEast());
        bounds.extend(blastCircle.getBounds().getSouthWest());
        googleMap.fitBounds(bounds);
        
    }

    // --- Mitigation Page Logic ---
    function setupMitigationControls() {
        const simulateButtons = document.querySelectorAll('.mitigation-card .btn-simulate');
        simulateButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const strategy = btn.closest('.mitigation-card').querySelector('h3').textContent;
                console.log(`Simulation initiated for ${strategy}`);
            });
        });
    }

    // --- Resources Page Logic ---
    function setupResourcesPage() {
        const explainImpactBtn = document.getElementById('explain-impact-btn');
        const downloadAdvisoryBtn = document.getElementById('download-advisory-btn');
        const aiResponseContainer = document.getElementById('ai-response-container');
        const simulationResults = localStorage.getItem('simulationResults');
        
        if (simulationResults) {
            explainImpactBtn.disabled = false;
            downloadAdvisoryBtn.disabled = true;
            aiResponseContainer.innerHTML = `<p class="no-data-message">Click 'Explain Last Impact' to get a safety advisory.</p>`;

            explainImpactBtn.addEventListener('click', async () => {
                explainImpactBtn.disabled = true;
                explainImpactBtn.textContent = 'Generating Advisory...';
                downloadAdvisoryBtn.disabled = true;
                aiResponseContainer.innerHTML = `<p class="no-data-message">Generating...</p>`;
                
                try {
                    const response = await fetch('/ai_explain_impact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: simulationResults
                    });
                    
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    
                    const data = await response.json();
                    if (data.advisory) {
                        aiResponseContainer.innerHTML = `<p>${data.advisory}</p>`;
                        downloadAdvisoryBtn.disabled = false;
                    } else {
                        throw new Error('No advisory received.');
                    }
                } catch (error) {
                    console.error("Failed to fetch AI advisory:", error);
                    aiResponseContainer.innerHTML = `<p class="no-data-message">Error: Failed to generate advisory. Please try again or check API connection.</p>`;
                } finally {
                    explainImpactBtn.disabled = false;
                    explainImpactBtn.textContent = 'Explain Last Impact';
                }
            });
            
            downloadAdvisoryBtn.addEventListener('click', () => {
                const advisoryText = aiResponseContainer.textContent;
                if (advisoryText && !advisoryText.startsWith('No simulation')) {
                    const doc = new window.jspdf.jsPDF();
                    doc.text(advisoryText, 10, 10);
                    doc.save('Impact-Advisory.pdf');
                } else {
                    alert('Please generate an advisory first.');
                }
            });
        }
        
        const glossaryModal = document.getElementById('glossary-modal');
        const openGlossaryBtn = document.getElementById('open-glossary-btn');
        const closeGlossaryBtn = document.getElementById('close-glossary-btn');
        
        if(openGlossaryBtn && glossaryModal) {
            openGlossaryBtn.addEventListener('click', () => {
                glossaryModal.style.display = 'flex';
                glossaryModal.setAttribute('aria-hidden', 'false');
            });
        }
        
        if(closeGlossaryBtn && glossaryModal) {
            closeGlossaryBtn.addEventListener('click', () => {
                glossaryModal.style.display = 'none';
                glossaryModal.setAttribute('aria-hidden', 'true');
            });
        }
    }
    
    // --- Defend Page Logic ---
    function setupDefendChallenge() {
        let timeLeft = 60;
        let timerInterval = null;
        let selectedStrategy = null;
        const commitBtn = document.getElementById('commit-btn');
        const playAgainBtn = document.getElementById('play-again-btn');
        const countdownTimer = document.getElementById('countdown-timer');
        const optionCards = document.querySelectorAll('.option-card');
        const outcomeContainer = document.getElementById('outcome-container');
        const leaderboardList = document.getElementById('leaderboard');
        
        const IMPACT_PARAMS = {
            size: 2500, // A large, dangerous asteroid
            speed: 35,
            angle: 45,
            lat: 34.0522,
            lng: -118.2437
        };

        const STRATEGY_MODIFIERS = {
            kinetic: { success_chance: 0.7, speed_mod: -5, size_mod: 0 },
            gravity: { success_chance: 0.4, speed_mod: -2, size_mod: 0 },
            nuclear: { success_chance: 0.95, speed_mod: -10, size_mod: -500 }
        };

        function startTimer() {
            countdownTimer.textContent = timeLeft;
            timerInterval = setInterval(() => {
                timeLeft--;
                countdownTimer.textContent = timeLeft;
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    endGame(false, "You ran out of time! The asteroid hit with its full force.");
                }
            }, 1000);
        }
        
        function selectStrategy(card) {
            optionCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedStrategy = card.dataset.strategy;
            commitBtn.disabled = false;
        }
        
        optionCards.forEach(card => {
            card.addEventListener('click', () => selectStrategy(card));
            card.addEventListener('keydown', (e) => {
                 if(e.key === ' ' || e.key === 'Enter') {
                     selectStrategy(card);
                 }
            });
        });

        commitBtn.addEventListener('click', () => {
            if (selectedStrategy) {
                clearInterval(timerInterval);
                runChallengeSimulation(selectedStrategy);
            }
        });
        
        function endGame(success, message) {
            commitBtn.disabled = true;
            optionCards.forEach(c => c.style.pointerEvents = 'none');
            
            outcomeContainer.style.display = 'block';
            outcomeContainer.className = `outcome-container ${success ? 'outcome-success' : 'outcome-failure'}`;
            outcomeContainer.innerHTML = `
                <h3>${success ? 'Mission Successful!' : 'Mission Failed!'}</h3>
                <p>${message}</p>
                <button id="play-again-btn" class="btn btn-primary"><i class="fas fa-redo"></i> Play Again</button>
            `;
            
            document.getElementById('play-again-btn').addEventListener('click', () => {
                location.reload();
            });
        }

        async function runChallengeSimulation(strategy) {
            const modifiers = STRATEGY_MODIFIERS[strategy];
            
            const randomFactor = Math.random();
            const success = randomFactor < modifiers.success_chance;
            
            const finalParams = {
                ...IMPACT_PARAMS,
                speed: IMPACT_PARAMS.speed + modifiers.speed_mod,
                size: IMPACT_PARAMS.size + modifiers.size_mod
            };
            
            if (success) {
                finalParams.speed = Math.max(5, finalParams.speed); // Ensure it doesn't go below minimum speed
                finalParams.size = Math.max(10, finalParams.size); // Ensure it doesn't go below minimum size
            } else {
                finalParams.speed = IMPACT_PARAMS.speed;
                finalParams.size = IMPACT_PARAMS.size;
            }
            
            try {
                 const response = await fetch('/simulate', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(finalParams)
                 });
                 const results = await response.json();
                 
                 let outcomeMessage = "";
                 let score = 0;
                 if (success) {
                     score = 100000000 - results.affected_population;
                     outcomeMessage = `You successfully defended Earth! The asteroid's trajectory was altered, reducing the blast radius to ${results.blast_radius} km and saving an estimated ${score.toLocaleString()} people!`;
                 } else {
                     outcomeMessage = `Your strategy failed. The asteroid impacted with full force, resulting in a blast radius of ${results.blast_radius} km and an estimated population loss of ${results.affected_population.toLocaleString()}.`;
                 }
                 
                 updateLeaderboard(score);
                 endGame(success, outcomeMessage);

             } catch (error) {
                 console.error("Challenge simulation failed:", error);
                 endGame(false, "An error occurred during the simulation.");
            }
        }
        
        function getLeaderboard() {
            const leaderboard = JSON.parse(localStorage.getItem('leaderboard')) || [];
            return leaderboard.sort((a, b) => b.score - a.score);
        }

        function updateLeaderboard(newScore) {
            if (newScore <= 0) return;
            let leaderboard = getLeaderboard();
            const playerName = prompt("New High Score! Enter your name:") || "Anonymous";
            leaderboard.push({ name: playerName, score: newScore });
            leaderboard.sort((a, b) => b.score - a.score);
            leaderboard = leaderboard.slice(0, 10);
            localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
            renderLeaderboard();
        }
        
        function renderLeaderboard() {
            const leaderboard = getLeaderboard();
            leaderboardList.innerHTML = '';
            leaderboard.forEach((item, index) => {
                const li = document.createElement('li');
                li.classList.add('leaderboard-item');
                li.innerHTML = `
                    <span class="leaderboard-rank">#${index + 1}</span>
                    <span class="leaderboard-name">${item.name}</span>
                    <span class="leaderboard-score">${item.score.toLocaleString()}</span>
                `;
                leaderboardList.appendChild(li);
            });
        }
        
        // Initial setup
        startTimer();
        renderLeaderboard();
    }
    
    // --- Learn Page Logic ---
    function setupLearnPage() {
        // Kinetic Energy Slider
        const massSlider = document.getElementById('mass-slider');
        const velocitySlider = document.getElementById('velocity-slider');
        const massValueSpan = document.getElementById('mass-value');
        const velocityValueSpan = document.getElementById('velocity-value');
        const energyResultSpan = document.getElementById('energy-result');

        const updateEnergy = () => {
            const mass = parseFloat(massSlider.value);
            const velocity = parseFloat(velocitySlider.value) * 1000; // km/s to m/s
            const energy = 0.5 * mass * velocity ** 2;
            energyResultSpan.textContent = `${(energy / 1e6).toFixed(2)} MJ`; // Convert to MegaJoules
            massValueSpan.textContent = `${mass} kg`;
            velocityValueSpan.textContent = `${velocity / 1000} km/s`;
        };

        if(massSlider) {
             massSlider.addEventListener('input', updateEnergy);
             velocitySlider.addEventListener('input', updateEnergy);
             updateEnergy();
        }
        
        // Quiz Logic
        const quizData = [
            {
                question: 'What determines an asteroid’s impact energy?',
                options: ["Mass and Velocity", "Color and Shape", "Distance from Earth"],
                answer: 'A'
            },
            {
                question: 'What is the primary planetary defense strategy for a slow-moving asteroid with a long lead time?',
                options: ["Nuclear Deflection", "Kinetic Impactor", "Gravity Tractor"],
                answer: 'C'
            },
            {
                 question: 'What does a high orbital eccentricity value (close to 1) represent?',
                options: ["A highly elliptical (stretched) orbit", "A perfectly circular orbit", "An unstable orbit with no predictable path"],
                answer: 'A'
            }
        ];
        
        let currentQuestionIndex = 0;
        const quizOptions = document.querySelectorAll('.quiz-option');
        const nextQuestionBtn = document.getElementById('next-question-btn');
        const feedbackMessage = document.getElementById('feedback-message');
        
        const loadQuestion = () => {
            const currentQ = quizData[currentQuestionIndex];
            document.getElementById('question-text').textContent = currentQ.question;
            currentQ.options.forEach((optionText, index) => {
                quizOptions[index].textContent = optionText;
            });
            
            quizOptions.forEach(btn => {
                btn.classList.remove('correct', 'incorrect');
                btn.disabled = false;
            });
            feedbackMessage.textContent = '';
            nextQuestionBtn.style.display = 'none';
        };
        
        const checkAnswer = (selectedAnswer) => {
            const correct = selectedAnswer === quizData[currentQuestionIndex].answer;
            quizOptions.forEach(btn => btn.disabled = true);
            
            if (correct) {
                feedbackMessage.textContent = 'Correct! Well done, Sentinel.';
                feedbackMessage.style.color = 'var(--color-accent-green)';
            } else {
                feedbackMessage.textContent = 'Incorrect. Try again to refine your knowledge.';
                feedbackMessage.style.color = 'var(--color-accent-critical)';
            }
            
            quizOptions.forEach(btn => {
                if (btn.dataset.answer === quizData[currentQuestionIndex].answer) {
                    btn.classList.add('correct');
                } else if (btn.dataset.answer === selectedAnswer) {
                    btn.classList.add('incorrect');
                }
            });
            
            nextQuestionBtn.style.display = 'block';
            if (currentQuestionIndex === quizData.length - 1) {
                nextQuestionBtn.textContent = 'Restart Quiz';
            } else {
                 nextQuestionBtn.textContent = 'Next Question';
            }
        };
        
        if (quizOptions.length > 0) {
            loadQuestion();
            quizOptions.forEach(btn => {
                 btn.addEventListener('click', (e) => checkAnswer(e.target.dataset.answer));
            });
            nextQuestionBtn.addEventListener('click', () => {
                 currentQuestionIndex++;
                 if (currentQuestionIndex < quizData.length) {
                    loadQuestion();
                 } else {
                    currentQuestionIndex = 0;
                    loadQuestion();
                 }
            });
        }
    }


    // --- Sentinel AI Chatbot Logic ---
    if (chatbotToggles) {
      chatbotToggles.forEach(toggle => {
          toggle.addEventListener('click', () => {
              chatbotVisible = !chatbotVisible;
              if (chatbotContainer) {
                  chatbotContainer.style.display = chatbotVisible ? 'flex' : 'none';
              }
          });
      });
    }

    if (closeChatbotBtn) {
        closeChatbotBtn.addEventListener('click', () => {
            chatbotVisible = false;
            if (chatbotContainer) {
                chatbotContainer.style.display = 'none';
            }
        });
    }

    if (chatbotSendBtn) {
        chatbotSendBtn.addEventListener('click', sendMessage);
    }
    if (chatbotInput) {
        chatbotInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    async function sendMessage() {
        const message = chatbotInput.value.trim();
        if (message === '') return;

        appendMessage('user', message);
        chatbotInput.value = '';
        chatStatus.textContent = 'Sentinel AI is typing...';
        
        const loadingMessage = appendMessage('ai', '...');
        loadingMessage.classList.add('loading-placeholder');

        try {
            const response = await fetch('/chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });

            if (!response.ok) throw new Error('Server returned an error for the chatbot request.');

            const data = await response.json();
            
            loadingMessage.classList.remove('loading-placeholder');
            loadingMessage.textContent = data.response;

        } catch (error) {
            console.error("Sentinel AI communication failed:", error);
            loadingMessage.classList.remove('loading-placeholder');
            loadingMessage.textContent = "Sentinel AI: Connection interrupted. Please check your network.";
        } finally {
            chatStatus.textContent = 'Online';
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        }
    }

    function appendMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
        
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.textContent = text;

        const iconDiv = document.createElement('div');
        iconDiv.classList.add('message-icon');
        iconDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user-astronaut"></i>' : '<i class="fas fa-robot"></i>';

        messageDiv.appendChild(iconDiv);
        messageDiv.appendChild(contentDiv);
        
        chatbotMessages.appendChild(messageDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

        return contentDiv;
    }

    function updateRealTimeClock() {
        const timeElement = document.getElementById('system-time');
        const dateElement = document.getElementById('system-date');
        const locationElement = document.getElementById('system-location');
        
        function update() {
            const now = new Date();
            const utcTime = now.getUTCHours() + ':' + now.getUTCMinutes().toString().padStart(2, '0') + ':' + now.getUTCSeconds().toString().padStart(2, '0');
            const localTime = now.toLocaleTimeString('en-US', { hour12: false });
            const localDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            if (timeElement) timeElement.textContent = `Local: ${localTime}`;
            if (dateElement) dateElement.textContent = localDate;
        }

        setInterval(update, 1000);
        update(); // Initial call
        
        // Get and display user's location
        if (locationElement) {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(position => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`)
                        .then(response => response.json())
                        .then(data => {
                            const address = data.address;
                            const city = address.city || address.town || address.village || '';
                            const country = address.country || '';
                            locationElement.textContent = `Location: ${city}, ${country}`;
                        })
                        .catch(error => {
                            console.error("Geocoding failed:", error);
                            locationElement.textContent = 'Location: N/A';
                        });
                }, error => {
                    console.error("Geolocation failed:", error);
                    locationElement.textContent = 'Location: N/A';
                });
            } else {
                locationElement.textContent = 'Location: Geolocation not supported';
            }
        }
    }
    initPage();
});

// Tooltip/Popover script
document.addEventListener('mouseover', function(e) {
    const target = e.target.closest('[data-tooltip-id]');
    if (target) {
        const tooltipId = target.getAttribute('data-tooltip-id');
        const tooltipContainer = document.getElementById('tooltip-container');
        const tooltipContent = document.getElementById('tooltip-content');

        const tooltipData = {
            'tooltip-semimajor': 'The semi-major axis (a) is half of the longest diameter of an elliptical orbit. It determines the size of the orbit.',
            'tooltip-eccentricity': 'Eccentricity (e) describes the shape of an orbit. A value of 0 is a perfect circle, while values closer to 1 are more elongated ellipses.',
            'tooltip-inclination': 'Inclination (i) is the vertical tilt of the orbital plane relative to a reference plane (e.g., Earth\'s equator).',
            'tooltip-longAsc': 'The longitude of the ascending node (Ω) is the angle from the reference direction to the point where the orbit crosses the reference plane from south to north.',
            'tooltip-argPeri': 'The argument of periapsis (ω) is the angle from the ascending node to the point in the orbit where the object is closest to the central body (periapsis).',
            'tooltip-trueAnomaly': 'True anomaly (ν) is the angle between the periapsis and the object\'s current position on its orbit.',
            'tooltip-energy': 'The kinetic energy of the impact, measured in megatons of TNT equivalent. This is the primary driver of all other effects.',
            'tooltip-crater': 'The size of the permanent hole in the ground caused by the impact. Larger craters imply a larger blast.',
            'tooltip-seismic': 'The magnitude of the earthquake generated by the impact, measured on the Richter scale. It can cause significant damage far from ground zero.',
            'tooltip-tsunami': 'The maximum estimated height of a wave generated by a water impact. This can cause catastrophic flooding in coastal regions.',
            'tooltip-diameter': 'Impact energy is proportional to the cube of the asteroid\'s diameter. Larger asteroids cause significantly more damage.',
            'tooltip-velocity': 'Impact energy is proportional to the square of the impact velocity. A faster asteroid releases much more energy.',
        };

        const content = tooltipData[tooltipId] || 'No information available.';
        tooltipContent.textContent = content;

        const rect = target.getBoundingClientRect();
        tooltipContainer.style.top = `${rect.bottom + window.scrollY + 10}px`;
        tooltipContainer.style.left = `${rect.left + window.scrollX}px`;
        tooltipContainer.style.display = 'block';
    }
});

document.addEventListener('mouseout', function(e) {
    const tooltipContainer = document.getElementById('tooltip-container');
    if (e.target.closest('[data-tooltip-id]')) {
        setTimeout(() => {
            if (!tooltipContainer.matches(':hover')) {
                tooltipContainer.style.display = 'none';
            }
        }, 100);
    }
});