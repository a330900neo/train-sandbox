import { Renderer } from './Renderer.js';
import { InputHandler } from './InputHandler.js';
import { TrackManager } from './TrackManager.js';
import { Vector2, calculateSpeedLimit } from './MathUtils.js';

const canvas = document.getElementById('gameCanvas');
const renderer = new Renderer(canvas);
const input = new InputHandler(canvas, renderer);
const trackManager = new TrackManager();

// Game State
let currentMode = 'select'; // 'select' or 'build'
let buildState = 0; // 0: wait for start point, 1: dragging end point
let previewStart = null;

// UI Elements
const btnSelect = document.getElementById('btn-select');
const btnBuild = document.getElementById('btn-build');
const previewPanel = document.getElementById('preview-info');
const btnConfirm = document.getElementById('btn-confirm');
const infoLength = document.getElementById('info-length');
const infoSpeed = document.getElementById('info-speed');

// Setup UI Listeners
btnSelect.addEventListener('click', () => { currentMode = 'select'; updateUI(); });
btnBuild.addEventListener('click', () => { currentMode = 'build'; buildState = 0; updateUI(); });

btnConfirm.addEventListener('click', () => {
    if (buildState === 1 && previewStart) {
        const layer = parseInt(document.getElementById('input-layer').value);
        const endPos = input.mouseWorld;
        trackManager.addSegment(previewStart, endPos, layer);
        buildState = 0;
        previewPanel.classList.add('hidden');
    }
});

function updateUI() {
    btnSelect.classList.toggle('active', currentMode === 'select');
    btnBuild.classList.toggle('active', currentMode === 'build');
    if (currentMode !== 'build') previewPanel.classList.add('hidden');
}

// Handle clicks based on mode
input.onTap = (worldPos) => {
    if (currentMode === 'build') {
        const layer = parseInt(document.getElementById('input-layer').value);
        const parallelDist = parseFloat(document.getElementById('input-parallel').value);
        const snappedPos = trackManager.getSnappedPoint(worldPos, layer, parallelDist);

        if (buildState === 0) {
            previewStart = snappedPos;
            buildState = 1;
            previewPanel.classList.remove('hidden');
        }
    }
};

// Main Game Loop
function loop() {
    renderer.clear();
    renderer.beginWorld();

    // Draw confirmed tracks
    for (const seg of trackManager.segments) {
        renderer.drawTrackSegment(seg.start, seg.end, false);
    }

    // Draw Building Preview
    if (currentMode === 'build' && buildState === 1 && previewStart) {
        const layer = parseInt(document.getElementById('input-layer').value);
        const parallelDist = parseFloat(document.getElementById('input-parallel').value);
        const currentEnd = trackManager.getSnappedPoint(input.mouseWorld, layer, parallelDist);
        
        // Draw the preview line
        renderer.drawTrackSegment(previewStart, currentEnd, true);

        // Update UI Info
        const length = new Vector2(previewStart.x, previewStart.y).distanceTo(new Vector2(currentEnd.x, currentEnd.y));
        infoLength.innerText = length.toFixed(1);
        infoSpeed.innerText = calculateSpeedLimit(Infinity); // Straight line default
    }

    renderer.endWorld();
    requestAnimationFrame(loop);
}

// Start loop
loop();
