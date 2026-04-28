class Builder {
    constructor() {
        this.mode = 'straight';
        this.activePreview = null;
        this.snapDistance = 5;
        this.parallelOffset = 3.5; // Adjustable 3.5m - 4.0m
        this.nodes = []; // Snap points
    }

    getSnapPoint(pos) {
        // 1. Check node snapping (end of tracks)
        for (let node of this.nodes) {
            if (this.dist(pos, node) < this.snapDistance) return node;
        }

        // 2. Check parallel snapping
        // Calculate normal vectors of existing tracks and offset by 3.5m
        return pos;
    }

    updatePreview(mousePos) {
        const snapped = this.getSnapPoint(mousePos);
        // If mode is Dubins, calculate the Arc-Straight-Arc path
        if (this.mode === 'dubins') {
            this.activePreview = this.calculateDubins(this.startPoint, snapped);
        } else {
            this.activePreview = new TrackSegment(this.mode, this.startPoint, snapped);
        }
    }

    calculateDubins(p1, p2) {
        // Dubins 'CSC' Implementation (Circular-Straight-Circular)
        // Returns an array of 3 segments
        let segments = [];
        // Math to calculate tangential points between two circles...
        return segments;
    }

    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

const builder = new Builder();