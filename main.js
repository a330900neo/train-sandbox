// Global Map Variable
let map;
let currentMode = 'pan'; // pan, build, select
let buildState = { startPoint: null, previewLine: null };
let currentLayer = 0;

function init() {
    // Initialize map centered on a real-world location (e.g., Central, Hong Kong)
    map = L.map('map', {
        center: [22.2819, 114.1581],
        zoom: 16,
        zoomControl: false // Hide default to keep UI clean
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    setupUI();
    setupMapEvents();
}

function setupUI() {
    const btnPan = document.getElementById('btn-pan');
    const btnBuild = document.getElementById('btn-build');
    const btnSelect = document.getElementById('btn-select');
    const infoPanel = document.getElementById('build-info');

    btnPan.addEventListener('click', () => {
        setMode('pan');
        btnPan.classList.add('active');
        btnBuild.classList.remove('active');
        btnSelect.classList.remove('active');
        infoPanel.classList.add('hidden');
    });

    btnBuild.addEventListener('click', () => {
        setMode('build');
        btnBuild.classList.add('active');
        btnPan.classList.remove('active');
        btnSelect.classList.remove('active');
        infoPanel.classList.remove('hidden');
    });
    
    document.getElementById('current-layer').addEventListener('change', (e) => {
        currentLayer = parseInt(e.target.value);
    });
}

function setMode(mode) {
    currentMode = mode;
    buildState.startPoint = null;
    
    if (buildState.previewLine) {
        map.removeLayer(buildState.previewLine);
        buildState.previewLine = null;
    }

    if (mode === 'pan') {
        map.dragging.enable();
        document.getElementById('map').style.cursor = 'grab';
    } else {
        map.dragging.disable(); // Disable panning while building
        document.getElementById('map').style.cursor = 'crosshair';
    }
}

function setupMapEvents() {
    map.on('click', function(e) {
        if (currentMode !== 'build') return;

        let clickLatLng = e.latlng;
        
        // Snapping Check
        let snapNode = TrackManager.findSnapNode(clickLatLng);
        if (snapNode) clickLatLng = snapNode;

        if (!buildState.startPoint) {
            // First click: Set start point
            buildState.startPoint = clickLatLng;
        } else {
            // Second click: Finalize track
            TrackManager.addTrack(buildState.startPoint, clickLatLng, currentLayer, false, null);
            buildState.startPoint = null; // Reset for next track
            if (buildState.previewLine) map.removeLayer(buildState.previewLine);
        }
    });

    map.on('mousemove', function(e) {
        if (currentMode !== 'build' || !buildState.startPoint) return;

        let currentLatLng = e.latlng;
        
        // Snapping Check during preview
        let snapNode = TrackManager.findSnapNode(currentLatLng);
        if (snapNode) currentLatLng = snapNode;

        // Update Preview Line
        if (buildState.previewLine) {
            buildState.previewLine.setLatLngs([buildState.startPoint, currentLatLng]);
        } else {
            buildState.previewLine = L.polyline([buildState.startPoint, currentLatLng], TrackManager.styles.preview).addTo(map);
        }

        // Update UI Info
        let length = Geometry.calculateDistance(buildState.startPoint, currentLatLng);
        document.getElementById('info-length').innerText = Math.round(length);
        document.getElementById('info-speed').innerText = Geometry.calculateMaxSpeed(null); // Straight line max speed
    });
}

// Start the game
window.onload = init;
