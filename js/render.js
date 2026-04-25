import { State } from './state.js';
import { Camera } from './camera.js';
import { MathUtils } from './math.js';

export function render(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Tracks
    State.tracks.forEach(track => drawPath(ctx, track, false));

    // Draw Preview
    if (State.preview.active) {
        const path = MathUtils.calculatePath(State.preview.p1, State.preview.p2);
        if (path) {
            drawPath(ctx, path, true);
        }
        drawHandle(ctx, State.preview.p1);
        drawHandle(ctx, State.preview.p2);
    }
}

function drawPath(ctx, path, isPreview) {
    const s = State.scale * Camera.zoom;
    const baseWidth = State.trainWidth * s;
    const gaugeWidth = State.gauge * s;

    ctx.lineCap = 'butt';
    
    // Base layer (Gray)
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.lineWidth = baseWidth;
    ctx.strokeStyle = isPreview ? 'rgba(150, 150, 150, 0.5)' : '#7f8c8d';
    ctx.stroke();

    // Rails
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.lineWidth = gaugeWidth;
    // Trick: Draw thick transparent line with border using dash or globalCompositeOperation 
    // Simplified: Draw center line for gauge gap
    ctx.strokeStyle = isPreview ? 'rgba(255, 255, 255, 0.5)' : '#bdc3c7';
    ctx.stroke();
    
    // Hollow out center of rails to make two lines
    ctx.beginPath();
    tracePath(ctx, path);
    ctx.lineWidth = gaugeWidth * 0.8;
    ctx.strokeStyle = isPreview ? 'rgba(150, 150, 150, 0.5)' : '#7f8c8d';
    ctx.stroke();
}

function tracePath(ctx, path) {
    const p1 = Camera.worldToScreen(path.p1.x, path.p1.y);
    const p2 = Camera.worldToScreen(path.p2.x, path.p2.y);
    
    ctx.moveTo(p1.x, p1.y);
    if (path.type === 'straight') {
        ctx.lineTo(p2.x, p2.y);
    } else {
        const c = Camera.worldToScreen(path.cx, path.cy);
        ctx.arc(c.x, c.y, path.radius * State.scale * Camera.zoom, path.startAngle, path.endAngle, !path.ccw);
    }
}

function drawHandle(ctx, p) {
    const sp = Camera.worldToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();
    ctx.stroke();
}
