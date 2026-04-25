import { Camera } from './camera.js';
import { GameState } from './state.js';

export function render(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allPermanent = GameState.tracks;
    const previewGeos = (GameState.preview && GameState.preview.geometries) ? GameState.preview.geometries : [];
    const allTracks = [...allPermanent, ...previewGeos];

    // Pass 0: Clearance Zones (Preview only)
    previewGeos.forEach(geo => drawTrack(ctx, geo, true, 'clearance'));

    // Pass 1: Base concrete/ballast
    allTracks.forEach(geo => drawTrack(ctx, geo, previewGeos.includes(geo), 'base'));

    // Pass 2: Outer rail outline
    allTracks.forEach(geo => drawTrack(ctx, geo, previewGeos.includes(geo), 'outer-rail'));

    // Pass 3: Inner fill to hollow out the rails and merge intersections
    allTracks.forEach(geo => drawTrack(ctx, geo, previewGeos.includes(geo), 'inner-fill'));

    if (GameState.preview) drawHandles(ctx, GameState.preview);
}

function drawTrack(ctx, geo, isPreview, layer) {
    if (geo.type === 'invalid') return;

    ctx.save();
    const isSelected = GameState.selectedTracks.has(geo.id);
    
    const clearanceWidth = 4.5 * Camera.zoom; // Clearance zone
    const baseWidth = 3.5 * Camera.zoom; 
    const gaugeWidth = 1.435 * Camera.zoom;
    const railWidth = 0.2 * Camera.zoom; // Thickness of the rail itself

    const baseColor = isPreview ? 'rgba(149, 165, 166, 0.5)' : '#7f8c8d';
    const railColor = isPreview ? 'rgba(44, 62, 80, 0.5)' : '#2c3e50';

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

    if (layer === 'clearance' && isPreview) {
        ctx.lineWidth = clearanceWidth;
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.2)'; // Faint yellow clearance zone
        ctx.stroke();
    } else if (layer === 'base') {
        ctx.lineWidth = baseWidth + (isSelected ? 4 : 0);
        ctx.strokeStyle = isSelected ? '#f1c40f' : baseColor;
        ctx.stroke();
    } else if (layer === 'outer-rail') {
        ctx.lineWidth = gaugeWidth + railWidth;
        ctx.strokeStyle = railColor;
        ctx.stroke();
    } else if (layer === 'inner-fill') {
        // This is drawn over the outer rail using the base color, creating the two rails
        ctx.lineWidth = gaugeWidth - railWidth;
        ctx.strokeStyle = baseColor;
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
