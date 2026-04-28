import { dist } from './math.js';

export class TrackManager {
    constructor() {
        this.tracks = [];
        this.nodes =[];
    }

    addTrack(segments, props = {}) {
        let track = {
            id: Date.now() + Math.random(),
            segments,
            layerStart: props.layerStart || 1,
            layerEnd: props.layerEnd || 1,
            speedLimit: props.speedLimit || 160,
            platform: props.platform || 'none',
            platformWidth: props.platformWidth || 4,
            turnback: props.turnback || false,
            oneWay: props.oneWay || false
        };
        this.tracks.push(track);
        this.updateNodes();
        return track;
    }

    deleteTrack(id) {
        this.tracks = this.tracks.filter(t => t.id !== id);
        this.updateNodes();
    }

    updateNodes() {
        this.nodes =[];
        for (let t of this.tracks) {
            let first = t.segments[0];
            let last = t.segments[t.segments.length - 1];
            
            let d1 = { x: first.p2.x - first.p1.x, y: first.p2.y - first.p1.y };
            if (first.type === 'arc') {
                let a = first.startAngle + (first.ccw ? -Math.PI/2 : Math.PI/2);
                d1 = { x: Math.cos(a), y: Math.sin(a) };
            }
            
            let d2 = { x: last.p2.x - last.p1.x, y: last.p2.y - last.p1.y };
            if (last.type === 'arc') {
                let a = last.endAngle + (last.ccw ? -Math.PI/2 : Math.PI/2);
                d2 = { x: Math.cos(a), y: Math.sin(a) };
            }

            this.nodes.push({ p: first.p1, dir: d1, trackId: t.id });
            this.nodes.push({ p: last.p2, dir: d2, trackId: t.id });
        }
    }

    draw(ctx, camera) {
        let layers = {};
        for (let t of this.tracks) {
            let l = Math.max(t.layerStart, t.layerEnd);
            if (!layers[l]) layers[l] = [];
            layers[l].push(t);
        }

        let sortedLayers = Object.keys(layers).sort((a,b) => a-b);
        
        for (let l of sortedLayers) {
            // Draw Platforms
            for (let t of layers[l]) {
                if (t.platform !== 'none') this.drawTrackPath(ctx, t, camera, 'platform');
            }
            // Draw Bases
            for (let t of layers[l]) {
                this.drawTrackPath(ctx, t, camera, 'base');
            }
            // Draw Rails
            for (let t of layers[l]) {
                this.drawTrackPath(ctx, t, camera, 'rail');
            }
        }
    }

    drawTrackPath(ctx, track, camera, pass) {
        for (let seg of track.segments) {
            if (pass === 'base') {
                ctx.lineWidth = 3.0 * camera.zoom;
                ctx.strokeStyle = '#888';
                this.traceSegment(ctx, seg, camera, 0);
                ctx.stroke();
            } else if (pass === 'rail') {
                ctx.lineWidth = 0.4 * camera.zoom;
                ctx.strokeStyle = '#000';
                this.traceSegment(ctx, seg, camera, 0.7175);
                ctx.stroke();
                this.traceSegment(ctx, seg, camera, -0.7175);
                ctx.stroke();
            } else if (pass === 'platform') {
                ctx.lineWidth = track.platformWidth * camera.zoom;
                ctx.strokeStyle = 'rgba(200, 150, 100, 0.8)';
                let offset = 1.5 + track.platformWidth / 2;
                if (track.platform === 'left' || track.platform === 'both') {
                    this.traceSegment(ctx, seg, camera, -offset);
                    ctx.stroke();
                }
                if (track.platform === 'right' || track.platform === 'both') {
                    this.traceSegment(ctx, seg, camera, offset);
                    ctx.stroke();
                }
            }
        }
    }

    traceSegment(ctx, seg, camera, offset) {
        ctx.beginPath();
        if (seg.type === 'straight') {
            let dx = seg.p2.x - seg.p1.x, dy = seg.p2.y - seg.p1.y;
            let len = Math.hypot(dx, dy);
            let nx = -dy/len * offset, ny = dx/len * offset;
            
            let sx = (seg.p1.x + nx - camera.x) * camera.zoom + ctx.canvas.width/2;
            let sy = (seg.p1.y + ny - camera.y) * camera.zoom + ctx.canvas.height/2;
            let ex = (seg.p2.x + nx - camera.x) * camera.zoom + ctx.canvas.width/2;
            let ey = (seg.p2.y + ny - camera.y) * camera.zoom + ctx.canvas.height/2;
            
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
        } else {
            let r = seg.radius + (seg.ccw ? offset : -offset);
            let cx = (seg.center.x - camera.x) * camera.zoom + ctx.canvas.width/2;
            let cy = (seg.center.y - camera.y) * camera.zoom + ctx.canvas.height/2;
            ctx.arc(cx, cy, r * camera.zoom, seg.startAngle, seg.endAngle, seg.ccw);
        }
    }
}