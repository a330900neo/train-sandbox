import { Camera } from './camera.js';
import { state } from './state.js';
import { Builder } from './builder.js';
import { Renderer } from './renderer.js';
import { getMaxSpeed } from './math.js';

const canvas = document.getElementById('gameCanvas');
const camera = new Camera();
const builder = new Builder();
const renderer = new Renderer(canvas, camera, builder);

// UI Elements
const buildUI = document.getElementById('build-ui');
const previewData = document.getElementById('preview-data');
const contextMenu = document.getElementById('context-menu');
const connMode = document.getElementById('conn-mode');
const connRadius = document.getElementById('conn-radius');
const radiusContainer = document.getElementById('radius-container');

function init() {
    window.addEventListener('resize', () => renderer.resize());
    renderer.resize();

    setupTools();
    setupInputs();
    setupMenus();

    requestAnimationFrame(gameLoop);
}

function setupTools() {
    const tools = ['pan', 'track', 'platform', 'select', 'multiselect'];
    tools.forEach(tool => {
        document.getElementById(`tool-${tool}`).addEventListener('click', (e) => {
            // Update active button state
            tools.forEach(t => document.getElementById(`tool-${t}`).classList.remove('active'));
            e.target.classList.add('active');
            
            state.currentTool = tool;
            
            // Toggle appropriate UI overlays
            if (tool === 'track') {
                const center = camera.screenToWorld(window.innerWidth/2, window.innerHeight/2);
                builder.startPreview(center.x, center.y);
                buildUI.classList.remove('hidden');
                contextMenu.classList.add('hidden');
            } else {
                buildUI.classList.add('hidden');
                builder.cancel();
            }
        });
    });

    document.getElementById('toggle-snap').addEventListener('change', (e) => {
        builder.snapEnabled = e.target.checked;
    });
}

function setupInputs() {
    let pointers = [];

    canvas.addEventListener('pointerdown', (e) => {
        pointers.push(e);
        const worldPt = camera.screenToWorld(e.clientX, e.clientY);

        if (state.currentTool === 'track') {
            if (!builder.handlePointerDown(worldPt)) {
                camera.handlePanStart(e.clientX, e.clientY);
            }
        } else if (state.currentTool === 'pan') {
            camera.handlePanStart(e.clientX, e.clientY);
        } else if (state.currentTool === 'select' || state.currentTool === 'multiselect') {
            handleSelection(worldPt);
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const index = pointers.findIndex(p => p.pointerId === e.pointerId);
        if (index !== -1) pointers[index] = e;

        if (pointers.length === 2) {
            // Pinch zoom placeholder for mobile multi-touch
        } else {
            const worldPt = camera.screenToWorld(e.clientX, e.clientY);
            if (builder.isDraggingHandle) {
                builder.handlePointerMove(worldPt);
                updatePreviewText();
            } else if (camera.isDragging) {
                camera.handlePanMove(e.clientX, e.clientY);
            }
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        builder.handlePointerUp();
        camera.handlePanEnd();
    });

    canvas.addEventListener('wheel', (e) => {
        camera.handleZoom(e.deltaY, e.clientX, e.clientY);
    });
}

function setupMenus() {
    // Build Confirm/Cancel
    document.getElementById('btn-confirm').addEventListener('click', () => builder.confirm());
    document.getElementById('btn-cancel').addEventListener('click', () => {
        document.getElementById('tool-pan').click(); // Revert to pan
    });

    // Save/Load
    document.getElementById('btn-save').addEventListener('click', () => state.save());
    document.getElementById('btn-load').addEventListener('click', () => state.load());
    
    // Context Menu Controls
    document.getElementById('btn-close-context').addEventListener('click', () => {
        contextMenu.classList.add('hidden');
        state.selection = [];
    });
    
    document.getElementById('btn-delete').addEventListener('click', () => {
        const ids = state.selection.map(t => t.id);
        state.tracks = state.tracks.filter(t => !ids.includes(t.id));
        state.selection = [];
        contextMenu.classList.add('hidden');
        if(state.computeIntersections) state.computeIntersections();
    });

    // Track Connection Modes
    connMode.addEventListener('change', (e) => {
        builder.mode = e.target.value;
        if (e.target.value === 'arclinearc') {
            radiusContainer.classList.remove('hidden');
        } else {
            radiusContainer.classList.add('hidden');
        }
        builder.updatePreview();
    });

    connRadius.addEventListener('input', (e) => {
        builder.customRadius = parseFloat(e.target.value) || 500;
        builder.updatePreview();
    });
}

function updatePreviewText() {
    const pt = builder.previewTrack;
    if (!pt) return;
    
    const speed = getMaxSpeed(pt.radius);
    const radiusText = pt.radius === Infinity ? 'Straight' : `${Math.round(pt.radius)}m`;
    const lengthText = `${Math.round(pt.totalLength || 0)}m`;
    
    previewData.innerText = `Len: ${lengthText} | Grad: 0% | Elev: ${builder.startP.h}m | Rad: ${radiusText} | Max: ${speed} km/h`;
}

function handleSelection(worldPt) {
    const clickThreshold = 5 / camera.zoom; 
    
    let hit = state.tracks.find(t => {
        if (!t.segments || t.segments.length === 0) return false;
        // Check proximity to the start of the first segment
        const mid = { x: (t.segments[0].p1.x + t.segments[0].p2.x)/2, y: (t.segments[0].p1.y + t.segments[0].p2.y)/2 };
        return Math.hypot(worldPt.x - mid.x, worldPt.y - mid.y) < clickThreshold * 10;
    });

    if (hit) {
        if (state.currentTool === 'select') state.selection = [hit];
        else if (state.currentTool === 'multiselect') state.selection.push(hit);
        showContextMenu();
    } else {
        state.selection = [];
        contextMenu.classList.add('hidden');
    }
}

function showContextMenu() {
    contextMenu.classList.remove('hidden');
    const info = document.getElementById('context-info');
    
    if (state.selection.length === 1) {
        const t = state.selection[0];
        const spd = getMaxSpeed(t.radius);
        info.innerText = `Length: ${Math.round(t.totalLength || 0)}m | Max Spd: ${spd}km/h`;
        document.getElementById('btn-turnaround').classList.add('hidden');
        document.getElementById('btn-block').classList.add('hidden');
    } else {
        info.innerText = `${state.selection.length} Tracks Selected`;
        document.getElementById('btn-turnaround').classList.remove('hidden');
        document.getElementById('btn-block').classList.remove('hidden');
    }
}

function gameLoop() {
    renderer.draw();
    requestAnimationFrame(gameLoop);
}

init();
