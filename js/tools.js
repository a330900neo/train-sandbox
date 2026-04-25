import { Camera } from './camera.js';
import { GameState } from './state.js';
import { calculateTrackGeometry, distance } from './math.js';

let isDragging = false;
let lastPointer = null;
let dragTarget = null; // 'start' or 'end' handle

export function initTools(canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    document.getElementById('btn-confirm-build').addEventListener('click', confirmBuild);
    document.getElementById('btn-cancel-build').addEventListener('click', cancelBuild);
}

function getSnap(worldPos) {
    if (!GameState.snapEnabled) return null;
    // Basic endpoint snap implementation
    for (let track of GameState.tracks) {
        if (distance(worldPos, track.start) < GameState.snapRadius) return { pos: track.start, angle: track.startAngle + Math.PI };
        if (distance(worldPos, track.end) < GameState.snapRadius) return { pos: track.end, angle: track.endAngle };
    }
    return null;
}

function onPointerDown(e) {
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);
    lastPointer = { x: e.clientX, y: e.clientY };
    isDragging = true;

    if (GameState.currentTool === 'build_track') {
        if (GameState.preview) {
            // Check if clicking handles to drag
            if (distance(worldPos, GameState.preview.p1) < 5) dragTarget = 'p1';
            else if (distance(worldPos, GameState.preview.p2) < 5) dragTarget = 'p2';
            else isDragging = false; // Ignore clicks elsewhere in preview mode
        } else {
            // Start a new preview
            let startPos = worldPos;
            let startAngle = 0; // Default angle
            
            const snap = getSnap(worldPos);
            if (snap) {
                startPos = { x: snap.pos.x, y: snap.pos.y };
                startAngle = snap.angle;
            }

            GameState.preview = {
                p1: startPos,
                p2: { x: startPos.x + 10, y: startPos.y }, // initial short offset
                startAngle: startAngle,
                geometry: null
            };
            dragTarget = 'p2';
            document.getElementById('preview-ui').classList.remove('hidden');
        }
    } else if (GameState.currentTool === 'pan') {
        dragTarget = 'pan';
    }
}

function onPointerMove(e) {
    if (!isDragging) return;
    const worldPos = Camera.screenToWorld(e.clientX, e.clientY);

    if (GameState.currentTool === 'build_track' && GameState.preview) {
        let currentPos = worldPos;
        const snap = getSnap(worldPos);
        if (snap) currentPos = { x: snap.pos.x, y: snap.pos.y };

        if (dragTarget === 'p1') {
            GameState.preview.p1 = currentPos;
            if (snap) GameState.preview.startAngle = snap.angle;
        } else if (dragTarget === 'p2') {
            GameState.preview.p2 = currentPos;
        }

        // Update geometry calculation
        GameState.preview.geometry = calculateTrackGeometry(
            GameState.preview.p1, 
            GameState.preview.startAngle, 
            GameState.preview.p2
        );
        updatePreviewUI();
    } else if (dragTarget === 'pan') {
        Camera.applyPan(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
    }

    lastPointer = { x: e.clientX, y: e.clientY };
}

function onPointerUp() {
    isDragging = false;
    dragTarget = null;
}

function onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    Camera.applyZoom(zoomFactor, e.clientX, e.clientY);
}

function updatePreviewUI() {
    if (!GameState.preview || !GameState.preview.geometry) return;
    const geo = GameState.preview.geometry;
    const ui = document.getElementById('preview-stats');
    if (geo.type === 'straight') {
        ui.innerText = `Type: Straight | Length: ${Math.round(geo.length)}m | Max Speed: 350 km/h`;
    } else if (geo.type === 'curve') {
        ui.innerText = `Type: Curve | Radius: ${Math.round(geo.radius)}m | Max Speed: ${Math.round(geo.speedLimit)} km/h`;
    }
}

function confirmBuild() {
    if (GameState.preview && GameState.preview.geometry) {
        // Carry over the start angle for continuous building logic
        GameState.preview.geometry.startAngle = GameState.preview.startAngle;
        GameState.addTrack(GameState.preview.geometry);
    }
    cancelBuild();
}

function cancelBuild() {
    GameState.preview = null;
    document.getElementById('preview-ui').classList.add('hidden');
}
