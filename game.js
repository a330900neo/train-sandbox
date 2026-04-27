// Map Initialization
const map = L.map('map', {
    center: [22.3193, 114.1694], // Hong Kong (Example)
    zoom: 15,
    zoomControl: false // Move zoom control to avoid UI overlap
});
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Real-world map tiles (OpenStreetMap)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20, // Need high zoom for track details
    attribution: '© OpenStreetMap'
}).addTo(map);

// Game State
const State = {
    mode: 'BUILD', // 'BUILD' or 'SELECT'
    buildPhase: 'IDLE', // 'IDLE', 'START_PLACED', 'PREVIEW'
    currentLayer: 0,
    previewStart: null,
    previewEnd: null,
    tracks: [] // Store all built tracks
};

// UI Elements
const ui = {
    btnBuild: document.getElementById('btn-build'),
    btnSelect: document.getElementById('btn-select'),
    layerSelect: document.getElementById('layer-select'),
    previewPanel: document.getElementById('preview-panel'),
    infoLength: document.getElementById('info-length'),
    infoSpeed: document.getElementById('info-speed'),
    btnConfirm: document.getElementById('btn-confirm-build'),
    btnCancel: document.getElementById('btn-cancel-build')
};

// Preview Visuals
let previewMarkerStart = null;
let previewMarkerEnd = null;
let previewTrackVisual = null;

// --- EVENT LISTENERS ---

// Mode Switching
ui.btnBuild.addEventListener('click', () => setMode('BUILD'));
ui.btnSelect.addEventListener('click', () => setMode('SELECT'));
ui.layerSelect.addEventListener('change', (e) => { State.currentLayer = parseInt(e.target.value); });

// Cancel Build
ui.btnCancel.addEventListener('click', clearPreview);

// Confirm Build
ui.btnConfirm.addEventListener('click', () => {
    if (State.buildPhase === 'PREVIEW' && previewTrackVisual) {
        // Commit track to map
        State.tracks.push(previewTrackVisual);
        clearPreview();
    }
});

// Map Click Interactions
map.on('click', (e) => {
    if (State.mode !== 'BUILD') return;

    let clickedLatLng = e.latlng;
    
    // Basic Snapping Logic (Snaps to existing track nodes if close)
    clickedLatLng = snapToClosestNode(clickedLatLng);

    if (State.buildPhase === 'IDLE') {
        // Place Start Point
        State.previewStart = clickedLatLng;
        previewMarkerStart = L.circleMarker(clickedLatLng, { color: 'green', radius: 6 }).addTo(map);
        State.buildPhase = 'START_PLACED';
    } 
    else if (State.buildPhase === 'START_PLACED') {
        // Place End Point and Generate Preview
        State.previewEnd = clickedLatLng;
        previewMarkerEnd = L.circleMarker(clickedLatLng, { color: 'red', radius: 6 }).addTo(map);
        
        generatePreview();
        State.buildPhase = 'PREVIEW';
    }
});

// --- CORE FUNCTIONS ---

function setMode(mode) {
    State.mode = mode;
    ui.btnBuild.classList.toggle('active', mode === 'BUILD');
    ui.btnSelect.classList.toggle('active', mode === 'SELECT');
    if (mode === 'SELECT') clearPreview();
}

function clearPreview() {
    if (previewMarkerStart) map.removeLayer(previewMarkerStart);
    if (previewMarkerEnd) map.removeLayer(previewMarkerEnd);
    if (previewTrackVisual) map.removeLayer(previewTrackVisual);
    
    State.buildPhase = 'IDLE';
    State.previewStart = null;
    State.previewEnd = null;
    ui.previewPanel.classList.add('hidden');
}

function generatePreview() {
    if (previewTrackVisual) map.removeLayer(previewTrackVisual);

    // Call geometry function to draw track
    previewTrackVisual = generateVisualTrack(State.previewStart, State.previewEnd, State.currentLayer);
    previewTrackVisual.addTo(map);

    // Update UI Stats
    ui.infoLength.innerText = previewTrackVisual.trackData.length.toFixed(1);
    ui.infoSpeed.innerText = previewTrackVisual.trackData.speedLimit;
    
    ui.previewPanel.classList.remove('hidden');
}

// Snapping System
function snapToClosestNode(latlng) {
    const snapDistanceMeters = 5; // Distance to trigger snap
    const point = turf.point([latlng.lng, latlng.lat]);
    
    let closestNode = null;
    let minDistance = Infinity;

    // Check all existing tracks for start/end points
    State.tracks.forEach(trackGroup => {
        // In a full implementation, you would extract the exact LatLng nodes
        // and calculate turf.distance() to see if it's within snapDistanceMeters.
        // For parallel tracks, you would use turf.pointToLineDistance().
    });

    return closestNode ? closestNode : latlng;
}
