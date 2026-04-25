import { Camera } from './camera.js';
import { GameState } from './state.js';

export function render(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Scale: 1.435m gauge, 3m track base width
    const baseWidth = 3 * Camera.zoom;
    const gaugeWidth = 1.435 * Camera.zoom;
    const innerClearWidth = gaugeWidth - (0.2 * Camera.zoom); // 0.1m rail width

    // Helper to generate the path for a track
    const createPath = (geo) => {
        ctx.beginPath();
        if (geo.type === 'straight') {
            const start = Camera.worldToScreen(geo.start.x, geo.start.y);
            const end = Camera.worldToScreen(geo.end.x, geo.end.y);
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
        } else if (geo.type === 'curve') {
            const center = Camera.worldToScreen(geo.center.x, geo.center.y);
            const radius = geo.radius * Camera.zoom;
            ctx.arc(center.x, center.y, radius, geo.startArcAngle, geo.endArcAngle, !geo.isRightTurn);
        }
    };

    // Collect all tracks to draw (confirmed + preview sections)
    let tracksToDraw = [...GameState.tracks];
    if (GameState.preview && GameState.preview.geometries) {
        tracksToDraw = tracksToDraw.concat(GameState.preview.geometries.map(g => ({...g, isPreview: true})));
    }

    // PASS 1: Draw ALL Gray Bases
    ctx.lineWidth = baseWidth;
    tracksToDraw.forEach(track => {
        ctx.strokeStyle = track.isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
        if (track.selected) ctx.strokeStyle = '#f1c40f'; // Highlight selected
        createPath(track);
        ctx.stroke();
    });

    // PASS 2: Draw ALL Outer Rails (Dark)
    ctx.lineWidth = gaugeWidth;
    tracksToDraw.forEach(track => {
        ctx.strokeStyle = track.isPreview ? 'rgba(44, 62, 80, 0.5)' : '#2c3e50';
        createPath(track);
        ctx.stroke();
    });

    // PASS 3: Draw ALL Inner Clears (Exposes the base color between rails)
    ctx.lineWidth = innerClearWidth;
    tracksToDraw.forEach(track => {
        ctx.strokeStyle = track.isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
        if (track.selected) ctx.strokeStyle = '#f1c40f';
        createPath(track);
        ctx.stroke();
    });

    // Draw handles for preview
    if (GameState.preview) {
        const p1 = Camera.worldToScreen(GameState.preview.p1.x, GameState.preview.p1.y);
        const p2 = Camera.worldToScreen(GameState.preview.p2.x, GameState.preview.p2.y);
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2); ctx.fill();
    }
}
