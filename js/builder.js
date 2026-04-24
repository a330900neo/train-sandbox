import { state } from './state.js';
import { 
    dist, calculateTrackGeometry, calculateBiarc, calculateArcStraightArc, 
    projectPointOntoTrack, getLineIntersection, PARALLEL_SPACING 
} from './math.js';

export class Builder {
    constructor() {
        this.previewTracks = []; // Now an array to support multi-segment modes (Biarc)
        this.isDraggingHandle = false;
        this.activeHandle = null;
        this.snapEnabled = true;
        this.routeMode = 'auto'; // auto, biarc, asa
        this.customRadius = 500;
        
        this.startP = { x: 0, y: 0, dir: 0, h: 0 };
        this.endP = { x: 50, y: 50, dir: Math.PI, h: 0 }; // End now has a direction for Biarcs
    }

    startPreview(worldX, worldY) {
        this.startP = { x: worldX, y: worldY, dir: 0, h: 0 };
        this.endP = { x: worldX + 50, y: worldY + 50, dir: Math.PI, h: 0 };
        this.updatePreview();
    }

    updatePreview() {
        if (this.routeMode === 'biarc') {
            this.previewTracks = calculateBiarc(this.startP, this.startP.dir, this.endP, this.endP.dir);
        } else if (this.routeMode === 'asa') {
            this.previewTracks = calculateArcStraightArc(this.startP, this.startP.dir, this.endP, this.endP.dir, this.customRadius);
        } else {
            const single = calculateTrackGeometry(this.startP, this.startP.dir, this.endP);
            this.previewTracks = single ? [single] : [];
        }
    }

    handlePointerMove(worldPt) {
        if (!this.isDraggingHandle) return;

        let target = worldPt;
        let snappedDir = null;

        if (this.snapEnabled) {
            const snapDist = 10;
            let bestSnapDistance = snapDist;

            for (let track of state.tracks) {
                // 1. Snap to Endpoints (Start/Merge)
                if (dist(worldPt, track.p1) < bestSnapDistance) {
                    target = { ...track.p1 };
                    snappedDir = track.dir1 || 0;
                    bestSnapDistance = dist(worldPt, track.p1);
                }
                if (dist(worldPt, track.p2) < bestSnapDistance) {
                    target = { ...track.p2 };
                    snappedDir = track.endDir || 0;
                    bestSnapDistance = dist(worldPt, track.p2);
                }

                // 2. Parallel Track Snapping & Curve Detents
                const proj = projectPointOntoTrack(worldPt, track);
                if (proj && proj.distance > 0) {
                    // Check if we are near a multiple of parallel spacing (e.g., 5m)
                    const offsetIndex = Math.round(proj.distance / PARALLEL_SPACING);
                    const idealDist = offsetIndex * PARALLEL_SPACING;
                    
                    if (Math.abs(proj.distance - idealDist) < snapDist / 2 && offsetIndex > 0) {
                        // We are in parallel snap range!
                        target = {
                            x: proj.x + proj.nx * idealDist * Math.sign(worldPt.x - proj.x),
                            y: proj.y + proj.ny * idealDist * Math.sign(worldPt.y - proj.y)
                        };
                        
                        // Detent: If near start/end of curve (t=0 or t=1)
                        if (proj.t < 0.05 || proj.t > 0.95) {
                            // Lock exactly to the curve change
                            // (Implementation requires strict normal alignment from the exact endpoint)
                        }
                    }
                }
            }

            // 3. Snap to Intersections (Crossings)
            for (let i = 0; i < state.tracks.length; i++) {
                for (let j = i + 1; j < state.tracks.length; j++) {
                    const t1 = state.tracks[i];
                    const t2 = state.tracks[j];
                    if (t1.type === 'straight' && t2.type === 'straight') {
                        const intersect = getLineIntersection(t1.p1, t1.p2, t2.p1, t2.p2);
                        if (intersect && dist(worldPt, intersect) < snapDist) {
                            target = intersect;
                        }
                    }
                }
            }
        }

        // Apply snapping to active handle
        if (this.activeHandle === 'start') {
            this.startP.x = target.x;
            this.startP.y = target.y;
            if (snappedDir !== null) this.startP.dir = snappedDir;
            else if (!this.snapEnabled) this.startP.dir = Math.atan2(this.endP.y - this.startP.y, this.endP.x - this.startP.x);
        } else {
            this.endP.x = target.x;
            this.endP.y = target.y;
            if (snappedDir !== null) this.endP.dir = snappedDir;
        }

        this.updatePreview();
    }

    confirm() {
        if (this.previewTracks.length > 0) {
            this.previewTracks.forEach(t => {
                state.tracks.push({ ...t, h: this.startP.h, id: Date.now() + Math.random() });
            });
            const lastTrack = this.previewTracks[this.previewTracks.length - 1];
            this.startP = { x: this.endP.x, y: this.endP.y, dir: lastTrack.endDir || 0, h: this.startP.h };
            this.endP = { x: this.startP.x + 50, y: this.startP.y + 50, dir: lastTrack.endDir || 0, h: this.startP.h };
            this.updatePreview();
        }
    }
}
