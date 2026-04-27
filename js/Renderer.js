export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.camera = { x: 0, y: 0, zoom: 10 }; // 10 pixels = 1 meter initially
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.canvas.width / 2) / this.camera.zoom + this.camera.x,
            y: (screenY - this.canvas.height / 2) / this.camera.zoom + this.camera.y
        };
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    beginWorld() {
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
    }

    endWorld() {
        this.ctx.restore();
    }

    drawTrackSegment(start, end, isPreview = false) {
        // Draw track base (Gray)
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.strokeStyle = isPreview ? 'rgba(150, 150, 200, 0.5)' : '#999';
        this.ctx.lineWidth = 3.0; // 3 meters wide base
        this.ctx.lineCap = 'round';
        this.ctx.stroke();

        // Draw Rails (Black, 1.435m standard gauge apart)
        // Math to calculate perpendicular offsets for rails
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if(len === 0) return;
        
        const nx = -dy / len;
        const ny = dx / len;
        const halfGauge = 1.435 / 2;

        this.ctx.beginPath();
        // Left Rail
        this.ctx.moveTo(start.x + nx * halfGauge, start.y + ny * halfGauge);
        this.ctx.lineTo(end.x + nx * halfGauge, end.y + ny * halfGauge);
        // Right Rail
        this.ctx.moveTo(start.x - nx * halfGauge, start.y - ny * halfGauge);
        this.ctx.lineTo(end.x - nx * halfGauge, end.y - ny * halfGauge);
        
        this.ctx.strokeStyle = isPreview ? 'rgba(0, 0, 0, 0.5)' : '#111';
        this.ctx.lineWidth = 0.15; // Rail visual width
        this.ctx.stroke();
    }
}
