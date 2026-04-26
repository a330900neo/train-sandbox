const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const Camera = {
    x: 0, y: 0, zoom: 10, // 10 pixels per meter visually
    panStart: null
};

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const Render = {
    clear: () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Apply Camera Transform
        ctx.translate(canvas.width / 2 + Camera.x, canvas.height / 2 + Camera.y);
        ctx.scale(Camera.zoom, Camera.zoom);
    },

    drawTrackSegment: (n1, n2, isPreview = false) => {
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y); // Simplified to straight lines for display structure
        
        // Gray base (3.2m train width approximation)
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = isPreview ? 'rgba(150, 150, 150, 0.5)' : '#888';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Rails (Gauge 1435mm = 1.435m)
        ctx.lineWidth = 0.2;
        ctx.strokeStyle = isPreview ? 'rgba(255, 255, 255, 0.5)' : '#eee';
        
        // Math to offset rails parallel to centerline
        let ang = MathUtils.angle(n1, n2);
        let offsetX = Math.cos(ang + Math.PI/2) * (1.435 / 2);
        let offsetY = Math.sin(ang + Math.PI/2) * (1.435 / 2);

        // Rail 1
        ctx.beginPath(); ctx.moveTo(n1.x + offsetX, n1.y + offsetY); ctx.lineTo(n2.x + offsetX, n2.y + offsetY); ctx.stroke();
        // Rail 2
        ctx.beginPath(); ctx.moveTo(n1.x - offsetX, n1.y - offsetY); ctx.lineTo(n2.x - offsetX, n2.y - offsetY); ctx.stroke();
    },

    drawNodes: () => {
        ctx.fillStyle = '#ff0000';
        for (let id in TrackManager.nodes) {
            let n = TrackManager.nodes[id];
            ctx.beginPath();
            ctx.arc(n.x, n.y, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    renderLoop: () => {
        Render.clear();

        // Draw saved tracks
        for (let id in TrackManager.segments) {
            let seg = TrackManager.segments[id];
            Render.drawTrackSegment(TrackManager.nodes[seg.n1], TrackManager.nodes[seg.n2]);
        }

        // Draw preview track if active
        if (AppState.tool === 'build' && AppState.preview.active) {
            Render.drawTrackSegment(AppState.preview.p1, AppState.preview.p2, true);
            
            // Draw draggable points
            ctx.fillStyle = '#00ff00';
            ctx.beginPath(); ctx.arc(AppState.preview.p1.x, AppState.preview.p1.y, 0.8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(AppState.preview.p2.x, AppState.preview.p2.y, 0.8, 0, Math.PI*2); ctx.fill();
        }

        Render.drawNodes();
        requestAnimationFrame(Render.renderLoop);
    }
};
