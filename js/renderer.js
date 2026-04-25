import { Camera } from './camera.js';
import { GameState } from './state.js';

export function render(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Combine all geometries to render them in exact layer order
    const allTracks = GameState.tracks.map(t => ({ ...t, isPreview: false }));
    if (GameState.preview && GameState.preview.geometries) {
        GameState.preview.geometries.forEach(g => allTracks.push({ ...g, isPreview: true }));
    }

    // 3-Pass Rendering creates flawless track intersections
    // Pass 1: Draw all solid bases
    allTracks.forEach(track => drawTrackLayer(ctx, track, track.isPreview, 'base'));
    
    // Pass 2: Draw all outer rail lines (dark blue)
    allTracks.forEach(track => drawTrackLayer(ctx, track, track.isPreview, 'rail-outer'));
    
    // Pass 3: Draw all inner rail fills to hollow out the rails
    allTracks.forEach(track => drawTrackLayer(ctx, track, track.isPreview, 'rail-inner'));

    if (GameState.preview) drawHandles(ctx, GameState.preview);
}

function drawTrackLayer(ctx, geo, isPreview, layer) {
    if (geo.type === 'invalid') return;

    ctx.save();
    const isSelected = GameState.selectedTracks.has(geo.id);
    const baseWidth = 3.5 * Camera.zoom; 
    const gaugeWidth = 1.435 * Camera.zoom;

    ctx.beginPath();
    if (geo.type === 'straight') {
        const start = Camera.worldToScreen(geo.start.x, geo.start.y);
        const end = Camera.worldToScreen(geo.end.x, geo.end.y);
        ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
    } else if (geo.type === 'curve') {
        const center = Camera.worldToScreen(geo.center.x, geo.center.y);
        const radius = geo.radius * Camera.zoom;
        ctx.arc(center.x, center.y, radius, geo.startArcAngle, geo.endArcAngle, !geo.isRightTurn);
    }

    if (layer === 'base') {
        ctx.lineWidth = baseWidth + (isSelected ? 4 : 0);
        ctx.strokeStyle = isSelected ? '#f1c40f' : (isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d');
        ctx.stroke();
    } else if (layer === 'rail-outer') {
        ctx.lineWidth = gaugeWidth;
        ctx.strokeStyle = isPreview ? 'rgba(44, 62, 80, 0.5)' : '#2c3e50';
        ctx.stroke();
    } else if (layer === 'rail-inner') {
        ctx.lineWidth = gaugeWidth - (0.2 * Camera.zoom);
        ctx.strokeStyle = isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
        ctx.stroke();
    }

    ctx.restore();
}

function drawHandles(ctx, preview) {
    const p1 = Camera.worldToScreen(preview.p1.x, preview.p1.y);
    const p2 = Camera.worldToScreen(preview.p2.x, preview.p2.y);
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2); ctx.fill();
}
