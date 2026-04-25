import { Camera } from './camera.js';
import { GameState } from './state.js';

export function render(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Render all bases first to merge intersections seamlessly
    GameState.tracks.forEach(track => drawTrack(ctx, track, false, 'base'));
    
    if (GameState.preview && GameState.preview.geometries) {
        GameState.preview.geometries.forEach(geo => drawTrack(ctx, geo, true, 'base'));
    }

    // 2. Render all rails on top
    GameState.tracks.forEach(track => drawTrack(ctx, track, false, 'rails'));
    
    if (GameState.preview && GameState.preview.geometries) {
        GameState.preview.geometries.forEach(geo => drawTrack(ctx, geo, true, 'rails'));
        drawHandles(ctx, GameState.preview);
    }
}

function drawTrack(ctx, geo, isPreview, layer) {
    if (geo.type === 'invalid') return;

    ctx.save();
    const isSelected = GameState.selectedTracks.has(geo.id);
    const baseWidth = 3.2 * Camera.zoom; 
    const gaugeWidth = 1.435 * Camera.zoom;

    const drawPath = () => {
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
    };

    if (layer === 'base') {
        ctx.lineWidth = baseWidth + (isSelected ? 4 : 0);
        ctx.strokeStyle = isSelected ? '#f1c40f' : (isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d');
        drawPath();
        ctx.stroke();
    } else if (layer === 'rails') {
        // Outer Rail outline
        ctx.lineWidth = gaugeWidth;
        ctx.strokeStyle = isPreview ? 'rgba(44, 62, 80, 0.5)' : '#2c3e50';
        drawPath(); ctx.stroke();
        
        // Inner fill to hollow it out
        ctx.lineWidth = gaugeWidth - (0.2 * Camera.zoom);
        ctx.strokeStyle = isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
        drawPath(); ctx.stroke();
    }

    ctx.restore();
}

function drawHandles(ctx, preview) {
    const p1 = Camera.worldToScreen(preview.p1.x, preview.p1.y);
    const p2 = Camera.worldToScreen(preview.p2.x, preview.p2.y);
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2); ctx.fill();
}
