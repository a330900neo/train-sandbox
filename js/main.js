import { Builder } from './builder.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { state } from './state.js';

// Initialize game objects
const canvas = document.getElementById('gameCanvas');
const builder = new Builder();
const camera = new Camera(canvas.width, canvas.height);
const renderer = new Renderer(canvas);

// Mode selection handler
const connModeSelect = document.getElementById('conn-mode');
const radiusContainer = document.getElementById('radius-container');

if (connModeSelect) {
    connModeSelect.addEventListener('change', (e) => {
        builder.mode = e.target.value;
        
        if (e.target.value === 'arclinearc') {
            radiusContainer.classList.remove('hidden');
        } else {
            radiusContainer.classList.add('hidden');
        }
        
        if (typeof builder.updatePreview === 'function') {
            builder.updatePreview();
        }
        if (typeof updatePreviewText === 'function') {
            updatePreviewText();
        }
    });
}

function updatePreviewText() {
    // Update preview text display
    const previewEl = document.getElementById('preview-data');
    if (builder.previewTrack && previewEl) {
        previewEl.textContent = `Len: ${builder.previewTrack.length.toFixed(1)}m | Grad: 0% | Elev: 0m | Rad: 0m | Max: 0 km/h`;
    }
}

function setupInputs() {
    let pointers = [];
    let initialPinchDist = null;

    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId); 
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        pointers.push(e);

        const worldPt = camera.screenToWorld(e.clientX, e.clientY);

        if (pointers.length === 1) {
            if (state.currentTool === 'track') {
                if (!builder.handlePointerDown(worldPt)) {
                    camera.handlePanStart(e.clientX, e.clientY);
                }
            } else if (state.currentTool === 'pan') {
                camera.handlePanStart(e.clientX, e.clientY);
            } else if (state.currentTool === 'select' || state.currentTool === 'multiselect') {
                handleSelection(worldPt);
            }
        } else if (pointers.length === 2) {
            camera.handlePanEnd(); 
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const index = pointers.findIndex(p => p.pointerId === e.pointerId);
        if (index !== -1) pointers[index] = e;

        if (pointers.length === 2) {
            const dx = pointers[0].clientX - pointers[1].clientX;
            const dy = pointers[0].clientY - pointers[1].clientY;
            const currentPinchDist = Math.hypot(dx, dy);
            const centerX = (pointers[0].clientX + pointers[1].clientX) / 2;
            const centerY = (pointers[0].clientY + pointers[1].clientY) / 2;

            if (initialPinchDist) {
                const scaleFactor = initialPinchDist / currentPinchDist;
                camera.handlePinchZoom(scaleFactor, centerX, centerY);
            }
            
            initialPinchDist = currentPinchDist;

        } else if (pointers.length === 1) {
            initialPinchDist = null; 
            
            const worldPt = camera.screenToWorld(e.clientX, e.clientY);
            if (builder.isDraggingHandle) {
                builder.handlePointerMove(worldPt);
                updatePreviewText();
            } else if (camera.isDragging) {
                camera.handlePanMove(e.clientX, e.clientY);
            }
        }
    });

    const handlePointerEnd = (e) => {
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        
        if (canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
        
        if (pointers.length < 2) {
            initialPinchDist = null;
        }

        if (pointers.length === 1) {
            camera.handlePanStart(pointers[0].clientX, pointers[0].clientY);
        } else if (pointers.length === 0) {
            builder.handlePointerUp();
            camera.handlePanEnd();
        }
    };

    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);
    canvas.addEventListener('pointerout', handlePointerEnd);

    canvas.addEventListener('wheel', (e) => {
        camera.handleZoom(e.deltaY, e.clientX, e.clientY);
    });
}

function handleSelection(worldPt) {
    // Selection logic here
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    setupInputs();
    renderer.startRenderLoop();
});
