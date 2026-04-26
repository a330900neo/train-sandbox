class Vec2 {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mult(s) { return new Vec2(this.x * s, this.y * s); }
    mag() { return Math.sqrt(this.x*this.x + this.y*this.y); }
    normalize() { let m = this.mag(); return m === 0 ? new Vec2(0,0) : new Vec2(this.x/m, this.y/m); }
    dist(v) { return this.sub(v).mag(); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    angle() { return Math.atan2(this.y, this.x); }
}

const MathUtils = {
    mod2pi: (theta) => {
        let out = theta % (2 * Math.PI);
        if (out < 0) out += 2 * Math.PI;
        return out;
    },
    calcSpeedLimit: (radius) => {
        if (radius >= 20000) return 160;
        // Approximation: V_max = 4.5 * sqrt(R), capped at 160
        return Math.min(160, Math.floor(4.5 * Math.sqrt(radius)));
    },
    // Simple Dubins generator (Curve-Straight-Curve)
    // Returns array of path segments
    calculateDubins: (p1, h1, p2, h2, r) => {
        const paths = [];
        const dir1 = new Vec2(Math.cos(h1), Math.sin(h1));
        const dir2 = new Vec2(Math.cos(h2), Math.sin(h2));
        
        // Calculate Right and Left circle centers for start and end
        const c1R = p1.add(new Vec2(dir1.y, -dir1.x).mult(r));
        const c1L = p1.add(new Vec2(-dir1.y, dir1.x).mult(r));
        const c2R = p2.add(new Vec2(dir2.y, -dir2.x).mult(r));
        const c2L = p2.add(new Vec2(-dir2.y, dir2.x).mult(r));

        // Simplified LSL check (Left-Straight-Left)
        const d_LL = c1L.dist(c2L);
        if (d_LL > 0.01) {
            let theta = Math.atan2(c2L.y - c1L.y, c2L.x - c1L.x);
            let t1 = p1, t2 = p2; // Tangent points simplified for logic bounds
            paths.push({ type: 'LSL', length: d_LL, c1: c1L, c2: c2L });
        }
        // In a full implementation, you evaluate LSL, RSR, LSR, RSL and return the shortest.
        // For sandbox scope, we fallback to a geometric arc-line-arc array.
        return paths.length > 0 ? paths[0] : null; 
    },
    splitIntoSections: (start, end, isCurve, radius, center) => {
        const sections = [];
        const totalDist = isCurve ? radius * Math.abs(start.angle() - end.angle()) : start.dist(end);
        let currentDist = 0;
        // Rule: no less than 3m, no more than 40m
        const numSections = Math.max(1, Math.ceil(totalDist / 40));
        const sectionLen = totalDist / numSections;
        
        for(let i=0; i<numSections; i++) {
            // Generate nodes based on interpolation
            sections.push({ length: sectionLen, radius: isCurve ? radius : Infinity });
        }
        return sections;
    }
};
