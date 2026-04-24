import { state } from './state.js';
import { dist, calculateTrackGeometry, TRACK_WIDTH } from './math.js';

export class Builder {
    constructor() {
        this.previewTrack = null;
        this.isDraggingHandle = false;
        this.activeHandle = null; // 'start' or 'end'
        this.snapEnabled = true;
        
        // Defaults
        this.startP = { x: 0, y: 0, dir: 0, h: 0 };
        this.endP = { x: 50, y: 50, h: 0 };
    }

    startPreview(worldX, worldY) {
        this.startP = { x: worldX, y: worldY, dir: 0, h: 0 };
        this.endP = { x: worldX + 50, y: worldY + 50, h: 0 };
        this.updatePreview();
    }

    updatePreview() {
        this.previewTrack = calculateTrackGeometry(this.startP, this.startP.dir, this.endP);
        if (this.previewTrack) {
            this.previewTrack.h = this.startP.h; // Flat track for preview
        }
    }

    handlePointerDown(worldPt) {
        // Check handles
        if (this.previewTrack) {
            if (dist(worldPt, this.startP) < 5) {
                this.isDraggingHandle = true;
                this.activeHandle = 'start';
                return true;
            }
            if (dist(worldPt, this.endP) < 5) {
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

        // Snapping Logic
        if (this.snapEnabled) {
            const snapDist = 5;
            for (let track of state.tracks) {
                // Snap to ends
                if (dist(worldPt, track.p1) < snapDist) {
                    target = { ...track.p1 };
                    if (this.activeHandle === 'start') this.startP.dir = track.dir1 || 0; // Inherit direction
                    break;
                }
                if (dist(worldPt, track.p2) < snapDist) {
                    target = { ...track.p2 };
                    if (this.activeHandle === 'start') this.startP.dir = track.endDir || 0;
                    break;
                }
                // Parallel snapping logic (simplified)
                // In a full CAD engine, we project the point onto the track normal here.
            }
        }

        if (this.activeHandle === 'start') {
            this.startP.x = target.x;
            this.startP.y = target.y;
            // Free rotate start dir if not snapped
            if (!this.snapEnabled) {
                this.startP.dir = Math.atan2(this.endP.y - this.startP.y, this.endP.x - this.startP.x);
            }
        } else {
            this.endP.x = target.x;
            this.endP.y = target.y;
        }

        this.updatePreview();
    }

    handlePointerUp() {
        this.isDraggingHandle = false;
        this.activeHandle = null;
    }

    confirm() {
        if (this.previewTrack) {
            // Calculate elevations based on heights (simplified gradient)
            state.tracks.push({ ...this.previewTrack, id: Date.now() });
            
            // Advance start point to old end point for continuous building
            this.startP = { x: this.endP.x, y: this.endP.y, dir: this.previewTrack.endDir || 0, h: this.startP.h };
            this.endP = { x: this.startP.x + 50, y: this.startP.y + 50, h: this.startP.h };
            this.updatePreview();
        }
    }

    cancel() {
        this.previewTrack = null;
    }
}
