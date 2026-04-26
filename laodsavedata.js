// App State Machine
const AppState = {
    tool: 'pan', // pan, build, select, multiselect
    snapMode: true,
    parallelDist: 4.0,
    preview: { active: false, p1: null, p2: null, draggingPoint: null },
    selectedTracks: new Set()
};

// World to Screen and Screen to World converters
function getMousePos(e) {
    let rect = canvas.getBoundingClientRect();
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Screen to World calculation
    let worldX = (clientX - rect.left - canvas.width / 2 - Camera.x) / Camera.zoom;
    let worldY = (clientY - rect.top - canvas.height / 2 - Camera.y) / Camera.zoom;
    return { x: worldX, y: worldY };
}

// Event Listeners for Tools
['mousedown', 'touchstart'].forEach(evt => 
    canvas.addEventListener(evt, (e) => {
        if(e.touches && e.touches.length > 1) return; // Basic pinch-zoom protect
        let pos = getMousePos(e);

        if (AppState.tool === 'pan') {
            Camera.panStart = { x: (e.clientX || e.touches[0].clientX) - Camera.x, y: (e.clientY || e.touches[0].clientY) - Camera.y };
        } 
        else if (AppState.tool === 'build') {
            if (AppState.preview.active) {
                // Check if clicking near preview points to drag them
                if (MathUtils.distance2D(pos, AppState.preview.p1) < 2) AppState.preview.draggingPoint = 1;
                else if (MathUtils.distance2D(pos, AppState.preview.p2) < 2) AppState.preview.draggingPoint = 2;
            } else {
                // Start a new track preview
                let startPos = AppState.snapMode ? (TrackManager.findSnapNode(pos.x, pos.y) || pos) : pos;
                AppState.preview = { active: true, p1: {x: startPos.x, y: startPos.y, z:0}, p2: {x: pos.x, y: pos.y, z:0}, draggingPoint: 2 };
                document.getElementById('preview-menu').classList.remove('hidden');
                updatePreviewMenu();
            }
        }
    })
);

['mousemove', 'touchmove'].forEach(evt => 
    canvas.addEventListener(evt, (e) => {
        if (AppState.tool === 'pan' && Camera.panStart) {
            Camera.x = (e.clientX || e.touches[0].clientX) - Camera.panStart.x;
            Camera.y = (e.clientY || e.touches[0].clientY) - Camera.panStart.y;
        }
        else if (AppState.tool === 'build' && AppState.preview.active && AppState.preview.draggingPoint) {
            let pos = getMousePos(e);
            let snapPos = AppState.snapMode ? (TrackManager.findSnapNode(pos.x, pos.y) || pos) : pos;
            
            if (AppState.preview.draggingPoint === 1) AppState.preview.p1 = {x: snapPos.x, y: snapPos.y, z: AppState.preview.p1.z};
            else AppState.preview.p2 = {x: snapPos.x, y: snapPos.y, z: AppState.preview.p2.z};
            
            updatePreviewMenu();
            
            // Trigger Dubins menu if both snap to existing node endpoints (mock check)
            if (AppState.snapMode && MathUtils.distance2D(pos, snapPos) < 1.5) {
                // In full implementation, check if BOTH p1 and p2 are attached to nodes with tangents.
                // document.getElementById('dubins-menu').classList.remove('hidden'); 
            }
        }
    })
);

['mouseup', 'touchend', 'mouseleave'].forEach(evt => 
    canvas.addEventListener(evt, () => {
        Camera.panStart = null;
        if (AppState.preview.active) AppState.preview.draggingPoint = null;
    })
);

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    let zoomFactor = 1.1;
    Camera.zoom *= (e.deltaY < 0) ? zoomFactor : (1 / zoomFactor);
    Camera.zoom = Math.max(1, Math.min(Camera.zoom, 50));
});

// UI Event Bindings
function switchTool(toolId) {
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${toolId}`).classList.add('active');
    AppState.tool = toolId;
    if (toolId !== 'build') cancelPreview();
}

document.getElementById('btn-pan').onclick = () => switchTool('pan');
document.getElementById('btn-build').onclick = () => switchTool('build');
document.getElementById('btn-select').onclick = () => switchTool('select');
document.getElementById('btn-multiselect').onclick = () => switchTool('multiselect');

document.getElementById('toggle-snap').onchange = (e) => AppState.snapMode = e.target.checked;
document.getElementById('input-parallel').onchange = (e) => AppState.parallelDist = parseFloat(e.target.value);

// Preview Confirm/Cancel
function cancelPreview() {
    AppState.preview.active = false;
    document.getElementById('preview-menu').classList.add('hidden');
    document.getElementById('dubins-menu').classList.add('hidden');
}

function updatePreviewMenu() {
    let p1 = AppState.preview.p1, p2 = AppState.preview.p2;
    let dist = MathUtils.distance2D(p1, p2);
    let grad = (dist === 0) ? 0 : ((p2.z - p1.z) / dist) * 100;
    document.getElementById('prev-grad').innerText = grad.toFixed(1);
}

document.getElementById('btn-confirm-build').onclick = () => {
    let p1 = AppState.preview.p1, p2 = AppState.preview.p2;
    let n1 = TrackManager.findSnapNode(p1.x, p1.y) || TrackManager.addNode(p1.x, p1.y, p1.z);
    let n2 = TrackManager.findSnapNode(p2.x, p2.y) || TrackManager.addNode(p2.x, p2.y, p2.z);
    
    // Automatically decide curve/straight based on distance/angle (mocked)
    TrackManager.addSegment(n1.id, n2.id, 'straight', Infinity); 
    cancelPreview();
};

document.getElementById('btn-cancel-build').onclick = cancelPreview;

// Save/Load System
function serializeData() {
    return JSON.stringify({ nodes: TrackManager.nodes, segments: TrackManager.segments });
}
function deserializeData(json) {
    let data = JSON.parse(json);
    TrackManager.nodes = data.nodes || {};
    TrackManager.segments = data.segments || {};
}

document.getElementById('btn-save').onclick = () => localStorage.setItem('trainData', serializeData());
document.getElementById('btn-load').onclick = () => {
    let data = localStorage.getItem('trainData');
    if (data) deserializeData(data);
};
document.getElementById('btn-export').onclick = () => {
    let blob = new Blob([serializeData()], { type: "application/json" });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "track_data.json";
    a.click();
};
document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
document.getElementById('file-import').onchange = (e) => {
    let file = e.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = (event) => deserializeData(event.target.result);
    reader.readAsText(file);
};

// Initialize
requestAnimationFrame(Render.renderLoop);
