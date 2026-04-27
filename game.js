// game.js - State machine, map setup, and rendering loop
const map = L.map('map', { zoomControl: false }).setView([22.3193, 114.1694], 16); // Centered on Hong Kong as an example
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 22, attribution: '&copy; OpenStreetMap'
}).addTo(map);

const canvas = document.getElementById('trackCanvas');
const ctx = canvas.getContext('2d');

// Game State
let mode = 'BUILDING'; // BUILDING or SELECTING
let tracks = [];
let currentPreview = null;
let startPoint = null;
const trackGaugeMeters = 1.435;
let currentLayer = 0;

// UI Elements
const uiLength = document.getElementById('info-length');
const uiRadius = document.getElementById('info-radius');
const uiSpeed = document.getElementById('info-speed');
const uiLayer = document.getElementById('info-layer');
const previewPanel = document.getElementById('preview-info');

// Sync Canvas size with window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
}
window.addEventListener('resize', resizeCanvas);
map.on('move', render);
map.on('zoom', render);

// Input Handling via Leaflet map container to capture precise lat/lng
map.on('mousedown', function(e) {
    if (mode === 'BUILDING') {
        startPoint = e.latlng;
        map.dragging.disable(); // Prevent panning while drawing
    }
});

map.on('mousemove', function(e) {
    if (mode === 'BUILDING' && startPoint) {
        previewPanel.classList.remove('hidden');
        updatePreview(e.latlng);
        render();
    }
});

map.on('mouseup', function(e) {
    if (mode === 'BUILDING' && startPoint) {
        if (currentPreview) {
            tracks.push(currentPreview);
        }
        startPoint = null;
        currentPreview = null;
        previewPanel.classList.add('hidden');
        map.dragging.enable();
        render();
    }
});

function updatePreview(endLatLng) {
    // 1. Snapping Logic (Placeholder structure)
    // Here you would loop over `tracks` and check distance.
    // If distance to a track parallel centerline is ~3.5m, adjust endLatLng.

    const reference = startPoint;
    const p1 = MathUtils.latLngToMeters(startPoint, reference);
    const p2 = MathUtils.latLngToMeters(endLatLng, reference);
    const dist = MathUtils.distance(p1, p2);

    // 2. Arc vs Straight logic
    // If connected to an existing node, check its direction. 
    // For now, default to straight if independent:
    let radius = Infinity; 
    let type = 'straight';

    // Fake an arc if user drags in a specific way (for demonstration)
    if (dist > 100 && Math.random() > 0.8) { 
        radius = 800; // Example dynamic radius
        type = 'arc';
    }

    const speed = MathUtils.calculateMaxSpeed(radius);

    currentPreview = {
        start: startPoint,
        end: endLatLng,
        type: type,
        radius: radius,
        length: dist,
        maxSpeed: speed,
        layerStart: currentLayer,
        layerEnd: currentLayer,
        platforms: 'none' // 'both', 'left', 'right', 'none'
    };

    // Update UI
    uiLength.innerText = dist.toFixed(1);
    uiRadius.innerText = radius > 25000 ? 'Straight' : radius + 'm';
    uiSpeed.innerText = speed;
    uiLayer.innerText = currentLayer;
}

// Rendering Loop
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const mpp = MathUtils.getScale(map);
    
    // Sort tracks by layer to render higher layers on top
    const allTracks = currentPreview ? tracks.concat([currentPreview]) : tracks;
    allTracks.sort((a, b) => Math.max(a.layerStart, a.layerEnd) - Math.max(b.layerStart, b.layerEnd));

    allTracks.forEach(track => {
        const startPx = map.latLngToContainerPoint(track.start);
        const endPx = map.latLngToContainerPoint(track.end);

        // Track styling based on real scale
        // Gauge 1.435m converted to pixels based on current zoom
        let gaugePx = trackGaugeMeters / mpp;
        // Clamp gauge visually so it doesn't disappear completely at high zooms
        if (gaugePx < 2) gaugePx = 2; 
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Draw Gray Base (Ballast)
        ctx.beginPath();
        ctx.moveTo(startPx.x, startPx.y);
        ctx.lineTo(endPx.x, endPx.y); // Replace with arc drawing logic if track.type === 'arc'
        ctx.strokeStyle = track === currentPreview ? 'rgba(150, 150, 150, 0.5)' : '#888';
        ctx.lineWidth = gaugePx * 3; // Ballast is wider than the track
        ctx.stroke();

        // 2. Draw Black Rails
        // To draw parallel rails accurately, calculate the normal vector of the line
        const dx = endPx.x - startPx.x;
        const dy = endPx.y - startPx.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if(len === 0) return;

        const nx = (-dy / len) * (gaugePx / 2);
        const ny = (dx / len) * (gaugePx / 2);

        ctx.beginPath();
        // Rail 1
        ctx.moveTo(startPx.x + nx, startPx.y + ny);
        ctx.lineTo(endPx.x + nx, endPx.y + ny);
        // Rail 2
        ctx.moveTo(startPx.x - nx, startPx.y - ny);
        ctx.lineTo(endPx.x - nx, endPx.y - ny);
        
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1, gaugePx * 0.2); // Thin rail lines
        ctx.stroke();
    });
}

// UI Buttons
document.getElementById('btn-build').onclick = (e) => {
    mode = 'BUILDING';
    e.target.classList.add('active');
    document.getElementById('btn-select').classList.remove('active');
    document.getElementById('selection-tools').classList.add('hidden');
};

document.getElementById('btn-select').onclick = (e) => {
    mode = 'SELECTING';
    e.target.classList.add('active');
    document.getElementById('btn-build').classList.remove('active');
    document.getElementById('selection-tools').classList.remove('hidden');
};

// Init
resizeCanvas();
