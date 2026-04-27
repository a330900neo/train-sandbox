// --- 1. Init Leaflet Map ---
// Setting default to a real location (e.g., Hong Kong)
const map = L.map('map', { zoomControl: false }).setView([22.3193, 114.1694], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22,
    attribution: '© OpenStreetMap'
}).addTo(map);

// --- 2. Custom Canvas Overlay ---
const canvas = document.createElement('canvas');
canvas.classList.add('leaflet-custom-canvas');
canvas.style.position = 'absolute';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.zIndex = '400'; // Above map, below UI
document.getElementById('map').appendChild(canvas);

const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
}
window.addEventListener('resize', resizeCanvas);
map.on('move', render);
map.on('zoom', render);

// --- 3. Game State ---
let tracks = [];
let mode = 'pan'; // pan, build, select
let buildState = { active: false, startNode: null, currentPos: null };
let selectedTracks = [];

// --- 4. Input Handling (Pointer Events for Mobile & Desktop) ---
map.getContainer().addEventListener('pointerdown', (e) => {
    if (mode === 'pan') return; // Let Leaflet handle it natively

    let latlng = map.containerPointToLatLng([e.clientX, e.clientY]);
    let projected = map.project(latlng, map.getMaxZoom()); // EPSG:3857 Meters

    if (mode === 'build') {
        let snapped = MathUtils.getSnapPoint(projected, tracks);
        buildState.active = true;
        buildState.startNode = snapped ? snapped : projected;
        map.dragging.disable(); // Stop map from panning while building
    } else if (mode === 'select') {
        // Raycast selection logic
        selectedTracks.forEach(t => t.selected = false);
        selectedTracks = [];
        
        let searchDist = 10 * Math.pow(2, 22 - map.getZoom()); // Adjust hit box by zoom
        let hit = tracks.find(t => MathUtils.dist(projected, t.startNode) < searchDist || MathUtils.dist(projected, t.endNode) < searchDist);
        
        if (hit) {
            hit.selected = true;
            selectedTracks.push(hit);
            showSelectUI(hit);
        } else {
            document.getElementById('select-options').classList.add('hidden');
        }
        render();
    }
});

map.getContainer().addEventListener('pointermove', (e) => {
    if (!buildState.active || mode !== 'build') return;

    let latlng = map.containerPointToLatLng([e.clientX, e.clientY]);
    let projected = map.project(latlng, map.getMaxZoom());
    
    buildState.currentPos = MathUtils.getSnapPoint(projected, tracks) || projected;
    
    // Update Preview UI
    let length = MathUtils.dist(buildState.startNode, buildState.currentPos);
    let radius = MathUtils.STRAIGHT_THRESHOLD + 1; // Simplified: defaulting to straight for preview
    document.getElementById('info-length').innerText = `Length: ${length.toFixed(2)}m`;
    document.getElementById('info-radius').innerText = `Radius: Straight`;
    document.getElementById('info-speed').innerText = `Max Speed: ${MathUtils.calcMaxSpeed(radius)} km/h`;
    
    render();
});

map.getContainer().addEventListener('pointerup', (e) => {
    if (mode === 'build' && buildState.active) {
        if (buildState.currentPos && MathUtils.dist(buildState.startNode, buildState.currentPos) > 1) {
            // Commit Track
            let newTrack = new Track(buildState.startNode, buildState.currentPos);
            newTrack.length = MathUtils.dist(buildState.startNode, buildState.currentPos);
            tracks.push(newTrack);
        }
        buildState.active = false;
        buildState.startNode = null;
        buildState.currentPos = null;
        map.dragging.enable();
        render();
    }
});

// --- 5. Rendering Loop ---
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw confirmed tracks
    tracks.forEach(track => track.draw(ctx, map));

    // Draw Build Preview
    if (mode === 'build' && buildState.active && buildState.currentPos) {
        let p1 = map.latLngToContainerPoint(map.unproject(buildState.startNode, map.getMaxZoom()));
        let p2 = map.latLngToContainerPoint(map.unproject(buildState.currentPos, map.getMaxZoom()));

        ctx.strokeStyle = 'rgba(0, 255, 100, 0.8)'; // Green preview line
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw snap indicator if snapped
        if (buildState.currentPos.type === 'node') {
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// --- 6. UI Handlers ---
document.getElementById('btn-pan').onclick = (e) => setMode('pan', e.target);
document.getElementById('btn-build').onclick = (e) => setMode('build', e.target);
document.getElementById('btn-select').onclick = (e) => setMode('select', e.target);

function setMode(newMode, buttonExt) {
    mode = newMode;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
    buttonExt.classList.add('active');
    
    if (mode === 'pan') {
        map.dragging.enable();
        document.getElementById('info-panel').classList.add('hidden');
    } else {
        map.dragging.disable();
        document.getElementById('info-panel').classList.remove('hidden');
        if (mode === 'build') document.getElementById('select-options').classList.add('hidden');
    }
}

function showSelectUI(track) {
    document.getElementById('select-options').classList.remove('hidden');
    document.getElementById('info-length').innerText = `Length: ${track.length.toFixed(2)}m`;
    
    document.getElementById('prop-layer').value = track.layer;
    document.getElementById('prop-ramp').checked = track.isRamp;
    document.getElementById('prop-platform').value = track.platform;
    document.getElementById('prop-plat-width').value = track.platformWidth;
    document.getElementById('prop-oneway').checked = track.isOneWay;
    document.getElementById('prop-turnback').checked = track.isTurnback;
    
    // Bind updates
    document.getElementById('prop-platform').onchange = (e) => { track.platform = e.target.value; render(); };
}

// Initial Setup
resizeCanvas();
