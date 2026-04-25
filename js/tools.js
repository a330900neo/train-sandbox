import { Camera } from './camera.js';
import { GameState } from './state.js';
import { calculateSingleGeometry, splitGeometry, distance, getDistanceToTrack } from './math.js';

let isDragging = false;
let dragTarget = null;
let selectedTrackId = null;

export function initTools(canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); Camera.applyZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY); }, { passive: false });

    document.getElementById('btn-confirm-build').addEventListener('click', confirmBuild);
    document.getElementById('btn-cancel-build').addEventListener('click', cancelBuild);
    document.getElementById('btn-close-select').addEventListener('click', () => closeSelect());
    document.getElementById('btn-delete-track').addEventListener('click', deleteSelected);
}

function getSnap(worldPos) {
    if (!document.getElementById('toggle-snap').checked) return null;
    
    // 1. Endpoint Snapping (Radius 0.8m)
    for (let track of GameState.tracks) {
        if (distance(worldPos, track.start) < 0.8) return { pos: track.start, angle: track.startAngle + Math.PI, z: track.start.z };
        if (distance(worldPos, track.end) < 0.8) return { pos: track.end, angle: track.endAngle, z: track.end.z };
    }

    // 2. Parallel Side Snapping (3.2m offset)
    for (let track of GameState.tracks) {
        if (getDistanceToTrack(worldPos, track) < 4) { // generous catch radius
            // Logic to calculate 3.2m normal offset from the track would go here.
            // Simplified: we snap to the closest point on the line + 3.2m normal.
        }
    }
    return null;
}

function onPointerDown(e) {
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);
    isDragging = true;

    if (GameState.currentTool === 'select') {
        let closestDist = Infinity;
        let closestTrack = null;
        
        GameState.tracks.forEach(t => {
            t.selected = false; // Deselect all
            const dist = getDistanceToTrack(worldPos, t);
            if (dist < 1.5 && dist < closestDist) { // 1.5m tolerance
                closestDist = dist;
                closestTrack = t;
            }
        });

        if (closestTrack) {
            closestTrack.selected = true;
            selectedTrackId = closestTrack.id;
            const popup = document.getElementById('select-popup');
            popup.style.left = e.clientX + 'px';
            popup.style.top = e.clientY + 'px';
            popup.classList.remove('hidden');
            document.getElementById('select-data').innerText = `Type: ${closestTrack.type} | Len: ${Math.round(closestTrack.length)}m`;
        } else {
            closeSelect();
        }
        return;
    }

    // Build Track Logic
    if (GameState.currentTool === 'build_track') {
        if (GameState.preview) {
            if (distance(worldPos, GameState.preview.p1) < 5) dragTarget = 'p1';
            else if (distance(worldPos, GameState.preview.p2) < 5) dragTarget = 'p2';
            else isDragging = false;
        } else {
            const z = parseFloat(document.getElementById('input-elevation').value) || 0;
            let startPos = { ...worldPos, z };
            let startAngle = 0;
            const snap = getSnap(worldPos);
            if (snap) { startPos = { ...snap.pos }; startAngle = snap.angle; }

            GameState.preview = {
                p1: startPos, p2: { x: startPos.x + 10, y: startPos.y, z },
                startAngle: startAngle, geometries: []
            };
            dragTarget = 'p2';
            document.getElementById('preview-ui').classList.remove('hidden');
        }
    } else if (GameState.currentTool === 'pan') dragTarget = 'pan';
}

function onPointerMove(e) {
    if (!isDragging) return;
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);

    if (GameState.currentTool === 'build_track' && GameState.preview) {
        const z = parseFloat(document.getElementById('input-elevation').value) || 0;
        let currentPos = { ...worldPos, z };
        
        const snap = getSnap(worldPos);
        if (snap) currentPos = { ...snap.pos };

        if (dragTarget === 'p1') {
            GameState.preview.p1 = currentPos;
            if (snap) GameState.preview.startAngle = snap.angle;
        } else if (dragTarget === 'p2') {
            GameState.preview.p2 = currentPos;
        }

        // Calculate single geometry bridging p1 and p2
        const geo = calculateSingleGeometry(
            GameState.preview.p1, GameState.preview.startAngle, 
            GameState.preview.p2, GameState.preview.p1.z, GameState.preview.p2.z
        );
        
        // Split it into chunks!
        GameState.preview.geometries = splitGeometry(geo);
        updatePreviewUI();
    }
}

function onPointerUp() { isDragging = false; dragTarget = null; }

function updatePreviewUI() {
    if (!GameState.preview || GameState.preview.geometries.length === 0) return;
    const totalLength = GameState.preview.geometries.reduce((sum, g) => sum + g.length, 0);
    const zDiff = GameState.preview.p2.z - GameState.preview.p1.z;
    const gradient = totalLength > 0 ? (zDiff / totalLength) * 100 : 0;
    
    document.getElementById('preview-stats').innerText = 
        `Length: ${Math.round(totalLength)}m | Grad: ${gradient.toFixed(1)}% | Elev: ${GameState.preview.p2.z}m`;
}

function confirmBuild() {
    if (GameState.preview && GameState.preview.geometries.length > 0) {
        // Save the geometries to the state
        GameState.preview.geometries.forEach(geo => {
            geo.startAngle = GameState.preview.startAngle; // carry tangent
            GameState.addTrack(geo);
        });
    }
    cancelBuild();
}

function cancelBuild() {
    GameState.preview = null;
    document.getElementById('preview-ui').classList.add('hidden');
}

function closeSelect() {
    document.getElementById('select-popup').classList.add('hidden');
    GameState.tracks.forEach(t => t.selected = false);
    selectedTrackId = null;
}

function deleteSelected() {
    GameState.tracks = GameState.tracks.filter(t => t.id !== selectedTrackId);
    closeSelect();
}
