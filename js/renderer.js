import { state } from './state.js';
import { GAUGE, TRACK_WIDTH } from './math.js';

export class Renderer {
    constructor(canvas, camera, builder) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.camera = camera;
        this.builder = builder;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const sortedTracks = [...state.tracks].sort((a, b) => a.h - b.h);

        for (let track of sortedTracks) {
            this.drawTrack(track, false);
        }

        if (this.builder.previewTrack && state.currentTool === 'track') {
            this.ctx.globalAlpha = 0.5;
            this.drawTrack(this.builder.previewTrack, true);
            this.ctx.globalAlpha = 1.0;
            this.drawHandles();
        }

        for (let track of state.selection) {
            this.drawHighlight(track);
        }

        // Optional: Draw intersection nodes for debugging/visibility
        if (state.currentTool === 'track' && this.builder.snapEnabled) {
            this.ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
            for (let pt of state.intersections) {
                const sp = this.camera.worldToScreen(pt.x, pt.y);
                this.ctx.beginPath(); this.ctx.arc(sp.x, sp.y, 4, 0, Math.PI*2); this.ctx.fill();
            }
        }
    }

    drawTrack(trackData, isPreview) {
        this.ctx.save();
        
        // 1. Gray Base (Iterate through segments)
        this.ctx.beginPath();
        trackData.segments.forEach(seg => this.setupPath(seg));
        this.ctx.strokeStyle = isPreview ? '#888' : '#666';
        this.ctx.lineWidth = TRACK_WIDTH * this.camera.zoom;
        this.ctx.lineCap = 'butt';
        this.ctx.stroke();

        // 2. Rails
        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 0.2 * this.camera.zoom;
        
        this.ctx.beginPath();
        trackData.segments.forEach(seg => this.drawOffsetRail(seg, GAUGE / 2));
        this.ctx.stroke();

        this.ctx.beginPath();
        trackData.segments.forEach(seg => this.drawOffsetRail(seg, -GAUGE / 2));
        this.ctx.stroke();

        this.ctx.restore();
    }

    setupPath(geom) {
        const p1 = this.camera.worldToScreen(geom.p1.x, geom.p1.y);
        if (geom.type === 'straight') {
            const p2 = this.camera.worldToScreen(geom.p2.x, geom.p2.y);
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
        } else if (geom.type === 'arc') {
            const c = this.camera.worldToScreen(geom.center.x, geom.center.y);
            this.ctx.arc(c.x, c.y, geom.radius * this.camera.zoom, geom.startAngle, geom.endAngle, !geom.ccw);
        }
    }

    drawOffsetRail(geom, offset) {
        if (geom.type === 'straight') {
            const angle = Math.atan2(geom.p2.y - geom.p1.y, geom.p2.x - geom.p1.x);
            const nx = -Math.sin(angle) * offset;
            const ny = Math.cos(angle) * offset;
            const p1 = this.camera.worldToScreen(geom.p1.x + nx, geom.p1.y + ny);
            const p2 = this.camera.worldToScreen(geom.p2.x + nx, geom.p2.y + ny);
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
        } else if (geom.type === 'arc') {
            const c = this.camera.worldToScreen(geom.center.x, geom.center.y);
            const railRadius = geom.radius + (geom.ccw ? -offset : offset);
            this.ctx.arc(c.x, c.y, railRadius * this.camera.zoom, geom.startAngle, geom.endAngle, !geom.ccw);
        }
    }

    drawHandles() {
        const { startP, endP } = this.builder;
        const s = this.camera.worldToScreen(startP.x, startP.y);
        const e = this.camera.worldToScreen(endP.x, endP.y);

        this.ctx.fillStyle = '#4CAF50';
        this.ctx.beginPath(); this.ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); this.ctx.fill();
        
        this.ctx.fillStyle = '#f44336';
        this.ctx.beginPath(); this.ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); this.ctx.fill();
    }

    drawHighlight(trackData) {
        this.ctx.save();
        this.ctx.beginPath();
        trackData.segments.forEach(seg => this.setupPath(seg));
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        this.ctx.lineWidth = (TRACK_WIDTH + 1) * this.camera.zoom;
        this.ctx.stroke();
        this.ctx.restore();
    }
}
