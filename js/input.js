import { Camera } from './camera.js';
import { Tools } from './tools.js';
import { State } from './state.js';

export function initInput(canvas) {
    let isDragging = false;
    let lastX = 0, lastY = 0;
    let initialPinchDist = null;

    canvas.addEventListener('pointerdown', (e) => {
        isDragging = true;
        lastX = e.clientX; lastY = e.clientY;
        const worldPos = Camera.screenToWorld(e.clientX, e.clientY);
        Tools.handlePointerDown(worldPos);
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        
        if (State.currentTool === 'pan' || (e.buttons === 4)) { // Middle click always pans
            Camera.applyPan(e.clientX - lastX, e.clientY - lastY);
        } else {
            const worldPos = Camera.screenToWorld(e.clientX, e.clientY);
            Tools.handlePointerMove(worldPos);
        }
        lastX = e.clientX; lastY = e.clientY;
    });

    window.addEventListener('pointerup', () => {
        isDragging = false;
        Tools.handlePointerUp();
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        Camera.applyZoom(factor, e.clientX, e.clientY);
    });

    // Mobile Pinch-to-zoom mapping
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDist) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = currentDist / initialPinchDist;
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            Camera.applyZoom(factor > 1 ? 1.05 : 0.95, cx, cy);
            initialPinchDist = currentDist;
        }
    });
}
