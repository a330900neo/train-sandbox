import { state } from './state.js';
import { dist, calculateTrackGeometry, PARALLEL_SPACING, projectPointToSegment, projectPointToArc } from './math.js';

export class Builder {
    constructor() {
        this.previewTrack = null;
        this.isDraggingHandle = false;
        this.activeHandle = null;
        this.snapEnabled = true;
        this.mode = 'auto';
        this.customRadius = 500;
        
        this.startP = { x: 0, y: 0, dir: 0, h: 0 };
        this.endP = { x: 50, y: 50, dir: null, h: 0 };
    }

    startPreview(worldX, worldY) {
        this.startP = { x: worldX, y: worldY, dir: 0, h: 0 };
        this.endP = { x: worldX + 50, y: worldY + 50, dir: null, h: 0 };
        this.updatePreview();
    }

    updatePreview() {
        this.previewTrack = calculateTrackGeometry(
            this.startP, this.startP.dir, 
            this.endP, this.endP.dir, 
            this.mode, this.customRadius
        );
        if (this.previewTrack) this.previewTrack.h = this.startP.h;
    }

    handlePointerDown(worldPt) {
        if (this.previewTrack) {
            if (dist(worldPt, this.startP) < 10) {
                this.isDraggingHandle = true;
                this.activeHandle = 'start';
                return true;
            }
            if (dist(worldPt, this.endP) < 10) {
                this.isDraggingHandle = true;
                this.activeHandle = 'end';
                return true;
            }
        }
        return false;
    }

    handlePointerMove(worldPt) {
        if (!this.isDraggingHandle) return;

        let target = worldPt;
        let snappedDir = null;

        if (this.snapEnabled) {
            // REDUCED SNAP DISTANCE so parallel dragging is easier
            const snapDist = 1.5; 
            let snapped = false;

            // 1. Snap to Start/End points
            for (let track of state.tracks) {
                const first = track.segments[0];
                const last = track.segments[track.segments.length - 1];

                if (dist(worldPt, first.p1) < snapDist) {
                    target = { ...first.p1 }; snappedDir = first.startDir; snapped = true; break;
                }
                if (dist(worldPt, last.p2) < snapDist) {
                    target = { ...last.p2 }; snappedDir = last.endDir; snapped = true; break;
                }
            }

            // 2. Snap to Intersections
            if (!snapped && state.intersections) {
                for (let pt of state.intersections) {
                    if (dist(worldPt, pt) < snapDist) {
                        target = { ...pt }; snapped = true; break;
                    }
                }
            }

            // 3. Parallel Tracking & Curve Detents
            if (!snapped) {
                for (let track of state.tracks) {
                    for (let seg of track.segments) {
                        if (seg.type === 'straight') {
                            const proj = projectPointToSegment(worldPt.x, worldPt.y, seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y);
                            const d = dist(worldPt, proj);
                            
                            if (Math.abs(d - PARALLEL_SPACING) < 2) {
                                const angle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x);
                                // Figure out which side the mouse is on
                                const side = ((worldPt.x - seg.p1.x) * (seg.p2.y - seg.p1.y) - (worldPt.y - seg.p1.y) * (seg.p2.x - seg.p1.x)) > 0 ? 1 : -1;
                                
                                const nx = Math.sin(angle) * side;
                                const ny = -Math.cos(angle) * side;
                                
                                // Detents for start and end of straight segment
                                if (proj.t < 0.05) { target = { x: seg.p1.x + nx*PARALLEL_SPACING, y: seg.p1.y + ny*PARALLEL_SPACING }; }
                                else if (proj.t > 0.95) { target = { x: seg.p2.x + nx*PARALLEL_SPACING, y: seg.p2.y + ny*PARALLEL_SPACING }; }
                                else { target = { x: proj.x + nx*PARALLEL_SPACING, y: proj.y + ny*PARALLEL_SPACING }; }
                                
                                snappedDir = angle; snapped = true; break;
                            }
                        } else if (seg.type === 'arc') {
                            const proj = projectPointToArc(worldPt.x, worldPt.y, seg.center, seg.radius);
                            const distToRail = Math.abs(proj.distFromCenter - seg.radius);

                            if (Math.abs(distToRail - PARALLEL_SPACING) < 2) {
                                // Snap to the inner or outer parallel arc
                                const isOuter = proj.distFromCenter > seg.radius;
                                const parRadius = seg.radius + (isOuter ? PARALLEL_SPACING : -PARALLEL_SPACING);
                                
                                target = { 
                                    x: seg.center.x + Math.cos(proj.angle) * parRadius, 
                                    y: seg.center.y + Math.sin(proj.angle) * parRadius 
                                };
                                
                                // Tangent direction for arc
                                snappedDir = proj.angle + (seg.ccw ? Math.PI/2 : -Math.PI/2);
                                snapped = true; break;
                            }
                        }
                    }
                    if(snapped) break;
                }
            }
        }

        if (this.activeHandle === 'start') {
            this.startP.x = target.x;
            this.startP.y = target.y;
            if (snappedDir !== null) this.startP.dir = snappedDir;
            else if (!this.snapEnabled) this.startP.dir = Math.atan2(this.endP.y - this.startP.y, this.endP.x - this.startP.x);
        } else {
            this.endP.x = target.x;
            this.endP.y = target.y;
            this.endP.dir = snappedDir;
        }

        this.updatePreview();
    }

    handlePointerUp() {
        this.isDraggingHandle = false;
        this.activeHandle = null;
    }

    confirm() {
        if (this.previewTrack) {
            state.tracks.push({ ...this.previewTrack, id: Date.now() });
            state.computeIntersections();
            
            this.startP = { x: this.endP.x, y: this.endP.y, dir: this.previewTrack.endDir || 0, h: this.startP.h };
            this.endP = { x: this.startP.x + 50, y: this.startP.y + 50, dir: null, h: this.startP.h };
            this.updatePreview();
        }
    }

    cancel() { this.previewTrack = null; }
}
