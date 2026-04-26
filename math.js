class Vector2 {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vector2(this.x * s, this.y * s); }
    mag() { return Math.hypot(this.x, this.y); }
    norm() { const m = this.mag(); return m === 0 ? new Vector2(0,0) : new Vector2(this.x/m, this.y/m); }
    dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    rotate(angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
    }
}

const MathUtils = {
    // Fits an arc passing through p1 and p2, tangent to dir1 at p1.
    fitArc: (p1, dir1, p2) => {
        const chord = p2.sub(p1);
        const dist = chord.mag();
        if (dist < 0.01) return { type: 'straight', length: 0 };
        const chordDir = chord.norm();
        const angle = Math.acos(Math.max(-1, Math.min(1, dir1.dot(chordDir))));
        const cross = dir1.cross(chordDir);
        
        // If angle is extremely small, or radius is massive -> straight
        if (angle < 0.001 || dist / (2 * Math.sin(angle)) > 20000) {
            return { type: 'straight', p1, p2, length: dist };
        }

        const radius = dist / (2 * Math.sin(angle));
        const centerDir = dir1.rotate(cross > 0 ? Math.PI/2 : -Math.PI/2);
        const center = p1.add(centerDir.mul(radius));
        const angleDelta = 2 * angle;
        
        return { type: 'arc', p1, p2, center, radius, length: radius * angleDelta, ccw: cross > 0 };
    },

    // Simplified connection solver for two directed points
    solveConnection: (p1, dir1, p2, dir2, r) => {
        // In a full Dubins, we calculate CSC (Circle-Straight-Circle) or CCC.
        // This is a placeholder for the geometric solver that returns multiple segments.
        // For actual construction, we split into Node & Segment objects.
        const dist = p1.dist(p2);
        if (dist > 20000) return [{type: 'straight', p1, p2}];
        return [MathUtils.fitArc(p1, dir1, p2)]; // Simplified to single arc for basic placement
    },
    
    calcSpeedLimit: (radius) => {
        if (!radius || radius > 20000) return 160;
        // Base formula approximation for max 160kmh
        return Math.min(160, Math.floor(Math.sqrt(radius) * 4.5));
    }
};
