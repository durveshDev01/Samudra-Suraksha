
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return showToast(message, 'info'); // fallback
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

// coastalinfo.js - Small Vessel Advisory Service (SVAS)
let coastalMap;
let coastalGeoJsonLayer;
let threatData = [];
let lastUpdateTime = null;
let dataTableInstance = null;

// Vessel Map Variables
let vesselMap;
let geojsonData;
let uniqueDates;
let advisoryData;
let pointsLayer;
let polygonsLayer;
let selectedLanguage = 'ENG';
let selectedBoatSize = '4';
let playInterval;
let getLocationValue = 0;
let userLocationMarker;

const stateZoomLevels = {
    "ANDAMAN AND NICOBAR": { lat: 11.7401, lng: 92.6586, zoom: 8 },
    "ANDHRA PRADESH": { lat: 15.9129, lng: 79.7400, zoom: 8 },
    "DAMAN AND DIU": { lat: 20.4283, lng: 72.8397, zoom: 8 },
    "GOA": { lat: 15.2993, lng: 74.1240, zoom: 9 },
    "GUJARAT": { lat: 22.2587, lng: 71.1924, zoom: 8 },
    "KERALA": { lat: 10.8505, lng: 76.2711, zoom: 8 },
    "KARNATAKA": { lat: 13.9827, lng: 74.47, zoom: 8 },
    "LAKSHADWEEP": { lat: 10.328026, lng: 72.784634, zoom: 8 },
    "MAHARASHTRA": { lat: 19.7515, lng: 75.7139, zoom: 8 },
    "ORISSA": { lat: 20.9517, lng: 85.0985, zoom: 7 },
    "PUDUCHERRY": { lat: 11.9299, lng: 79.8297, zoom: 10 },
    "TAMIL NADU": { lat: 11.1271, lng: 78.6569, zoom: 7 },
    "WEST BENGAL": { lat: 22.9868, lng: 87.8550, zoom: 8 },
    "AllIndia": { lat: 20, lng: 80, zoom: 4 }
};

// Cache GeoJSON data
let cachedGeoJsonData = null;

// Initialize Coastal Map
function initializeCoastalMap() {
    const mapContainer = document.getElementById('coastal-map-container');
    if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        console.error('Coastal map container not ready or invalid dimensions');
        setTimeout(initializeCoastalMap, 500);
        return;
    }

    showLoadingIndicator(true);

    try {
        if (coastalMap) {
            coastalMap.invalidateSize();
            fetchAndProcessCoastalData();
            return;
        }

        coastalMap = L.map('coastal-map-container', {
            preferCanvas: true,
            renderer: L.canvas({ padding: 0.5 }),
            minZoom: 4,
            maxZoom: 8
        }).setView([20, 80], 4);

        // Restore original Esri tile layer
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
            minZoom: 4,
            maxZoom: 18
        }).addTo(coastalMap);

        // Add WMS layer
        L.tileLayer.wms('https://samudra.incois.gov.in/geoserver/it.geosolutions/wms/', {
            layers: 'it.geosolutions:SOI_STATE_BOUNDARY',
            format: 'image/png',
            transparent: true
        }).addTo(coastalMap);

        // Add heatmap layer (optional)
        if (typeof L.heatLayer === 'function') {
            const heatLayer = L.heatLayer([], {
                radius: 25,
                blur: 15,
                maxZoom: 8
            }).addTo(coastalMap);
            coastalMap.heatLayer = heatLayer;
        } else {
            console.warn('Leaflet.heat plugin not loaded. Heatmap will not be displayed.');
        }

        // Restore original legend
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function () {
            const div = L.DomUtil.create('div', 'legend bg-white p-2 rounded shadow');
            div.innerHTML = `
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-red-600"></span>Warning</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-orange-500"></span>Alert</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-yellow-500"></span>Watch</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-green-500"></span>No Threat</div>
            `;
            return div;
        };
        legend.addTo(coastalMap);

        setTimeout(() => {
            coastalMap.invalidateSize();
            coastalMap.setView([20, 80], 4);
        }, 100);
        
        fetchAndProcessCoastalData();

        // Auto-refresh every 15 minutes
        setInterval(fetchAndProcessCoastalData, 15 * 60 * 1000);
    } catch (error) {
        console.error('Failed to initialize coastal map:', error);
        showLoadingIndicator(false);
        showToast('Failed to initialize coastal map: ' + error.message, 'error');
    }
}

// Show/hide loading indicator
function showLoadingIndicator(show) {
    const mapContainer = document.getElementById('coastal-map-container');
    let loader = document.getElementById('map-loader');
    if (!loader && show) {
        loader = document.createElement('div');
        loader.id = 'map-loader';
        loader.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.8); padding: 20px; border-radius: 5px;
            z-index: 1000; font-size: 16px; color: #333; text-align: center;
        `;
        loader.innerHTML = 'Loading data...';
        mapContainer.appendChild(loader);
    }
    if (loader) {
        loader.style.display = show ? 'block' : 'none';
    }
}

// Fetch and Process Coastal Data
async function fetchAndProcessCoastalData() {
    showLoadingIndicator(true);
    try {
        console.log('Fetching coastal data...');
        const [hwassaResponse, currentsResponse, geoJsonResponse] = await Promise.all([
            fetch('https://sarat.incois.gov.in/incoismobileappdata/rest/incois/hwassalatestdata').catch(() => ({ ok: false })),
            fetch('https://samudra.incois.gov.in/incoismobileappdata/rest/incois/currentslatestdata').catch(() => ({ ok: false })),
            cachedGeoJsonData ? Promise.resolve({ ok: true, json: () => cachedGeoJsonData }) : fetch('https://samudra.incois.gov.in/incoismobileappdata/rest/incois/districtpolygons').catch(() => ({ ok: false }))
        ]);

        threatData = [];
        let atleastOneAlertPresent = false;

        if (hwassaResponse.ok) {
            const hwassaRawData = await hwassaResponse.json();
            if (hwassaRawData.LatestHWADate !== "None") {
                threatData = threatData.concat(JSON.parse(hwassaRawData.HWAJson));
                atleastOneAlertPresent = true;
            } else {
                console.log("No HWASSA data available.");
            }
            if (hwassaRawData.LatestSSADate !== "None") {
                threatData = threatData.concat(JSON.parse(hwassaRawData.SSAJson));
                atleastOneAlertPresent = true;
            } else {
                console.log("No SSA data available.");
            }
        }

        if (currentsResponse.ok) {
            const currentsRawData = await currentsResponse.json();
            if (currentsRawData.LatestCurrentsDate !== "None") {
                threatData = threatData.concat(JSON.parse(currentsRawData.CurrentsJson));
                atleastOneAlertPresent = true;
            } else {
                console.log("No currents data available.");
            }
        }

        if (atleastOneAlertPresent && geoJsonResponse.ok) {
            const geoJsonData = cachedGeoJsonData || await geoJsonResponse.json();
            cachedGeoJsonData = cachedGeoJsonData || geoJsonData; // Cache GeoJSON

            // Update heatmap (if available)
            if (coastalMap.heatLayer && threatData.some(threat => threat.Latitude && threat.Longitude)) {
                const heatPoints = threatData
                    .filter(threat => threat.Latitude && threat.Longitude)
                    .map(threat => [threat.Latitude, threat.Longitude, threat.Alert === 'WARNING' ? 1 : 0.5]);
                coastalMap.heatLayer.setLatLngs(heatPoints);
            }

            geoJsonData.features.forEach(feature => {
                feature.properties.cumulativeThreat = determineCumulativeThreat(
                    threatData.filter(threat => threat.District === feature.properties.District)
                );
            });

            if (coastalGeoJsonLayer) {
                coastalMap.removeLayer(coastalGeoJsonLayer);
            }
            coastalGeoJsonLayer = L.geoJson(geoJsonData, {
                style: style,
                onEachFeature: onEachFeature
            }).addTo(coastalMap);

            populateCoastalTable(threatData, geoJsonData);

            lastUpdateTime = new Date();
            updateLastUpdateDisplay();
            console.log('Coastal data updated successfully');
        } else {
            const tableContainer = document.getElementById('coastal-table-container');
            tableContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items: center;"><h4>No forecast information found</h4></div>';
            if (coastalGeoJsonLayer) {
                coastalMap.removeLayer(coastalGeoJsonLayer);
                coastalGeoJsonLayer = null;
            }
            if (coastalMap.heatLayer) {
                coastalMap.heatLayer.setLatLngs([]);
            }
        }
    } catch (error) {
        console.error('Error fetching coastal data:', error);
        showToast('Failed to load coastal data: ' + error.message, 'error');
    } finally {
        showLoadingIndicator(false);
    }
}

function getColor(threatLevel) {
    switch (threatLevel) {
        case 'WARNING': return 'red';
        case 'ALERT': return 'orange';
        case 'WATCH': return 'yellow';
        default: return 'green';
    }
}

function style(feature) {
    return {
        fillColor: getColor(feature.properties.cumulativeThreat),
        weight: 0.5,
        opacity: 1,
        color: 'black',
        fillOpacity: 1
    };
}

function determineCumulativeThreat(threats) {
    if (threats.some(threat => threat.Alert.includes('WARNING'))) return 'WARNING';
    if (threats.some(threat => threat.Alert.includes('ALERT'))) return 'ALERT';
    if (threats.some(threat => threat.Alert.includes('WATCH'))) return 'WATCH';
    return 'No Threat';
}

function onEachFeature(feature, layer) {
    if (!feature.properties) return;
    const threatsForFeature = threatData.filter(threat => threat.District === feature.properties.District);
    const accordionId = `accordion-${feature.properties.District.replace(/\s+/g, '-')}`;
    let popupContent = `
        <p><b>District:</b> <span style='font-weight:bold;'>${feature.properties.District}</span></p>
        <p><b>Ocean State Forecast Status:</b> <span style='font-weight:bold;color:${getColor(feature.properties.cumulativeThreat)}'>${feature.properties.cumulativeThreat}</span></p>
        <div class='accordion' id='${accordionId}'>
    `;
    const threatPriority = { 'WARNING': 1, 'ALERT': 2, 'WATCH': 3, 'No Threat': 4 };
    let highestThreatLevel = 'No Threat';
    threatsForFeature.forEach(threat => {
        if (threatPriority[threat.Alert] < threatPriority[highestThreatLevel]) {
            highestThreatLevel = threat.Alert;
        }
    });

    threatsForFeature.forEach((threat, index) => {
        const isHighestThreat = threat.Alert === highestThreatLevel;
        const itemId = `collapse-${feature.properties.District.replace(/\s+/g, '-')}-${index}`;
        const headerId = `heading-${feature.properties.District.replace(/\s+/g, '-')}-${index}`;
        const color = getColor(threat.Alert);
        popupContent += `
            <div class='accordion-item'>
                <h4 class='accordion-header' id='${headerId}' style='background-color:${color};'>
                    <button class='accordion-button ${isHighestThreat ? '' : 'collapsed'}' type='button' data-toggle='collapse' 
                        data-target='#${itemId}' aria-expanded='${isHighestThreat}' aria-controls='${itemId}'>
                        ${threat.Alert}
                    </button>
                </h4>
                <div id='${itemId}' class='accordion-collapse collapse ${isHighestThreat ? 'show' : ''}' 
                    aria-labelledby='${headerId}' data-parent='#${accordionId}'>
                    <div class='accordion-body'>${threat.Message}</div>
                </div>
            </div>
        `;
    });
    popupContent += `</div>`;
    layer.bindPopup(popupContent);
}

function populateCoastalTable(data, geoJsonData) {
    const tableContainer = document.getElementById('coastal-table-container');
    if (!tableContainer) return;

    if (dataTableInstance) {
        dataTableInstance.destroy();
        dataTableInstance = null;
    }

    let districtThreatMapping = {};
    geoJsonData.features.forEach(feature => {
        districtThreatMapping[feature.properties.District] = determineCumulativeThreat(
            data.filter(threat => threat.District === feature.properties.District)
        );
    });

    data.sort((a, b) => a.STATE === b.STATE ? a.District.localeCompare(b.District) : a.STATE.localeCompare(b.STATE));

    const table = document.createElement('table');
    table.id = 'ThreatTable';
    table.classList.add('table', 'table-striped', 'table-bordered', 'display');
    table.style.width = '100%';

    const headerRow = table.createTHead().insertRow();
    ['State', 'District', 'Cumulative Threat', 'Service Alert', 'Message', 'Issue Date'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    const tbody = table.createTBody();
    data.forEach(item => {
        const row = tbody.insertRow();
        row.classList.add(item.STATE.replace(/\s/g, ''));
        const cumulativeThreat = districtThreatMapping[item.District] || 'No Data';
        const cells = [
            item.STATE,
            item.District,
            `<mark class="${getColor(cumulativeThreat)}">${cumulativeThreat}</mark>`,
            item.Alert,
            item.Message,
            item['Issue Date'] || 'N/A'
        ];
        cells.forEach((cell, index) => {
            const td = row.insertCell();
            td.innerHTML = cell;
            if (index === 2) {
                td.style.color = getColor(cumulativeThreat);
                td.style.fontWeight = 'bold';
            }
            if (index === 3) {
                td.style.backgroundColor = item.Color || 'transparent';
            }
        });
    });

    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);

    try {
        dataTableInstance = $('#ThreatTable').DataTable({
            paging: true,
            searching: true,
            ordering: true,
            info: true,
            lengthChange: false,
            pageLength: 10,
            responsive: true,
            autoWidth: false,
            deferRender: true,
            columnDefs: [
                { targets: [4], width: '40%' },
                { targets: [0, 1, 2, 3, 5], width: '12%' }
            ]
        });
    } catch (error) {
        console.error('DataTables initialization error:', error);
    }
}

function updateLastUpdateDisplay() {
    const updateElement = document.getElementById('last-update-time');
    if (updateElement && lastUpdateTime) {
        updateElement.textContent = `Last updated: ${lastUpdateTime.toLocaleString()}`;
    }
}

function sortAndReorderRows(selectedStateName) {
    if (!dataTableInstance) return;
    dataTableInstance.column(0).search(selectedStateName.toUpperCase() === 'ALLINDIA' ? '' : selectedStateName).draw();
}

// ==================== VESSEL MAP FUNCTIONS ====================

function initializeVesselMap() {
    const vesselMapContainer = document.getElementById('vessel-map-container');
    if (!vesselMapContainer) {
        console.error('Vessel map container not found');
        return;
    }

    try {
        // Clear existing map
        if (vesselMap) {
            vesselMap.remove();
        }

        // Set India bounds
        const indiaBounds = L.latLngBounds(
            [6.4627, 68.1097],
            [35.5133, 97.3956]
        );

        // Create new map with larger size
        vesselMap = L.map('vessel-map-container', {
            maxBounds: indiaBounds,
            maxBoundsViscosity: 1.0,
            minZoom: 5,
            maxZoom: 8
        }).setView([15.8475627, 78.1324306], 6);

        // Add the Esri basemap layer
        var baseMap = L.esri.basemapLayer('Topographic', {});
        vesselMap.attributionControl.addAttribution('Contributors <a href="https://incois.gov.in/site/index.jsp">INCOIS</a>');

        // Add SOI State Boundary layer
        const indiaSOITileLayerUrl = "https://samudra.incois.gov.in/geoserver/it.geosolutions/wms/";
        let indiaSOIVectorTileLayer = L.tileLayer.wms(indiaSOITileLayerUrl, {
            layers: 'it.geosolutions:SOI_STATE_BOUNDARY',
            format: 'image/png',
            transparent: true,
        });

        baseMap.addTo(vesselMap);
        indiaSOIVectorTileLayer.addTo(vesselMap);

        // Add cursor location display
        const cursorLocation = L.control({ position: 'bottomright' });
        cursorLocation.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'cursor-location-control');
            div.innerHTML = '<div id="vessel-cursor-coordinates" style="background: rgba(255, 255, 255, 0.8); padding: 5px; border-radius: 5px;"></div>';
            return div;
        };
        cursorLocation.addTo(vesselMap);

        vesselMap.on('mousemove', function(e) {
            if (getLocationValue == 0){
                document.getElementById('vessel-cursor-coordinates').innerHTML = `Cursor Location = Latitude: ${e.latlng.lat.toFixed(3)}°N, Longitude: ${e.latlng.lng.toFixed(3)}°E`;
            } else {
                document.getElementById('vessel-cursor-coordinates').innerHTML = `<div>My Location: Latitude: ${ulati.toFixed(3)}°N, Longitude: ${ulng.toFixed(3)}°E</div> 
                <div>Cursor Location = Latitude: ${e.latlng.lat.toFixed(3)}°N, Longitude: ${e.latlng.lng.toFixed(3)}°E</div>`;
            }
        });

        // Add overlay controls
        const overlayControl = L.Control.extend({
            onAdd: function () {
                const div = L.DomUtil.create('div', 'overlay-control');
                div.innerHTML = `
                <label title="Need minimum 8GB RAM in your PC">
                <input type="checkbox" id="toggle-points" style="background-color:white;">  
                Animation &nbsp;   
                </label>
                <label><input type="checkbox" id="toggle-polygons" style = "background-color:white;" checked> Distance-wise Advisories &nbsp;  </label>
                `;
                div.style.backgroundColor = 'none';
                div.style.padding = '5px';
                return div;
            }
        });

        vesselMap.addControl(new overlayControl({ position: 'topright' }));

        // Add playback controls
        const PlaybackControls = L.Control.extend({
            onAdd: function () {
                const div = L.DomUtil.create('div', 'playback-controls');
                div.innerHTML = `
                    <img src="first.png" id="first-button" title="First">
                    <img src="prev.png" id="prev-button" title="Previous">
                    <img src="play.png" id="play-button" title="Play" style= "box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2); 
                    background-color: rgba(255, 255, 255, 0.2); 
                    padding: 10px; 
                    box-shadow: 0 2px 5px rgba(0, 0, 0);
                    width: 15px;
                    height: 15px;
                    margin: 0 5px;
                    transition: transform 0.1s ease;">
                    <img src="pause.png" id="pause-button" title="Pause" style="display:none; 
                    background-color: rgba(255, 255, 255, 0.2); 
                    padding: 10px; 
                    box-shadow: 0 2px 5px rgba(0, 0, 0);
                    width: 15px;
                    height: 15px;
                    margin: 0 5px;
                    transition: transform 0.1s ease;">
                    <img src="next.png" id="next-button" title="Next">
                    <img src="last.png" id="last-button" title="Last">
                    <div>
                        <input type="range" id="date-slider" min="0" step="1" style="width: 80%;">
                        <div id="date-display"></div>
                    </div>
                `;
                return div;
            }
        });

        const playbackControls = new PlaybackControls({ position: 'bottomleft' });
        vesselMap.addControl(playbackControls);
        document.querySelector('.playback-controls').style.display = 'none';

        // Add location button
        const locationButtonControl = L.Control.extend({
            onAdd: function () {
                const div = L.DomUtil.create('div', 'location-button-control');
                div.innerHTML = `
                    <button id="vessel-locate-button" style="
                        background: blue;
                        border-radius:60px;
                        margin-right:30px;
                        ">
                        <img src="location.png" id="vessel-location-button" style="
                        max-width: 20px;
                        margin-top: 3px;
                        margin-right: 0px;
                        margin-left: 0px;"title="Locate Me"></button>
                `;
                return div;
            }
        });

        const locationButton = new locationButtonControl({ position: 'topright'});
        vesselMap.addControl(locationButton);

        // Load GeoJSON data
        fetch('SVAS_Animation.geojson')
            .then(response => response.json())
            .then(data => {
                geojsonData = data;
                const features = geojsonData.features;
                uniqueDates = [...new Set(features.map(feature => feature.properties.Date))];

                const dateSlider = document.getElementById('date-slider');
                dateSlider.max = uniqueDates.length - 1;

                dateSlider.addEventListener('input', (event) => {
                    const currentIndex = event.target.value;
                    const currentDate = uniqueDates[currentIndex];
                    const filteredFeatures = filterFeaturesByDate(features, currentDate, selectedBoatSize);
                    plotGeoJSONFeatures(filteredFeatures);
                    updateDateDisplay(currentDate);
                });
            })
            .catch(error => {
                console.error('Error fetching GeoJSON data:', error);
            });

        // Load advisory data
        fetch('SVAS_Advisory.geojson')
            .then(response => response.json())
            .then(data => {
                advisoryData = data;
                updateVesselMap();
            });

        // Setup event listeners for vessel map
        setupVesselMapEventListeners();

        // Ensure map is properly sized
        setTimeout(() => {
            vesselMap.invalidateSize();
        }, 100);

        console.log('Vessel map initialized successfully');

    } catch (error) {
        console.error('Failed to initialize vessel map:', error);
        showToast('Failed to initialize vessel map: ' + error.message, 'error');
    }
}

// Vessel Map Helper Functions
function filterFeaturesByDate(features, date, selectedBoatSize) {
    return features.filter(feature => {
        if (feature.properties.Date !== date) {
            return false;
        }
        if (selectedBoatSize === '7') {
            return feature.properties.val === 7;
        } else if (selectedBoatSize === '6') {
            return feature.properties.val === 6 || feature.properties.val === 7;
        } else if (selectedBoatSize === '4') {
            return true;
        }
        return false;
    });
}

function getMarkerStyle(val) {
    return {
        radius: 4,
        fillColor: 'orange',
        color: '#000',
        weight: 0,
        opacity: 1,
        fillOpacity: 0.8,
    };
}

function plotGeoJSONFeatures(features) {
    if (pointsLayer) {
        vesselMap.removeLayer(pointsLayer);
    }

    pointsLayer = L.geoJSON(features, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, getMarkerStyle(feature.properties.val))
    }).addTo(vesselMap);
}

function updateDateDisplay(date) {
    document.getElementById('date-display').innerHTML = `
        <a href="https://incois.gov.in/site/index.jsp" target ="_blank"></a> Date: ${date}`;
}

function playDates() {
    let currentIndex = 0;
    playInterval = setInterval(() => {
        if (currentIndex < uniqueDates.length) {
            const currentDate = uniqueDates[currentIndex];
            const filteredFeatures = filterFeaturesByDate(geojsonData.features, currentDate, selectedBoatSize);
            plotGeoJSONFeatures(filteredFeatures);
            document.getElementById('date-slider').value = currentIndex;
            updateDateDisplay(currentDate);
            currentIndex++;
        } else {
            currentIndex = 0;
        }
    }, 2000);
}

function stopDates() {
    clearInterval(playInterval);
}

function nextDate() {
    const dateSlider = document.getElementById('date-slider');
    let currentIndex = parseInt(dateSlider.value, 10);
    if (currentIndex < uniqueDates.length - 1) {
        currentIndex++;
    } else {
        currentIndex = 0;
    }
    dateSlider.value = currentIndex;
    const currentDate = uniqueDates[currentIndex];
    const filteredFeatures = filterFeaturesByDate(geojsonData.features, currentDate, selectedBoatSize);
    plotGeoJSONFeatures(filteredFeatures);
    updateDateDisplay(currentDate);
}

function prevDate() {
    const dateSlider = document.getElementById('date-slider');
    let currentIndex = parseInt(dateSlider.value, 10);
    if (currentIndex > 0) {
        currentIndex--;
    } else {
        currentIndex = uniqueDates.length - 1;
    }
    dateSlider.value = currentIndex;
    const currentDate = uniqueDates[currentIndex];
    const filteredFeatures = filterFeaturesByDate(geojsonData.features, currentDate, selectedBoatSize);
    plotGeoJSONFeatures(filteredFeatures);
    updateDateDisplay(currentDate);
}

function firstDate() {
    const dateSlider = document.getElementById('date-slider');
    dateSlider.value = 0;
    const currentDate = uniqueDates[0];
    const filteredFeatures = filterFeaturesByDate(geojsonData.features, currentDate, selectedBoatSize);
    plotGeoJSONFeatures(filteredFeatures);
    updateDateDisplay(currentDate);
}

function lastDate() {
    const dateSlider = document.getElementById('date-slider');
    dateSlider.value = uniqueDates.length - 1;
    const currentDate = uniqueDates[uniqueDates.length - 1];
    const filteredFeatures = filterFeaturesByDate(geojsonData.features, currentDate, selectedBoatSize);
    plotGeoJSONFeatures(filteredFeatures);
    updateDateDisplay(currentDate);
}

function onEachVesselFeature(feature, layer) {
    var propertyKey = selectedLanguage + selectedBoatSize;

    if (feature.properties && feature.properties[propertyKey]) {
        var popupContent = `<div id="popup-content" style="position:relative; margin: 0px"></a>${feature.properties[propertyKey]}</div>`;

        if (feature.properties.MoreInfo) {
            popupContent += `<br><strong>More Info:</strong> ${feature.properties.MoreInfo}`;
        }

        var todaydate = formatDate(new Date());
        var districtname = `${feature.properties.name}_${propertyKey}_${todaydate}`;

        popupContent += `
            <br>
            <button 
                onclick="savePopupAsImage('${districtname}')" 
                style="
                    position: absolute; 
                    right: -7px; 
                    bottom:-15px;
                    background-color: blue; 
                    color: white; 
                    font-weight: bold; 
                    border: none; 
                    padding: 8px 12px; 
                    border-radius: 5px;
                    cursor: pointer;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.8);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                "
                onmouseover="this.style.transform='scale(1.2)';"
                onmouseout="this.style.transform='scale(1)';"
                onmousedown="this.style.transform='scale(0.85)';"
                onmouseup="this.style.transform='scale(1.2)'; "
            >
                Save
            </button>
        `;

        layer.bindPopup(popupContent, {
            maxWidth: 800,
            maxHeight: null
        });

        layer.bindTooltip(`
        <div style="max-width: 800px; overflow-y: auto;">
          ${popupContent}
        </div>`, {
            maxWidth: 800
        });
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function styleVesselFeature(feature) {
    let colorKey = 'Color' + selectedBoatSize;
    return {
        color: feature.properties[colorKey] || '#3388ff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.7
    };
}

function updateVesselMap() {
    if (advisoryData) {
        if (polygonsLayer) {
            vesselMap.removeLayer(polygonsLayer);
        }
        document.getElementById('toggle-polygons').checked = true;            
        polygonsLayer = L.geoJSON(advisoryData, {
            onEachFeature: onEachVesselFeature,
            style: styleVesselFeature
        }).addTo(vesselMap);
    }
}

function plotUserLocation(lat, lng) {
    if (userLocationMarker) {
        vesselMap.removeLayer(userLocationMarker);
    }

    userLocationMarker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'Boat.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        })
    }).addTo(vesselMap)
    .bindPopup('You are here!')
    .openPopup();
    
    vesselMap.setView([lat, lng], 6.5);
}

function setupVesselMapEventListeners() {
    // Playback controls
    document.getElementById('play-button').addEventListener('click', () => {
        playDates();
        document.getElementById('prev-button').src = "prev.png";
        document.getElementById('first-button').src = "first.png";
        document.getElementById('last-button').src = "last.png";
        document.getElementById('next-button').src = "next.png";
        document.getElementById('play-button').style.display = 'none';
        document.getElementById('pause-button').style.display = 'inline';
        document.getElementById('prev-button').style.display = 'none';
        document.getElementById('first-button').style.display = 'none';
        document.getElementById('last-button').style.display = 'none';
        document.getElementById('next-button').style.display = 'none';
    });

    document.getElementById('pause-button').addEventListener('click', () => {
        stopDates();
        document.getElementById('prev-button').src = "prev.png";
        document.getElementById('first-button').src = "first.png";
        document.getElementById('last-button').src = "last.png";
        document.getElementById('next-button').src = "next.png";
        document.getElementById('pause-button').style.display = 'none';
        document.getElementById('play-button').style.display = 'inline';
        document.getElementById('prev-button').style.display = 'inline';
        document.getElementById('first-button').style.display = 'inline';
        document.getElementById('last-button').style.display = 'inline';
        document.getElementById('next-button').style.display = 'inline';
    });

    document.getElementById('next-button').addEventListener('click', () => {
        nextDate();
        document.getElementById('prev-button').src = "prev.png";
        document.getElementById('first-button').src = "first.png";
        document.getElementById('last-button').src = "last.png";
        document.getElementById('next-button').src = "nextc.png";
    });

    document.getElementById('prev-button').addEventListener('click', () => {
        prevDate();
        document.getElementById('prev-button').src = "prevc.png";
        document.getElementById('first-button').src = "first.png";
        document.getElementById('last-button').src = "last.png";
        document.getElementById('next-button').src = "next.png";
    });

    document.getElementById('first-button').addEventListener('click', () => {
        firstDate();
        document.getElementById('prev-button').src = "prev.png";
        document.getElementById('first-button').src = "firstc.png";
        document.getElementById('last-button').src = "last.png";
        document.getElementById('next-button').src = "next.png";
    });

    document.getElementById('last-button').addEventListener('click', () => {
        lastDate();
        document.getElementById('prev-button').src = "prev.png";
        document.getElementById('first-button').src = "first.png";
        document.getElementById('last-button').src = "lastc.png";
        document.getElementById('next-button').src = "next.png";
    });

    // Toggle controls
    document.getElementById('toggle-points').addEventListener('change', function () {
        if (this.checked) {
            document.querySelector('.playback-controls').style.display = 'block';
            if (geojsonData && uniqueDates.length > 0) {
                plotGeoJSONFeatures(filterFeaturesByDate(geojsonData.features, uniqueDates[0]));
                firstDate();
            }
        } else {
            document.querySelector('.playback-controls').style.display = 'none';
            if (pointsLayer) {
                vesselMap.removeLayer(pointsLayer);
            }
            clearInterval(playInterval);
        }
    });

    document.getElementById('toggle-polygons').addEventListener('change', function () {
        if (this.checked) {
            updateVesselMap();
        } else {
            if (polygonsLayer) {
                vesselMap.removeLayer(polygonsLayer);
            }
        }
    });

    // Location button
    document.getElementById('vessel-locate-button').addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                ulati = position.coords.latitude;
                ulng = position.coords.longitude;
                getLocationValue = 1;
                plotUserLocation(ulati, ulng);
            }, error => {
                console.error('Error retrieving location:', error);
                showToast('Unable to retrieve your location. Please check your device settings.', 'info');
            });
        } else {
            showToast('Geolocation is not supported by this browser.', 'info');
        }
    });

    // Boat size and language selectors
    document.getElementById('boatSize').addEventListener('change', function () {
        selectedBoatSize = this.value;
        updateVesselMap();
    });

    document.getElementById('coastalLanguage').addEventListener('change', function () {
        selectedLanguage = this.value;
        updateVesselMap();
    });
}

// ==================== MAIN EVENT LISTENERS ====================

function setupCoastalEventListeners() {
    const showMapBtn = document.getElementById('showMap');
    const showTableBtn = document.getElementById('showTable');
    const showMapTableBtn = document.getElementById('showMapTable');
    const showVesselMapBtn = document.getElementById('showVesselMap');
    const stateSelector = document.getElementById('stateSelector');
    const mapContainer = document.getElementById('coastal-map-container');
    const tableContainer = document.getElementById('coastal-table-container');
    const vesselMapContainer = document.getElementById('vessel-map-container');
    const refreshBtn = document.getElementById('refreshCoastalData');

    // Coastal map view buttons
    if (showMapBtn) {
        showMapBtn.addEventListener('click', () => {
            mapContainer.classList.remove('hidden');
            tableContainer.classList.add('hidden');
            if (vesselMapContainer) vesselMapContainer.classList.add('hidden');
            setTimeout(() => coastalMap.invalidateSize(), 100);
        });
    }
    
    if (showTableBtn) {
        showTableBtn.addEventListener('click', () => {
            mapContainer.classList.add('hidden');
            tableContainer.classList.remove('hidden');
            if (vesselMapContainer) vesselMapContainer.classList.add('hidden');
        });
    }
    
    if (showMapTableBtn) {
        showMapTableBtn.addEventListener('click', () => {
            mapContainer.classList.remove('hidden');
            tableContainer.classList.remove('hidden');
            if (vesselMapContainer) vesselMapContainer.classList.add('hidden');
            setTimeout(() => coastalMap.invalidateSize(), 100);
        });
    }

    // Vessel map button
    if (showVesselMapBtn) {
        showVesselMapBtn.addEventListener('click', () => {
            // Hide coastal map and table
            mapContainer.classList.add('hidden');
            tableContainer.classList.add('hidden');
            
            // Show vessel map
            if (vesselMapContainer) {
                vesselMapContainer.classList.remove('hidden');
                // Initialize vessel map if not already done
                if (!vesselMap) {
                    initializeVesselMap();
                } else {
                    setTimeout(() => vesselMap.invalidateSize(), 100);
                }
            }
        });
    }

    if (stateSelector) {
        stateSelector.addEventListener('change', () => {
            const selectedValue = stateSelector.value;
            if (stateZoomLevels[selectedValue]) {
                const { lat, lng, zoom } = stateZoomLevels[selectedValue];
                coastalMap.setView([lat, lng], zoom);
            }
            sortAndReorderRows(selectedValue);
        });
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchAndProcessCoastalData);
    }

    // Window resize handler
    window.addEventListener('resize', () => {
        if (coastalMap) {
            setTimeout(() => coastalMap.invalidateSize(), 300);
        }
        if (vesselMap) {
            setTimeout(() => vesselMap.invalidateSize(), 300);
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set larger map container size
    const mapContainer = document.getElementById('coastal-map-container');
    if (mapContainer) {
        mapContainer.style.minHeight = '600px';
        mapContainer.style.height = '70vh';
    }
    
    const vesselMapContainer = document.getElementById('vessel-map-container');
    if (vesselMapContainer) {
        vesselMapContainer.style.minHeight = '600px';
        vesselMapContainer.style.height = '70vh';
    }

    initializeCoastalMap();
    setupCoastalEventListeners();
});

// Global function for saving popup as image
window.savePopupAsImage = function (districtname, borderWidth = 20, borderColor = 'white') {
    // Implementation for saving popup as image
    console.log('Save image function called for:', districtname);
    // Add your html2canvas implementation here
};