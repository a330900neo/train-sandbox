import { Camera } from './camera.js';
import { GameState } from './state.js';

export function render(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid (optional, helps with scale)
    drawGrid(ctx);

    // Draw confirmed tracks
    GameState.tracks.forEach(track => drawTrack(ctx, track, false));

    // Draw preview track
    if (GameState.preview && GameState.preview.geometry) {
        drawTrack(ctx, GameState.preview.geometry, true);
        drawHandles(ctx, GameState.preview);
    }
}

function drawTrack(ctx, geo, isPreview) {
    if (geo.type === 'invalid') return;

    ctx.save();
    
    // Scale: 1.435m gauge, 3m track base width
    const baseWidth = 3 * Camera.zoom;
    const gaugeWidth = 1.435 * Camera.zoom;

    const drawPath = () => {
        ctx.beginPath();
        if (geo.type === 'straight') {
            const start = Camera.worldToScreen(geo.start.x, geo.start.y);
            const end = Camera.worldToScreen(geo.end.x, geo.end.y);
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
        } else if (geo.type === 'curve') {
            const center = Camera.worldToScreen(geo.center.x, geo.center.y);
            const radius = geo.radius * Camera.zoom;
            // Canvas arc is always clockwise by default unless specified
            ctx.arc(center.x, center.y, radius, geo.startArcAngle, geo.endArcAngle, !geo.isRightTurn);
        }
    };

    // 1. Draw Gray Base
    ctx.lineWidth = baseWidth;
    ctx.strokeStyle = isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
    drawPath();
    ctx.stroke();

    // 2. Draw Rails (Using trick: draw thick track, then clear inside, but we need 2 lines)
    // For proper rail rendering at scale, we use stroke with dashed/parallel offsets or composite operations.
    // Simplified parallel rendering:
    ctx.lineWidth = gaugeWidth;
    ctx.strokeStyle = isPreview ? 'rgba(44, 62, 80, 0.5)' : '#2c3e50';
    drawPath();
    ctx.stroke();
    
    // Fill the middle of the gauge to expose the base color
    ctx.lineWidth = gaugeWidth - (0.2 * Camera.zoom); // 0.1m rail width
    ctx.strokeStyle = isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
    drawPath();
    ctx.stroke();

    ctx.restore();
}

function drawHandles(ctx, preview) {
    const p1 = Camera.worldToScreen(preview.p1.x, preview.p1.y);
    const p2 = Camera.worldToScreen(preview.p2.x, preview.p2.y);

    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2); ctx.fill();
    
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2); ctx.fill();
}

function drawGrid(ctx) {
    // Basic 10x10 meter grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const size = 10 * Camera.zoom;
    const offsetX = (Camera.x * Camera.zoom) % size;
    const offsetY = (Camera.y * Camera.zoom) % size;

    ctx.beginPath();
    for (let x = -offsetX; x < window.innerWidth; x += size) {
        ctx.moveTo(x, 0); ctx.lineTo(x, window.innerHeight);
    }
    for (let y = -offsetY; y < window.innerHeight; y += size) {
        ctx.moveTo(0, y); ctx.lineTo(window.innerWidth, y);
    }
    ctx.stroke();
}
