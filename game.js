// --- CONSTANTS & SCALE ---
// Scale: 10 pixels = 1 meter. 
const SCALE = 10;
const GAUGE = 1.435 * SCALE; // 1435mm
const TRAIN_WIDTH = 3.2 * SCALE;
const PLATFORM_WIDTH = 5 * SCALE;
const MAX_RADIUS_FOR_STRAIGHT = 50000 * SCALE;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- STATE MANAGEMENT ---
let state = {
    camera: { x: 0, y: 0, zoom: 1 },
    mode: 'pan', // pan, build_track, build_platform, select, multi
    tracks: [],
    platforms: [],
    selection: [],
    preview: null,
    isDragging: false,
    dragPoint: null, // 'start' or 'end'
    snapEnabled: true,
    lastMouse: { x: 0, y: 0 }
};

// Resize Canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
window.addEventListener('resize', resize);
resize();

// --- MATH & GEOMETRY UTILS ---
function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function normalizeAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
}

// Calculate max speed based on radius (V approx 4.5 * sqrt(R) in km/h for standard rail physics)
function calculateMaxSpeed(radius) {
    if (radius === Infinity || radius > MAX_RADIUS_FOR_STRAIGHT) return 350;
    let rMeters = radius / SCALE;
    let speed = Math.floor(4.5 * Math.sqrt(rMeters));
    return Math.min(speed, 350);
}

// Generate single arc or straight from Point A with direction to Point B
function calculateTrackSegment(p1, dir1, p2, p1z, p2z) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let d = Math.hypot(dx, dy);
    let angleToP2 = Math.atan2(dy, dx);
    let diff = normalizeAngle(angleToP2 - dir1);

    let gradient = d > 0 ? ((p2z - p1z) / (d / SCALE)) * 100 : 0;

    // If angle difference is tiny or radius is massive, make it straight
    if (Math.abs(diff) < 0.001 || Math.abs(Math.PI - Math.abs(diff)) < 0.001) {
        return {
            type: 'straight', p1, p2, z1: p1z, z2: p2z,
            dir1, dir2: dir1, length: d, radius: Infinity, gradient
        };
    }

    let radius = Math.abs(d / (2 * Math.sin(diff)));
    
    if (radius > MAX_RADIUS_FOR_STRAIGHT) {
        return { type: 'straight', p1, p2, z1: p1z, z2: p2z, dir1, dir2: dir1, length: d, radius: Infinity, gradient };
    }

    // Arc center
    let centerAngle = dir1 + (diff > 0 ? Math.PI/2 : -Math.PI/2);
    let cx = p1.x + radius * Math.cos(centerAngle);
    let cy = p1.y + radius * Math.sin(centerAngle);
    
    let endDir = normalizeAngle(dir1 + 2 * diff);
    let sweep = 2 * diff;
    let length = radius * Math.abs(sweep);
    
    // To draw arcs properly with context.arc
    let startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    let endAngle = Math.atan2(p2.y - cy, p2.x - cx);

    return {
        type: 'arc', p1, p2, z1: p1z, z2: p2z,
        cx, cy, radius, length, dir1, dir2: endDir, 
        startAngle, endAngle, sweep, gradient
    };
}

// --- SNAPPING LOGIC ---
function getSnapPoint(worldX, worldY, ignorePreview = false) {
    if (!state.snapEnabled) return null;
    let snapRadius = 20 / state.camera.zoom;
    let bestDist = snapRadius;
    let bestSnap = null;

    // Helper to check points
    const checkPoint = (x, y, z, dir, isEnd) => {
        let d = distance({x, y}, {x: worldX, y: worldY});
        if (d < bestDist) {
            bestDist = d;
            bestSnap = { x, y, z, dir: isEnd ? dir : normalizeAngle(dir + Math.PI) };
        }
    };

    state.tracks.forEach(t => {
        checkPoint(t.p1.x, t.p1.y, t.z1, t.dir1, false);
        checkPoint(t.p2.x, t.p2.y, t.z2, t.dir2, true);
        // Parallel snapping logic (simplified side snap)
        if (t.type === 'straight') {
             // Basic mid-point for parallel
             let mx = (t.p1.x + t.p2.x)/2; let my = (t.p1.y + t.p2.y)/2;
             let nx = -Math.sin(t.dir1) * TRAIN_WIDTH;
             let ny = Math.cos(t.dir1) * TRAIN_WIDTH;
             checkPoint(mx + nx, my + ny, (t.z1+t.z2)/2, t.dir1, true);
             checkPoint(mx - nx, my - ny, (t.z1+t.z2)/2, t.dir1, true);
        }
    });

    return bestSnap;
}


// --- RENDERING ---
function screenToWorld(sx, sy) {
    return {
        x: (sx - canvas.width / 2) / state.camera.zoom - state.camera.x,
        y: (sy - canvas.height / 2) / state.camera.zoom - state.camera.y
    };
}

function worldToScreen(wx, wy) {
    return {
        x: (wx + state.camera.x) * state.camera.zoom + canvas.width / 2,
        y: (wy + state.camera.y) * state.camera.zoom + canvas.height / 2
    };
}

function drawTrackBase(t, isPlatform = false) {
    ctx.beginPath();
    if (t.type === 'straight') {
        ctx.moveTo(t.p1.x, t.p1.y);
        ctx.lineTo(t.p2.x, t.p2.y);
    } else {
        let ccw = t.sweep < 0;
        ctx.arc(t.cx, t.cy, t.radius, t.startAngle, t.endAngle, ccw);
    }
    ctx.lineWidth = isPlatform ? PLATFORM_WIDTH : TRAIN_WIDTH;
    ctx.strokeStyle = isPlatform ? '#888' : '#a0a0a0'; // Gray base
    ctx.stroke();
}

function drawTrackRails(t) {
    // Draw two rails. Canvas trick: draw thick dark line, then slightly thinner base line inside
    let hw = GAUGE / 2;
    ctx.lineWidth = GAUGE;
    ctx.strokeStyle = '#333'; // Outer dark
    ctx.beginPath();
    if (t.type === 'straight') {
        ctx.moveTo(t.p1.x, t.p1.y); ctx.lineTo(t.p2.x, t.p2.y);
    } else {
        ctx.arc(t.cx, t.cy, t.radius, t.startAngle, t.endAngle, t.sweep < 0);
    }
    ctx.stroke();

    ctx.lineWidth = GAUGE - 4; // Inner gap
    ctx.strokeStyle = '#a0a0a0'; 
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Apply camera transform
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(state.camera.x, state.camera.y);

    // Group tracks by height to handle crossings. 
    // Same Z layer = draw all bases, THEN all rails (makes seamless crossings)
    let zLayers = [...new Set(state.tracks.map(t => Math.floor(t.z1)))].sort((a,b)=>a-b);
    
    // Draw Platforms
    state.platforms.forEach(p => drawTrackBase(p, true));

    zLayers.forEach(z => {
        let layerTracks = state.tracks.filter(t => Math.floor(t.z1) === z);
        // Draw bases
        layerTracks.forEach(t => drawTrackBase(t));
        // Draw rails
        layerTracks.forEach(t => drawTrackRails(t));
    });

    // Draw Preview
    if (state.preview) {
        ctx.globalAlpha = 0.6;
        if(state.mode === 'build_platform') {
             drawTrackBase(state.preview, true);
        } else {
             drawTrackBase(state.preview);
             drawTrackRails(state.preview);
        }
        ctx.globalAlpha = 1.0;

        // Draw handles
        ctx.fillStyle = 'red';
        ctx.beginPath(); ctx.arc(state.preview.p1.x, state.preview.p1.y, 5/state.camera.zoom, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'blue';
        ctx.beginPath(); ctx.arc(state.preview.p2.x, state.preview.p2.y, 5/state.camera.zoom, 0, Math.PI*2); ctx.fill();
    }

    // Highlight Selections
    ctx.lineWidth = 2 / state.camera.zoom;
    ctx.strokeStyle = 'yellow';
    state.selection.forEach(t => {
        ctx.beginPath();
        if (t.type === 'straight') { ctx.moveTo(t.p1.x, t.p1.y); ctx.lineTo(t.p2.x, t.p2.y); }
        else { ctx.arc(t.cx, t.cy, t.radius, t.startAngle, t.endAngle, t.sweep < 0); }
        ctx.stroke();
    });

    ctx.restore();
}

// --- INPUT HANDLING ---
canvas.addEventListener('pointerdown', e => {
    let w = screenToWorld(e.clientX, e.clientY);
    state.lastMouse = { x: e.clientX, y: e.clientY };

    if (state.mode === 'build_track' || state.mode === 'build_platform') {
        if (!state.preview) {
            let snap = getSnapPoint(w.x, w.y);
            let startDir = snap ? snap.dir : 0;
            let startZ = snap ? snap.z : parseFloat(document.getElementById('input-start-z').value);
            document.getElementById('input-start-z').value = startZ;

            state.preview = calculateTrackSegment(
                snap ? {x: snap.x, y: snap.y} : w, startDir,
                {x: w.x + 10, y: w.y + 10}, startZ, startZ
            );
            document.getElementById('preview-menu').classList.remove('hidden');
            state.dragPoint = 'end';
        } else {
            // Check if clicking handles
            let dStart = distance(w, state.preview.p1);
            let dEnd = distance(w, state.preview.p2);
            let thresh = 20 / state.camera.zoom;
            if (dStart < thresh) state.dragPoint = 'start';
            else if (dEnd < thresh) state.dragPoint = 'end';
            else state.isDragging = true; // Pan
        }
    } else if (state.mode === 'pan') {
        state.isDragging = true;
    } else if (state.mode === 'select' || state.mode === 'multi') {
        // Simple selection via distance to endpoints (shortcut for complex path picking)
        let clicked = [...state.tracks, ...state.platforms].find(t => 
            distance(w, t.p1) < 20/state.camera.zoom || distance(w, t.p2) < 20/state.camera.zoom
        );
        
        if (clicked) {
            if (state.mode === 'select') state.selection = [clicked];
            else if (!state.selection.includes(clicked)) state.selection.push(clicked);
            showContextMenu(e.clientX, e.clientY, clicked);
        } else {
            state.selection = [];
            document.getElementById('context-menu').classList.add('hidden');
        }
    }
    draw();
});

canvas.addEventListener('pointermove', e => {
    let w = screenToWorld(e.clientX, e.clientY);
    let dx = e.clientX - state.lastMouse.x;
    let dy = e.clientY - state.lastMouse.y;
    
    if (state.isDragging) {
        state.camera.x += dx / state.camera.zoom;
        state.camera.y += dy / state.camera.zoom;
    } else if (state.preview && state.dragPoint) {
        let p1 = state.preview.p1;
        let p2 = state.preview.p2;
        let dir = state.preview.dir1;
        let p1z = parseFloat(document.getElementById('input-start-z').value);
        let p2z = parseFloat(document.getElementById('input-end-z').value);

        let snap = getSnapPoint(w.x, w.y);
        let target = snap ? {x: snap.x, y: snap.y} : w;

        if (state.dragPoint === 'end') {
            if(snap) p2z = snap.z; document.getElementById('input-end-z').value = p2z;
            state.preview = calculateTrackSegment(p1, dir, target, p1z, p2z);
        } else if (state.dragPoint === 'start') {
            if(snap) {
                dir = snap.dir; p1z = snap.z;
                document.getElementById('input-start-z').value = p1z;
            }
            state.preview = calculateTrackSegment(target, dir, p2, p1z, p2z);
        }
        updatePreviewUI();
    }

    state.lastMouse = { x: e.clientX, y: e.clientY };
    draw();
});

canvas.addEventListener('pointerup', () => {
    state.isDragging = false;
    state.dragPoint = null;
});

canvas.addEventListener('wheel', e => {
    let zoomFactor = 1.1;
    if (e.deltaY > 0) state.camera.zoom /= zoomFactor;
    else state.camera.zoom *= zoomFactor;
    draw();
});

// --- UI EVENT LISTENERS ---
const modes = ['pan', 'build_track', 'build_platform', 'select', 'multi'];
modes.forEach(m => {
    let btnId = 'btn-' + m.replace('_', '-');
    document.getElementById(btnId).addEventListener('click', (e) => {
        state.mode = m;
        document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.preview = null;
        state.selection = [];
        document.getElementById('preview-menu').classList.add('hidden');
        document.getElementById('context-menu').classList.add('hidden');
        draw();
    });
});

document.getElementById('toggle-snap').addEventListener('change', e => {
    state.snapEnabled = e.target.checked;
});

function updatePreviewUI() {
    if(!state.preview) return;
    let rad = state.preview.radius === Infinity ? 'Straight' : (state.preview.radius/SCALE).toFixed(1) + 'm';
    document.getElementById('info-radius').innerText = rad;
    document.getElementById('info-speed').innerText = calculateMaxSpeed(state.preview.radius) + ' km/h';
    document.getElementById('info-gradient').innerText = state.preview.gradient.toFixed(2);
}

document.getElementById('btn-confirm').addEventListener('click', () => {
    if (state.preview) {
        if(state.mode === 'build_platform') state.platforms.push({...state.preview});
        else state.tracks.push({...state.preview});
        
        // Auto-continue from the new end point
        let newZ = state.preview.z2;
        let newP = state.preview.p2;
        let newDir = state.preview.dir2;
        document.getElementById('input-start-z').value = newZ;
        state.preview = calculateTrackSegment(newP, newDir, {x: newP.x+10, y: newP.y+10}, newZ, newZ);
        state.dragPoint = 'end';
        draw();
    }
});

document.getElementById('btn-cancel').addEventListener('click', () => {
    state.preview = null;
    document.getElementById('preview-menu').classList.add('hidden');
    draw();
});

function showContextMenu(x, y, track) {
    const menu = document.getElementById('context-menu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');
    
    if (state.mode === 'select') {
        document.getElementById('single-select-options').classList.remove('hidden');
        document.getElementById('multi-select-options').classList.add('hidden');
        let speed = calculateMaxSpeed(track.radius);
        document.getElementById('ctx-data').innerText = `Type: ${track.type}\nSpeed Limit: ${speed}km/h\nLen: ${(track.length/SCALE).toFixed(1)}m`;
    } else {
        document.getElementById('single-select-options').classList.add('hidden');
        document.getElementById('multi-select-options').classList.remove('hidden');
    }
}

document.getElementById('btn-delete').addEventListener('click', () => {
    if(state.selection.length > 0) {
        let t = state.selection[0];
        state.tracks = state.tracks.filter(tr => tr !== t);
        state.platforms = state.platforms.filter(pr => pr !== t);
        state.selection = [];
        document.getElementById('context-menu').classList.add('hidden');
        draw();
    }
});

// --- SAVE / LOAD / EXPORT / IMPORT ---
function serializeData() { return JSON.stringify({ tracks: state.tracks, platforms: state.platforms }); }

document.getElementById('btn-save').addEventListener('click', () => {
    localStorage.setItem('trainSandbox', serializeData());
    alert('Saved to local storage');
});

document.getElementById('btn-load').addEventListener('click', () => {
    let data = localStorage.getItem('trainSandbox');
    if (data) {
        let parsed = JSON.parse(data);
        state.tracks = parsed.tracks || [];
        state.platforms = parsed.platforms || [];
        draw();
    }
});

document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([serializeData()], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "track_layout.json";
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        let parsed = JSON.parse(e.target.result);
        state.tracks = parsed.tracks || [];
        state.platforms = parsed.platforms || [];
        draw();
    };
    reader.readAsText(file);
});
