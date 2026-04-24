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

        // Group tracks by height level to ensure proper layering
        const tracksByHeight = {};
        for (let track of state.tracks) {
            const h = track.h || 0;
            if (!tracksByHeight[h]) tracksByHeight[h] = [];
            tracksByHeight[h].push(track);
        }

        const sortedHeights = Object.keys(tracksByHeight).map(Number).sort((a, b) => a - b);

        for (let h of sortedHeights) {
            const levelTracks = tracksByHeight[h];
            
            // PASS 1: Draw ALL track bases for this level (Prevents overlap clipping)
            this.ctx.save();
            this.ctx.beginPath();
            for (let track of levelTracks) {
                track.segments.forEach(seg => this.setupPath(seg));
            }
            this.ctx.strokeStyle = '#666';
            this.ctx.lineWidth = TRACK_WIDTH * this.camera.zoom;
            this.ctx.lineCap = 'butt';
            this.ctx.stroke();
            this.ctx.restore();

            // PASS 2: Draw ALL rails for this level on top of the bases
            this.ctx.save();
            this.ctx.strokeStyle = '#ccc';
            this.ctx.lineWidth = 0.2 * this.camera.zoom;
            this.ctx.lineCap = 'butt';
            
            this.ctx.beginPath();
            for (let track of levelTracks) {
                track.segments.forEach(seg => this.drawOffsetRail(seg, GAUGE / 2));
            }
            this.ctx.stroke();

            this.ctx.beginPath();
            for (let track of levelTracks) {
                track.segments.forEach(seg => this.drawOffsetRail(seg, -GAUGE / 2));
            }
            this.ctx.stroke();
            this.ctx.restore();
        }

        // Draw Preview Track
        if (this.builder.previewTrack && state.currentTool === 'track') {
            this.ctx.globalAlpha = 0.5;
            this.drawSingleTrack(this.builder.previewTrack, true);
            this.ctx.globalAlpha = 1.0;
            this.drawHandles();
        }

        for (let track of state.selection) {
            this.drawHighlight(track);
        }
    }

    // Helper for previews and highlights
    drawSingleTrack(trackData, isPreview) {
        this.ctx.save();
        this.ctx.beginPath();
        trackData.segments.forEach(seg => this.setupPath(seg));
        this.ctx.strokeStyle = isPreview ? '#888' : '#666';
        this.ctx.lineWidth = TRACK_WIDTH * this.camera.zoom;
        this.ctx.stroke();

        this.ctx.strokeStyle = '#ccc';
        this.ctx.lineWidth = 0.2 * this.camera.zoom;
        this.ctx.beginPath(); trackData.segments.forEach(seg => this.drawOffsetRail(seg, GAUGE / 2)); this.ctx.stroke();
        this.ctx.beginPath(); trackData.segments.forEach(seg => this.drawOffsetRail(seg, -GAUGE / 2)); this.ctx.stroke();
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
