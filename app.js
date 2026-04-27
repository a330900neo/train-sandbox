import { TrackManager } from './trackManager.js';
import { GeometryEngine } from './geometry.js';

// --- Initialization ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', // Clean base map
    center: [114.1694, 22.3193], // Default center (Hong Kong)
    zoom: 16,
    pitch: 0
});

// State Management
const state = {
    mode: 'pan', // 'pan', 'build', 'select'
    layer: 1,
    previewCoords: [],
    selectedTracks: []
};

const trackManager = new TrackManager(map);
const geoEngine = new GeometryEngine();

map.on('load', () => {
    trackManager.initLayers();
    setupUIEvents();
    setupMapEvents();
});

// --- Map Interactions ---
function setupMapEvents() {
    map.on('click', (e) => {
        if (state.mode === 'build') {
            handleBuildClick(e.lngLat);
        } else if (state.mode === 'select') {
            handleSelectClick(e);
        }
    });

    map.on('mousemove', (e) => {
        if (state.mode === 'build' && state.previewCoords.length === 1) {
            updatePreview(e.lngLat);
        }
    });
}

function handleBuildClick(lngLat) {
    // 1. Snapping Logic (Check nearby tracks/nodes)
    const snappedPoint = geoEngine.snapToNearest(lngLat, trackManager.getTracks(), state.layer);
    
    if (state.previewCoords.length === 0) {
        // Set Start Point
        state.previewCoords.push(snappedPoint);
    } else if (state.previewCoords.length === 1) {
        // Set End Point and Generate Path
        state.previewCoords.push(snappedPoint);
        updatePreview(snappedPoint);
        document.getElementById('btn-confirm-build').disabled = false;
    }
}

function updatePreview(endLngLat) {
    const startPoint = state.previewCoords[0];
    
    // Generate Path (Straight or Dubins Arc)
    const pathGeoJSON = geoEngine.calculatePath(startPoint, endLngLat);
    trackManager.updatePreviewLayer(pathGeoJSON);

    // Update UI Stats
    const length = turf.length(pathGeoJSON, { units: 'meters' });
    document.getElementById('info-length').innerText = length.toFixed(2);
    
    // Heuristic Speed Calculation: Slower when arc tighter (Speed = min(160, sqrt(Radius * 10)))
    const radius = geoEngine.getCurrentRadius(); // > 25000 is straight
    let speed = 160;
    if (radius < 25000) {
        speed = Math.min(160, Math.floor(Math.sqrt(radius * 10)));
        document.getElementById('info-radius').innerText = `${radius.toFixed(0)}m`;
    } else {
        document.getElementById('info-radius').innerText = `Straight`;
    }
    document.getElementById('info-speed').innerText = speed;
}

// --- UI Event Bindings ---
function setupUIEvents() {
    // Modes
    document.getElementById('btn-pan').onclick = () => setMode('pan');
    document.getElementById('btn-build').onclick = () => setMode('build');
    document.getElementById('btn-select').onclick = () => setMode('select');

    // Confirm Build
    document.getElementById('btn-confirm-build').onclick = () => {
        if (state.previewCoords.length === 2) {
            const trackGeoJSON = trackManager.getPreviewData();
            // Assign properties
            trackGeoJSON.properties = {
                layer: state.layer,
                speedLimit: parseInt(document.getElementById('info-speed').innerText),
                isTurnback: false,
                isOneWay: false,
                platforms: 'none'
            };
            trackManager.commitTrack(trackGeoJSON);
            
            // Reset Preview
            state.previewCoords = [];
            trackManager.clearPreview();
            document.getElementById('preview-info').classList.add('hidden');
        }
    };

    // Layer change
    document.getElementById('current-layer').onchange = (e) => {
        state.layer = parseInt(e.target.value);
    };
}

function setMode(newMode) {
    state.mode = newMode;
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${newMode}`).classList.add('active');

    // Toggle MapLibre standard pan/zoom behavior
    if (newMode === 'build') {
        map.dragPan.disable(); // Prevent map move, allow dragging points (to be implemented)
        document.getElementById('preview-info').classList.remove('hidden');
        document.getElementById('properties-panel').classList.add('hidden');
    } else if (newMode === 'select') {
        map.dragPan.enable();
        document.getElementById('preview-info').classList.add('hidden');
        document.getElementById('properties-panel').classList.remove('hidden');
    } else {
        map.dragPan.enable();
        document.getElementById('preview-info').classList.add('hidden');
        document.getElementById('properties-panel').classList.add('hidden');
        trackManager.clearPreview();
        state.previewCoords = [];
    }
}
