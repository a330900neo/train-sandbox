const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let camera = { x: 0, y: 0, zoom: 10 }; // 10 pixels per meter
let isDragging = false;
let lastPointer = null;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function screenToWorld(px, py) {
    return new Vector2((px - canvas.width/2)/camera.zoom - camera.x, (py - canvas.height/2)/camera.zoom - camera.y);
}

// Input Handling
canvas.addEventListener('pointerdown', e => {
    lastPointer = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (TrackSys.mode === 'pan') {
        isDragging = true;
    } else if (TrackSys.mode === 'build') {
        if (!TrackSys.preview) {
            const z = parseFloat(document.getElementById('current-z').value) || 0;
            TrackSys.startPreview(worldPos, z);
        } else {
            // Check if dragging endpoints
            if (worldPos.dist(TrackSys.preview.p1) < 2) TrackSys.preview.dragNode = 1;
            else if (worldPos.dist(TrackSys.preview.p2) < 2) TrackSys.preview.dragNode = 2;
            isDragging = true;
        }
    } else if (TrackSys.mode === 'select') {
        TrackSys.selectTrack(worldPos);
    }
});

canvas.addEventListener('pointermove', e => {
    if (isDragging && lastPointer) {
        const dx = e.clientX - lastPointer.x;
        const dy = e.clientY - lastPointer.y;
        
        if (TrackSys.mode === 'pan') {
            camera.x += dx / camera.zoom;
            camera.y += dy / camera.zoom;
        } else if (TrackSys.mode === 'build' && TrackSys.preview) {
            TrackSys.updatePreview(screenToWorld(e.clientX, e.clientY));
        }
    }
    lastPointer = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointerup', () => { isDragging = false; });
canvas.addEventListener('wheel', e => {
    camera.zoom *= Math.pow(0.999, e.deltaY);
    camera.zoom = Math.max(1, Math.min(camera.zoom, 100));
});

// UI Bindings
document.getElementById('tool-pan').onclick = (e) => { TrackSys.setMode('pan'); updateActive(e.target); };
document.getElementById('tool-build').onclick = (e) => { TrackSys.setMode('build'); updateActive(e.target); };
document.getElementById('tool-select').onclick = (e) => { TrackSys.setMode('select'); updateActive(e.target); };
document.getElementById('btn-confirm-build').onclick = () => TrackSys.confirmBuild();
document.getElementById('btn-cancel-build').onclick = () => TrackSys.cancelBuild();
document.getElementById('btn-delete-track').onclick = () => TrackSys.deleteSelection();

function updateActive(target) {
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
}

function drawSegment(p1, p2, type, data, colorBase, colorRail) {
    ctx.lineCap = 'butt';
    
    // Base (Gray)
    ctx.beginPath();
    ctx.strokeStyle = colorBase;
    ctx.lineWidth = 3.2; // 3.2m width
    if (type === 'straight') {
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    } else if (type === 'arc' && data) {
        const a1 = Math.atan2(p1.y - data.center.y, p1.x - data.center.x);
        const a2 = Math.atan2(p2.y - data.center.y, p2.x - data.center.x);
        ctx.arc(data.center.x, data.center.y, data.radius, a1, a2, data.ccw);
    }
    ctx.stroke();

    // Rails
    const halfGauge = TrackSys.gauge / 2;
    for (let sign of [-1, 1]) {
        ctx.beginPath();
        ctx.strokeStyle = colorRail;
        ctx.lineWidth = 0.2;
        if (type === 'straight') {
            const dir = p2.sub(p1).norm();
            const normal = new Vector2(-dir.y, dir.x).mul(sign * halfGauge);
            ctx.moveTo(p1.x + normal.x, p1.y + normal.y);
            ctx.lineTo(p2.x + normal.x, p2.y + normal.y);
        } else if (type === 'arc' && data) {
            const rOffset = data.radius + (sign * halfGauge * (data.ccw ? -1 : 1));
            const a1 = Math.atan2(p1.y - data.center.y, p1.x - data.center.x);
            const a2 = Math.atan2(p2.y - data.center.y, p2.x - data.center.x);
            ctx.arc(data.center.x, data.center.y, rOffset, a1, a2, data.ccw);
        }
        ctx.stroke();
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(camera.x, camera.y);

    // Draw confirmed tracks
    TrackSys.segments.forEach(seg => {
        const isSelected = TrackSys.selection.includes(seg);
        const baseColor = isSelected ? 'rgba(200, 200, 50, 0.8)' : 'rgba(100, 100, 100, 0.8)';
        drawSegment(seg.n1.pos, seg.n2.pos, seg.type, seg.data, baseColor, '#333');
    });

    // Draw preview
    if (TrackSys.preview) {
        TrackSys.preview.path.forEach(p => {
            drawSegment(p.p1, p.p2, p.type, p, 'rgba(150, 200, 255, 0.5)', 'rgba(0, 100, 255, 0.8)');
        });
        
        // Draw interactive nodes
        ctx.fillStyle = 'yellow';
        ctx.beginPath(); ctx.arc(TrackSys.preview.p1.x, TrackSys.preview.p1.y, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(TrackSys.preview.p2.x, TrackSys.preview.p2.y, 1.5, 0, Math.PI*2); ctx.fill();
    }

    // Draw Nodes for debugging/snapping context
    ctx.fillStyle = 'red';
    TrackSys.nodes.forEach(n => {
        ctx.beginPath(); ctx.arc(n.pos.x, n.pos.y, 0.5, 0, Math.PI*2); ctx.fill();
    });

    ctx.restore();
    requestAnimationFrame(render);
}

render();
