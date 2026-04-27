// --- Map Initialization ---
// High maxZoom to allow viewing real-scale 1.435m track gauges.
const map = L.map('map', {
    maxZoom: 24, 
    zoomControl: false // Custom placement later if needed
}).setView([22.3193, 114.1694], 16); // Centered on Hong Kong as an example

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19,
    maxZoom: 24,
    attribution: '© OpenStreetMap'
}).addTo(map);

// --- State & Data Storage ---
const State = { IDLE: 0, PREVIEW: 1, SELECT: 2 };
let currentState = State.IDLE;

let tracks = []; // Stores committed tracks
let currentPreview = null; // Stores preview geometry
let startPoint = null;
let currentHeading = null; // Vector direction to determine arc vs straight

// UI Elements
const previewPanel = document.getElementById('preview-panel');
const propPanel = document.getElementById('properties-panel');
const infoLength = document.getElementById('info-length');
const infoRadius = document.getElementById('info-radius');
const infoSpeed = document.getElementById('info-speed');

// Map Layers
const trackLayerGroup = L.layerGroup().addTo(map);
const previewLayerGroup = L.layerGroup().addTo(map);

// --- Real-Scale Visuals (Dynamic Line Width) ---
// 1435mm standard gauge = 1.435 meters. Base track bed ~3 meters.
function getPixelWidth(meters) {
    // Converts real-world meters to pixels based on current map zoom and latitude
    const centerLatLng = map.getCenter();
    const metersPerPixel = 40075016.686 * Math.abs(Math.cos(centerLatLng.lat * Math.PI/180)) / Math.pow(2, map.getZoom() + 8);
    return Math.max(meters / metersPerPixel, 1); // Minimum 1px so it doesn't vanish
}

function updateTrackVisuals() {
    const baseWidth = getPixelWidth(3.0); // 3m track bed (gray)
    const gaugeWidth = getPixelWidth(1.435); // 1.435m gauge (black rails)

    trackLayerGroup.eachLayer(layer => {
        if(layer.options.isTrackBed) layer.setStyle({ weight: baseWidth });
        if(layer.options.isRail) layer.setStyle({ weight: gaugeWidth });
    });
    
    previewLayerGroup.eachLayer(layer => {
        layer.setStyle({ weight: baseWidth }); // Preview just uses base width
    });
}
map.on('zoomend', updateTrackVisuals);

// --- Math & Geometry Helpers ---
// Speed calculation based on curve radius (Simplified engineering formula: V = sqrt(R * 11.8))
function calculateMaxSpeed(radiusMeters) {
    if (radiusMeters > 25000) return 160; // Straight or near-straight
    let speed = Math.sqrt(radiusMeters * 11.8);
    return Math.min(Math.floor(speed), 160);
}

// Distance between two LatLngs in meters
function getDistance(latlng1, latlng2) {
    return map.distance(latlng1, latlng2);
}

// --- Interactions ---
map.on('click', function(e) {
    if (currentState === State.IDLE) {
        // Start building
        startPoint = e.latlng;
        currentState = State.PREVIEW;
        previewPanel.classList.remove('hidden');
    }
});

map.on('mousemove', function(e) {
    if (currentState === State.PREVIEW && startPoint) {
        previewLayerGroup.clearLayers();
        
        // TODO: Snapping Logic goes here. 
        // 1. Iterate through `tracks` nodes.
        // 2. If e.latlng distance to node < threshold, e.latlng = node.latlng.
        // 3. Parallel offset: calculate vector from centerline and snap if distance ~ snap-offset input.

        let endPoint = e.latlng;
        let distance = getDistance(startPoint, endPoint);
        let radius = 99999; // Default straight

        // TODO: Arc Logic
        // If `currentHeading` exists (connected track), and angle difference > 0
        // Calculate tangent Arc to endPoint.
        // For now, drawing straight line as foundation.

        let line = L.polyline([startPoint, endPoint], {
            color: '#ff7800', weight: getPixelWidth(3.0), opacity: 0.7, dashArray: '5, 5'
        }).addTo(previewLayerGroup);

        // Update UI
        infoLength.innerText = distance.toFixed(1);
        infoRadius.innerText = radius > 25000 ? "Straight" : radius.toFixed(1) + " m";
        infoSpeed.innerText = calculateMaxSpeed(radius);

        currentPreview = {
            start: startPoint,
            end: endPoint,
            length: distance,
            radius: radius,
            layer: parseInt(document.getElementById('layer-input').value)
        };
    }
});

// --- UI Buttons ---
document.getElementById('btn-confirm').addEventListener('click', () => {
    if (currentPreview) {
        // Add to permanent tracks
        tracks.push(currentPreview);
        
        // Render permanent track (Base gray + Black rails)
        // Layering logic: z-index based on track layer property
        const zOffset = currentPreview.layer * 100;

        // Gray Base
        L.polyline([currentPreview.start, currentPreview.end], {
            color: '#888', weight: getPixelWidth(3.0), isTrackBed: true, zIndexOffset: zOffset
        }).addTo(trackLayerGroup);

        // Black Rails (drawn over gray base)
        L.polyline([currentPreview.start, currentPreview.end], {
            color: '#000', weight: getPixelWidth(1.435), isRail: true, dashArray: '1, 4', zIndexOffset: zOffset + 10
        }).addTo(trackLayerGroup);

        // Prepare for next segment seamlessly
        startPoint = currentPreview.end;
        // currentHeading = ... (calculate vector bearing of this segment end)
    }
});

document.getElementById('btn-cancel').addEventListener('click', () => {
    currentState = State.IDLE;
    startPoint = null;
    currentPreview = null;
    previewLayerGroup.clearLayers();
    previewPanel.classList.add('hidden');
});

// Select Tool Toggle
document.getElementById('btn-select').addEventListener('click', (e) => {
    document.getElementById('btn-build').classList.remove('active');
    e.target.classList.add('active');
    currentState = State.SELECT;
    previewPanel.classList.add('hidden');
    // In a full implementation, clicking Polylines here would populate the properties panel
});

document.getElementById('btn-build').addEventListener('click', (e) => {
    document.getElementById('btn-select').classList.remove('active');
    e.target.classList.add('active');
    currentState = State.IDLE;
    propPanel.classList.add('hidden');
});
