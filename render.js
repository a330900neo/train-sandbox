const GAUGE = 1.435; 

function renderLoop() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // Setup Camera view
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(appState.cam.zoom, appState.cam.zoom);
    ctx.translate(appState.cam.x, appState.cam.y);
    
    // Draw Grid (optional, for spatial awareness)
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1 / appState.cam.zoom;
    // ... grid rendering omitted for brevity ...

    // Draw Platforms
    for (const plat of appState.platforms) {
        ctx.strokeStyle = "#95a5a6";
        ctx.lineWidth = plat.width;
        ctx.lineCap = "butt";
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i=0; i<plat.nodes.length; i++) {
            if (i===0) ctx.moveTo(plat.nodes[i].pos.x, plat.nodes[i].pos.y);
            else ctx.lineTo(plat.nodes[i].pos.x, plat.nodes[i].pos.y);
        }
        ctx.stroke();
    }

    // Draw Tracks
    for (const track of appState.tracks) {
        drawTrackVisuals(ctx, track.nodes, appState.selected.includes(track));
    }

    // Draw Preview
    if (appState.preview) {
        ctx.globalAlpha = 0.6;
        drawTrackVisuals(ctx, [{pos: appState.preview.start}, {pos: appState.preview.end}], true);
        ctx.globalAlpha = 1.0;
        
        // Draw drag handles
        ctx.fillStyle = "yellow";
        ctx.beginPath(); ctx.arc(appState.preview.start.x, appState.preview.start.y, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(appState.preview.end.x, appState.preview.end.y, 2, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();
    requestAnimationFrame(renderLoop);
}

function drawTrackVisuals(ctx, nodes, isSelected) {
    if (nodes.length < 2) return;

    // 1. Draw Track Bed (Gray base)
    ctx.strokeStyle = isSelected ? "#f1c40f" : "#7f8c8d";
    ctx.lineWidth = 3.0; // visual width of ballast
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(nodes[0].pos.x, nodes[0].pos.y);
    for (let i = 1; i < nodes.length; i++) ctx.lineTo(nodes[i].pos.x, nodes[i].pos.y);
    ctx.stroke();

    // 2. Draw Rails (1.435m apart)
    // We calculate normals for each segment to offset the rails
    ctx.strokeStyle = "#bdc3c7";
    ctx.lineWidth = 0.2; // rail visual thickness
    
    // Left Rail
    ctx.beginPath();
    for (let i = 0; i < nodes.length - 1; i++) {
        let dir = new Vec2(nodes[i+1].pos.x - nodes[i].pos.x, nodes[i+1].pos.y - nodes[i].pos.y).normalize();
        let normal = new Vec2(-dir.y, dir.x).mult(GAUGE / 2);
        let p1 = new Vec2(nodes[i].pos.x, nodes[i].pos.y).add(normal);
        let p2 = new Vec2(nodes[i+1].pos.x, nodes[i+1].pos.y).add(normal);
        if (i===0) ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Right Rail
    ctx.beginPath();
    for (let i = 0; i < nodes.length - 1; i++) {
        let dir = new Vec2(nodes[i+1].pos.x - nodes[i].pos.x, nodes[i+1].pos.y - nodes[i].pos.y).normalize();
        let normal = new Vec2(dir.y, -dir.x).mult(GAUGE / 2);
        let p1 = new Vec2(nodes[i].pos.x, nodes[i].pos.y).add(normal);
        let p2 = new Vec2(nodes[i+1].pos.x, nodes[i+1].pos.y).add(normal);
        if (i===0) ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
}
