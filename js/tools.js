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
    
    document.getElementById('input-elevation').addEventListener('change', (e) => GameState.currentElevation = parseFloat(e.target.value));
    
    // Dubins radius tuning controls
    document.getElementById('btn-dubins-up').addEventListener('click', () => tuneDubins(10));
    document.getElementById('btn-dubins-down').addEventListener('click', () => tuneDubins(-10));
}

function tuneDubins(amount) {
    const p = GameState.preview;
    const testRadius = GameState.connectionRadius + amount;
    if (testRadius < 50) return; // Minimum absolute radius
    
    // Test if the connection is still geometrically possible before applying
    if (calculateDubinsPath(p.p1, p.startAngle, p.p2, p.endAngle + Math.PI, testRadius)) {
        GameState.connectionRadius = testRadius;
        updatePreviewGeometry();
    }
}

function getSnap(worldPos) {
    if (!GameState.snapEnabled) return null;
    let bestSnap = null;
    let minD = GameState.snapRadius; 

    // 1. Endpoint Snapping (Highest Priority to lock in Dubins paths)
    for (let track of GameState.tracks) {
        let d1 = distance(worldPos, track.start);
        if (d1 < minD) { minD = d1; bestSnap = { pos: track.start, angle: track.startAngle + Math.PI, z: track.z1, type: 'end' }; }
        
        let d2 = distance(worldPos, track.end);
        if (d2 < minD) { minD = d2; bestSnap = { pos: track.end, angle: track.endAngle, z: track.z2, type: 'end' }; }
    }
    
    // If we snapped to an endpoint, return early so we don't accidentally grab a parallel track right next to it
    if (bestSnap && bestSnap.type === 'end') return bestSnap;

    // 2. Mid-Track & Parallel Snapping
    for (let track of GameState.tracks) {
        let info = track.type === 'straight' ? closestPointOnSegment(worldPos, track.start, track.end) : closestPointOnArc(worldPos, track);
        let d = distance(worldPos, info.point);

        if (d < minD) {
            minD = d; bestSnap = { pos: info.point, angle: info.angle, z: track.z1, type: 'mid' };
        }

        let pDist = Math.abs(d - GameState.parallelOffset);
        if (pDist < minD) {
            minD = pDist;
            let offsetDir = Math.atan2(worldPos.y - info.point.y, worldPos.x - info.point.x);
            let parallelPos = {
                x: info.point.x + Math.cos(offsetDir) * GameState.parallelOffset,
                y: info.point.y + Math.sin(offsetDir) * GameState.parallelOffset
            };
            bestSnap = { pos: parallelPos, angle: info.angle, z: track.z1, type: 'parallel' };
        }
    }
    return bestSnap;
}

function selectTrackAt(worldPos, multi) {
    let clickedId = null;
    for (let track of GameState.tracks) {
        let info = track.type === 'straight' ? closestPointOnSegment(worldPos, track.start, track.end) : closestPointOnArc(worldPos, track);
        if (distance(worldPos, info.point) < 2) { clickedId = track.id; break; }
    }

    if (!multi) GameState.selectedTracks.clear();
    if (clickedId) {
        if (GameState.selectedTracks.has(clickedId)) GameState.selectedTracks.delete(clickedId);
        else GameState.selectedTracks.add(clickedId);
    }
}

function onPointerDown(e) {
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);
    lastPointer = { x: e.clientX, y: e.clientY };
    isDragging = true;

    if (GameState.currentTool === 'select') {
        selectTrackAt(worldPos, false);
    } else if (GameState.currentTool === 'multi') {
        selectTrackAt(worldPos, true);
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

function onWheel(e) {
    if (GameState.currentTool !== 'pan') return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    Camera.applyZoom(zoomFactor, e.clientX, e.clientY);
}

function updatePreviewGeometry() {
    const p = GameState.preview;
    let path = [];
    let isDubins = false;
    let displayRadius = 0;

    // Use Dubins path ONLY if both ends are locked to track ends
    if (p.p1Type === 'end' && p.p2Type === 'end') {
        let dubins = calculateDubinsPath(p.p1, p.startAngle, p.p2, p.endAngle + Math.PI, GameState.connectionRadius);
        if (dubins) {
            path = dubins;
            isDubins = true;
            displayRadius = GameState.connectionRadius;
        }
    } 
    
    // Normal track building
    if (path.length === 0) {
        let singleGeo = calculateTrackGeometry(p.p1, p.startAngle, p.p2);
        if (singleGeo && singleGeo.type !== 'invalid') {
            path = [singleGeo];
            displayRadius = singleGeo.type === 'curve' ? singleGeo.radius : 0;
        } else {
            path = [{ type: 'straight', start: p.p1, end: p.p2, length: distance(p.p1, p.p2), startAngle: p.startAngle, endAngle: p.endAngle }];
            displayRadius = 0;
        }
    }

    p.geometries = path;
    
    // UI Updates
    document.getElementById('dubins-controls').classList.toggle('hidden', !isDubins);
    document.getElementById('dubins-radius-val').innerText = `${GameState.connectionRadius}m`;
    
    let totalLength = path.reduce((sum, g) => sum + g.length, 0);
    let dZ = p.endZ - p.startZ;
    let gradient = totalLength > 0 ? (dZ / totalLength) * 100 : 0;

    // Dynamic Clearance (base 3.2m + widening based on radius curve formula)
    let clearance = 3.2; 
    if (displayRadius > 0 && displayRadius < 10000) {
        clearance += 22.5 / displayRadius; 
    }

    let radString = displayRadius > 0 ? `${Math.round(displayRadius)}m` : `Straight`;
    document.getElementById('preview-stats').innerText = 
        `Len: ${Math.round(totalLength)}m | Z1: ${Math.round(p.startZ)}m Z2: ${Math.round(p.endZ)}m | Grad: ${gradient.toFixed(1)}% | Rad: ${radString} | Clearance: ${clearance.toFixed(2)}m`;
}

function confirmBuild() {
    if (GameState.preview && GameState.preview.geometries.length > 0) {
        let finalTracks = [];
        let curZ = GameState.preview.startZ;
        let totalL = GameState.preview.geometries.reduce((sum, g) => sum + g.length, 0);
        let dz = GameState.preview.endZ - GameState.preview.startZ;

        GameState.preview.geometries.forEach(geo => {
            let nextZ = curZ + (geo.length / totalL) * dz;
            finalTracks.push(...splitGeometry(geo, curZ, nextZ));
            curZ = nextZ;
        });
        
        GameState.addTracks(finalTracks);
    }
    cancelBuild();
}

function cancelBuild() {
    GameState.preview = null;
    document.getElementById('preview-ui').classList.add('hidden');
}
