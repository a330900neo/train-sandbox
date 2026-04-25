import { Camera } from './camera.js';
import { GameState } from './state.js';
import { calculateDubinsPath, calculateTrackGeometry, distance, splitGeometry, closestPointOnSegment, closestPointOnArc } from './math.js';

let isDragging = false;
let dragTarget = null;
let lastPointer = null;

export function initTools(canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    document.getElementById('btn-confirm-build').addEventListener('click', confirmBuild);
    document.getElementById('btn-cancel-build').addEventListener('click', cancelBuild);
    
    // Zoom Buttons
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        Camera.applyZoom(1.2, canvas.width/2, canvas.height/2);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        Camera.applyZoom(0.8, canvas.width/2, canvas.height/2);
    });

    // Dubins Controls
    document.getElementById('btn-flip-start').addEventListener('click', () => {
        if(GameState.preview) { GameState.preview.flipStart = !GameState.preview.flipStart; updatePreviewGeometry(); }
    });
    document.getElementById('btn-flip-end').addEventListener('click', () => {
        if(GameState.preview) { GameState.preview.flipEnd = !GameState.preview.flipEnd; updatePreviewGeometry(); }
    });
    document.getElementById('btn-next-path').addEventListener('click', () => {
        if(GameState.preview) { GameState.preview.dubinsIndex++; updatePreviewGeometry(); }
    });

    document.getElementById('input-elevation').addEventListener('change', (e) => GameState.currentElevation = parseFloat(e.target.value));
    document.getElementById('input-radius').addEventListener('input', (e) => {
        GameState.connectionRadius = parseFloat(e.target.value);
        document.getElementById('radius-val').innerText = `${GameState.connectionRadius}m`;
        if (GameState.preview) updatePreviewGeometry();
    });
}

// Strictly finds the absolute closest snap point
function getSnap(worldPos) {
    if (!GameState.snapEnabled) return null;
    let minD = GameState.snapRadius; // 1.5m
    let bestSnap = null;

    const checkSnap = (pos, angle, z, type) => {
        let d = distance(worldPos, pos);
        if (d < minD) { minD = d; bestSnap = { pos, angle, z, type }; }
    };

    for (let track of GameState.tracks) {
        // 1. Endpoints
        checkSnap(track.start, track.startAngle + Math.PI, track.z1, 'end');
        checkSnap(track.end, track.endAngle, track.z2, 'end');

        // 2. Midpoints & Parallel
        let info = track.type === 'straight' ? 
            closestPointOnSegment(worldPos, track.start, track.end) : 
            closestPointOnArc(worldPos, track);

        checkSnap(info.point, info.angle, track.z1, 'mid'); // Exact mid-track

        // Parallel logic (find distance to the parallel offset line)
        let distToCenter = distance(worldPos, info.point);
        if (Math.abs(distToCenter - GameState.parallelOffset) < GameState.snapRadius) {
            let offsetDir = Math.atan2(worldPos.y - info.point.y, worldPos.x - info.point.x);
            let parallelPos = {
                x: info.point.x + Math.cos(offsetDir) * GameState.parallelOffset,
                y: info.point.y + Math.sin(offsetDir) * GameState.parallelOffset
            };
            // Manually evaluate against absolute minD
            let d = distance(worldPos, parallelPos);
            if (d < minD) {
                minD = d;
                bestSnap = { pos: parallelPos, angle: info.angle, z: track.z1, type: 'parallel' };
            }
        }
    }
    return bestSnap;
}

function selectTrackAt(worldPos, multi) { /* (Keep existing implementation) */ }

function onPointerDown(e) {
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);
    lastPointer = { x: e.clientX, y: e.clientY };
    isDragging = true;

    if (GameState.currentTool === 'select' || GameState.currentTool === 'multi') {
        // Keep existing logic
    } else if (GameState.currentTool === 'build_track') {
        if (GameState.preview) {
            if (distance(worldPos, GameState.preview.p1) < 5) dragTarget = 'p1';
            else if (distance(worldPos, GameState.preview.p2) < 5) dragTarget = 'p2';
            else isDragging = false;
        } else {
            const snap = getSnap(worldPos);
            GameState.preview = {
                p1: snap ? { ...snap.pos } : worldPos,
                p2: { x: worldPos.x + 10, y: worldPos.y },
                startAngle: snap ? snap.angle : 0,
                endAngle: snap ? snap.angle : 0,
                startZ: snap && snap.z !== undefined ? snap.z : GameState.currentElevation,
                endZ: GameState.currentElevation,
                p1Type: snap ? snap.type : 'free',
                p2Type: 'free',
                flipStart: false,
                flipEnd: false,
                dubinsIndex: 0,
                geometries: []
            };
            dragTarget = 'p2';
            document.getElementById('preview-ui').classList.remove('hidden');
        }
    } else {
        dragTarget = 'pan';
    }
}

function onPointerMove(e) {
    if (!isDragging) return;
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);

    if (GameState.currentTool === 'build_track' && GameState.preview) {
        const snap = getSnap(worldPos);
        let currentPos = snap ? { x: snap.pos.x, y: snap.pos.y } : worldPos;

        if (dragTarget === 'p1') {
            GameState.preview.p1 = currentPos;
            GameState.preview.p1Type = snap ? snap.type : 'free';
            if (snap) { GameState.preview.startAngle = snap.angle; GameState.preview.startZ = snap.z; }
        } else if (dragTarget === 'p2') {
            GameState.preview.p2 = currentPos;
            GameState.preview.p2Type = snap ? snap.type : 'free';
            if (snap) { GameState.preview.endAngle = snap.angle; GameState.preview.endZ = snap.z; }
        }
        updatePreviewGeometry();
    } else if (dragTarget === 'pan') {
        Camera.applyPan(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
    }
    lastPointer = { x: e.clientX, y: e.clientY };
}

function onPointerUp() { isDragging = false; dragTarget = null; }
function onWheel(e) { /* (Keep existing logic) */ }

function updatePreviewGeometry() {
    const p = GameState.preview;
    let path = [];
    let isDubins = false;
    let radiusDisplay = "--";

    // Dubins Path ONLY when connecting two precise ends
    if (p.p1Type === 'end' && p.p2Type === 'end') {
        isDubins = true;
        document.getElementById('dubins-controls').classList.remove('hidden');
        
        let a1 = p.startAngle + (p.flipStart ? Math.PI : 0);
        let a2 = p.endAngle + Math.PI + (p.flipEnd ? Math.PI : 0);

        let allDubins = calculateDubinsPath(p.p1, a1, p.p2, a2, GameState.connectionRadius);
        if (allDubins.length > 0) {
            path = allDubins[p.dubinsIndex % allDubins.length]; // Cycle safely
            radiusDisplay = `${GameState.connectionRadius}m (Dubins)`;
        }
    } else {
        document.getElementById('dubins-controls').classList.add('hidden');
    }
    
    // Normal single-arc building
    if (path.length === 0) {
        let a1 = p.startAngle + (p.flipStart ? Math.PI : 0);
        let singleGeo = calculateTrackGeometry(p.p1, a1, p.p2);
        if (singleGeo && singleGeo.type !== 'invalid') {
            path = [singleGeo];
            radiusDisplay = singleGeo.type === 'curve' ? `${Math.round(singleGeo.radius)}m` : 'Straight';
        } else {
            path = [{ type: 'straight', start: p.p1, end: p.p2, length: distance(p.p1, p.p2), startAngle: a1, endAngle: p.endAngle }];
            radiusDisplay = 'Straight';
        }
    }

    p.geometries = path;
    
    let totalLength = path.reduce((sum, g) => sum + g.length, 0);
    let dZ = p.endZ - p.startZ;
    let gradient = totalLength > 0 ? (dZ / totalLength) * 100 : 0;

    document.getElementById('preview-stats').innerText = 
        `Len: ${Math.round(totalLength)}m | Z1: ${Math.round(p.startZ)}m Z2: ${Math.round(p.endZ)}m | Grad: ${gradient.toFixed(1)}% | Rad: ${radiusDisplay}`;
}

function confirmBuild() { /* (Keep existing logic) */ }
function cancelBuild() { /* (Keep existing logic) */ }
