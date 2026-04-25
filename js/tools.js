import { Camera } from './camera.js';
import { GameState } from './state.js';
import { calculateDubinsPath, distance, splitGeometry, pointToSegmentDist, pointToArcDist } from './math.js';

let isDragging = false;
let dragTarget = null;
let lastPointer = null;

export function initTools(canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    
    document.getElementById('btn-confirm-build').addEventListener('click', confirmBuild);
    document.getElementById('btn-cancel-build').addEventListener('click', cancelBuild);
    
    document.getElementById('input-elevation').addEventListener('change', (e) => GameState.currentElevation = parseFloat(e.target.value));
    document.getElementById('input-radius').addEventListener('input', (e) => {
        GameState.connectionRadius = parseFloat(e.target.value);
        document.getElementById('radius-val').innerText = `${GameState.connectionRadius}m`;
        if (GameState.preview) updatePreviewGeometry(); // Live update
    });
}

function getSnap(worldPos) {
    if (!GameState.snapEnabled) return null;
    let closest = null;
    let minD = GameState.snapRadius;

    // Endpoint snapping
    for (let track of GameState.tracks) {
        const dStart = distance(worldPos, track.start);
        if (dStart < minD) { minD = dStart; closest = { pos: track.start, angle: track.startAngle + Math.PI, z: track.z1, isParallel: false }; }
        const dEnd = distance(worldPos, track.end);
        if (dEnd < minD) { minD = dEnd; closest = { pos: track.end, angle: track.endAngle, z: track.z2, isParallel: false }; }
    }

    // Parallel snapping (track sides)
    if (!closest) {
        for (let track of GameState.tracks) {
            let d = track.type === 'straight' ? pointToSegmentDist(worldPos, track.start, track.end) : pointToArcDist(worldPos, track);
            // If mouse is near the 3.2m offset bounds
            if (Math.abs(d - GameState.parallelOffset) < GameState.snapRadius) {
                // In a full implementation, we'd calculate the exact projected normal point here.
                // For brevity, we return a hint that we want parallel offset.
                return { pos: worldPos, angle: track.endAngle, z: track.z1, isParallel: true, refId: track.id };
            }
        }
    }
    return closest;
}

function selectTrackAt(worldPos, multi) {
    let clickedId = null;
    for (let track of GameState.tracks) {
        let d = track.type === 'straight' ? pointToSegmentDist(worldPos, track.start, track.end) : pointToArcDist(worldPos, track);
        if (d < 2) { clickedId = track.id; break; } // Hitbox 2m
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
            if (snap) { GameState.preview.startAngle = snap.angle; GameState.preview.startZ = snap.z; }
        } else if (dragTarget === 'p2') {
            GameState.preview.p2 = currentPos;
            if (snap) { GameState.preview.endAngle = snap.angle; GameState.preview.endZ = snap.z; }
        }
        updatePreviewGeometry();
    } else if (dragTarget === 'pan') {
        Camera.applyPan(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
    }
    lastPointer = { x: e.clientX, y: e.clientY };
}

function onPointerUp() { isDragging = false; dragTarget = null; }

function updatePreviewGeometry() {
    const p = GameState.preview;
    // Uses Dubins path to generate geometry array
    let path = calculateDubinsPath(p.p1, p.startAngle, p.p2, p.endAngle + Math.PI, GameState.connectionRadius);
    
    // Fallback to straight line if Dubins fails (endpoints too close/awkward angles)
    if (!path) {
        path = [{ type: 'straight', start: p.p1, end: p.p2, length: distance(p.p1, p.p2), startAngle: p.startAngle, endAngle: p.endAngle }];
    }

    p.geometries = path;
    
    let totalLength = path.reduce((sum, g) => sum + g.length, 0);
    let dZ = p.endZ - p.startZ;
    let gradient = totalLength > 0 ? (dZ / totalLength) * 100 : 0;

    document.getElementById('preview-stats').innerText = 
        `Len: ${Math.round(totalLength)}m | Z1: ${Math.round(p.startZ)}m Z2: ${Math.round(p.endZ)}m | Grad: ${gradient.toFixed(1)}% | Rad: ${GameState.connectionRadius}m`;
}

function confirmBuild() {
    if (GameState.preview && GameState.preview.geometries.length > 0) {
        let finalTracks = [];
        let curZ = GameState.preview.startZ;
        let totalL = GameState.preview.geometries.reduce((sum, g) => sum + g.length, 0);
        let dz = GameState.preview.endZ - GameState.preview.startZ;

        GameState.preview.geometries.forEach(geo => {
            let nextZ = curZ + (geo.length / totalL) * dz;
            // Subdivide tracks into 5m-40m chunks
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
