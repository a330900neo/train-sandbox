class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pan = new Vec2(0, 0);
        this.scale = 10; // pixels per meter
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    screenToWorld(x, y) {
        return new Vec2(
            (x - this.canvas.width / 2) / this.scale - this.pan.x,
            (y - this.canvas.height / 2) / this.scale - this.pan.y
        );
    }

    worldToScreen(p) {
        return new Vec2(
            (p.x + this.pan.x) * this.scale + this.canvas.width / 2,
            (p.y + this.pan.y) * this.scale + this.canvas.height / 2
        );
    }

    clear() {
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
    }

    drawGrid() {
        this.ctx.strokeStyle = '#cccccc';
        this.ctx.lineWidth = 1;

        let gridSize = 10; // 10 meters
        let startX = Math.floor(this.screenToWorld(0, 0).x / gridSize) * gridSize;
        let startY = Math.floor(this.screenToWorld(0, 0).y / gridSize) * gridSize;
        let endX = this.screenToWorld(this.canvas.width, 0).x;
        let endY = this.screenToWorld(0, this.canvas.height).y;

        this.ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            let px = this.worldToScreen(new Vec2(x, 0)).x;
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.canvas.height);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            let py = this.worldToScreen(new Vec2(0, y)).y;
            this.ctx.moveTo(0, py);
            this.ctx.lineTo(this.canvas.width, py);
        }
        this.ctx.stroke();
    }

    render(tracks, previewTrack, buildState) {
        this.clear();

        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.translate(this.pan.x, this.pan.y);

        // Group tracks by layer
        let layers = {};
        tracks.forEach(t => {
            let l = Math.min(t.layerStart, t.layerEnd);
            if (!layers[l]) layers[l] = [];
            layers[l].push(t);
        });

        let sortedLayers = Object.keys(layers).map(Number).sort((a, b) => a - b);

        sortedLayers.forEach(l => {
            // Draw bases first
            layers[l].forEach(t => t.drawBase(this.ctx));
            // Draw rails on top
            layers[l].forEach(t => t.drawRails(this.ctx));
        });

        // Draw preview track
        if (previewTrack) {
            this.ctx.globalAlpha = 0.6;
            previewTrack.drawBase(this.ctx);
            previewTrack.drawRails(this.ctx);
            this.ctx.globalAlpha = 1.0;
        }

        this.ctx.restore();

        // Draw UI overlays (Handles)
        if (buildState.mode === 'preview') {
            this.drawHandle(buildState.p1, '#00ff00');
            this.drawHandle(buildState.p2, '#ff0000');
        }
    }

    drawHandle(p, color) {
        let sp = this.worldToScreen(p);
        this.ctx.beginPath();
        this.ctx.arc(sp.x, sp.y, 15, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = 0.5;
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#fff';
        this.ctx.stroke();
    }
}