let appState = {
    tool: 'pan', // pan, build_track, build_platform, select, multi_select
    tracks: [],
    nodes: [],
    platforms: [],
    cam: { x: 0, y: 0, zoom: 10 }, // 10 pixels per meter
    preview: null,
    selected: [],
    snap: true,
    dubinsFlipStart: 1,
    dubinsFlipEnd: 1
};

class Node {
    constructor(x, y, h) {
        this.pos = new Vec2(x, y);
        this.h = h; // height layer
        this.connections = [];
    }
}

class Track {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.nodes = [];
        this.isCurve = false;
        this.radius = Infinity;
        this.speedLimit = 160;
        this.forceSingle = false;
    }
}

class Platform {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.nodes = [];
        this.width = 5;
    }
}

// Input handling
let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let currentMouse = { x: 0, y: 0 };

document.getElementById('gameCanvas').addEventListener('pointerdown', (e) => {
    isDragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
    
    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (appState.tool === 'build_track' || appState.tool === 'build_platform') {
        if (!appState.preview) {
            startPreview(worldPos);
        } else {
            // Check if dragging preview nodes
            updatePreview(worldPos);
        }
    } else if (appState.tool === 'select') {
        handleSelection(worldPos, false);
    } else if (appState.tool === 'multi_select') {
        handleSelection(worldPos, true);
    }
});

document.getElementById('gameCanvas').addEventListener('pointermove', (e) => {
    currentMouse = { x: e.clientX, y: e.clientY };
    if (isDragging && appState.tool === 'pan') {
        appState.cam.x += (currentMouse.x - lastMouse.x) / appState.cam.zoom;
        appState.cam.y += (currentMouse.y - lastMouse.y) / appState.cam.zoom;
    } else if (isDragging && appState.preview) {
        const worldPos = screenToWorld(currentMouse.x, currentMouse.y);
        updatePreview(worldPos);
    }
    lastMouse = { x: e.clientX, y: e.clientY };
});

document.getElementById('gameCanvas').addEventListener('pointerup', () => { isDragging = false; });
document.getElementById('gameCanvas').addEventListener('wheel', (e) => {
    const zoomFactor = 1.1;
    if (e.deltaY < 0) appState.cam.zoom *= zoomFactor;
    else appState.cam.zoom /= zoomFactor;
});

function screenToWorld(sx, sy) {
    const canvas = document.getElementById('gameCanvas');
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    return new Vec2((sx - w) / appState.cam.zoom - appState.cam.x, (sy - h) / appState.cam.zoom - appState.cam.y);
}

// Track Building Logic
function setTool(tool) {
    appState.tool = tool;
    appState.preview = null;
    closeMenus();
}

function startPreview(pos) {
    let snapPos = pos;
    if (appState.snap) snapPos = getSnapPoint(pos);
    
    appState.preview = {
        start: snapPos,
        end: snapPos,
        height: parseInt(document.getElementById('height-input').value) || 0
    };
    document.getElementById('preview-menu').classList.remove('hidden');
}

function updatePreview(pos) {
    let snapPos = pos;
    if (appState.snap) snapPos = getSnapPoint(pos);
    appState.preview.end = snapPos;
    
    // Auto decide curve vs straight based on tangent of previous track if snapped
    // Fallback simple distance
    const dist = appState.preview.start.dist(appState.preview.end);
    let radius = Infinity;
    
    // Update stats UI
    const stats = `Dist: ${dist.toFixed(2)}m<br>Height: ${appState.preview.height}<br>Speed Limit: ${MathUtils.calcSpeedLimit(radius)} km/h`;
    document.getElementById('preview-stats').innerHTML = stats;
}

function confirmPreview() {
    if (!appState.preview) return;
    
    const track = new Track();
    // Segment logic: split into 3m - 40m chunks
    const dist = appState.preview.start.dist(appState.preview.end);
    const numSections = Math.max(1, Math.ceil(dist / 40));
    
    for(let i=0; i<=numSections; i++) {
        let t = i / numSections;
        let pos = new Vec2(
            appState.preview.start.x + (appState.preview.end.x - appState.preview.start.x) * t,
            appState.preview.start.y + (appState.preview.end.y - appState.preview.start.y) * t
        );
        let node = new Node(pos.x, pos.y, appState.preview.height);
        track.nodes.push(node);
        appState.nodes.push(node);
    }
    
    appState.tracks.push(track);
    appState.preview = null;
    document.getElementById('preview-menu').classList.add('hidden');
}

function cancelPreview() {
    appState.preview = null;
    document.getElementById('preview-menu').classList.add('hidden');
}

// Snapping System (Radius 1.5m)
function getSnapPoint(pos) {
    const SNAP_RAD = 1.5;
    let closest = null;
    let minDist = SNAP_RAD;

    // Snap to existing nodes
    for (const node of appState.nodes) {
        const d = pos.dist(node.pos);
        if (d < minDist) {
            minDist = d;
            closest = node.pos;
        }
    }
    // Future expansion: Snap to parallel sides based on parallel-dist input
    return closest ? closest : pos;
}

// UI Helpers
function closeMenus() {
    document.getElementById('preview-menu').classList.add('hidden');
    document.getElementById('select-menu').classList.add('hidden');
    document.getElementById('multi-select-menu').classList.add('hidden');
    document.getElementById('dubins-menu').classList.add('hidden');
}
