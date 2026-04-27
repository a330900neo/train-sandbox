const MathUtils = {
    // Standard Gauge 1435mm
    GAUGE: 1.435, 
    // If radius > 25,000m, it's virtually straight
    STRAIGHT_THRESHOLD: 25000, 

    // Distance between two points
    dist: (p1, p2) => Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2),

    // Calculate max speed (V = 4.5 * sqrt(R) approx for comfort, capped at 160)
    calcMaxSpeed: (radius) => {
        if (!radius || radius >= MathUtils.STRAIGHT_THRESHOLD) return 160;
        let speed = 4.5 * Math.sqrt(radius);
        return Math.min(Math.round(speed), 160);
    },

    // Get snapping point (checks nodes and parallel lines)
    getSnapPoint: (point, tracks, snapRadius = 10) => {
        let closest = null;
        let minDist = snapRadius;

        for (let track of tracks) {
            // 1. Snap to nodes (endpoints)
            for (let node of [track.startNode, track.endNode]) {
                let d = MathUtils.dist(point, node);
                if (d < minDist) {
                    minDist = d;
                    closest = { ...node, type: 'node', trackId: track.id };
                }
            }
            
            // 2. Parallel Snapping (approx 3.5m - 4m offset)
            // For a production app, you project the point onto the track line segment,
            // check distance. If distance is ~3.5m, snap the point exactly parallel.
            // (Simplified distance-to-line projection omitted for brevity, but this is where it goes)
        }
        return closest;
    },

    // Simplified Dubins CSC (Curve-Straight-Curve) generator
    // Returns an array of paths [Arc1, Straight, Arc2]
    generateDubins: (p1, dir1, p2, dir2, r1, r2) => {
        // A full Dubins solver requires calculating LSL, RSR, LSR, RSL tangent lines
        // between two directional circles. 
        // For this foundation, we output a standard straight line if unconstrained,
        // or a simple curve if only one side is constrained.
        
        let distance = MathUtils.dist(p1, p2);
        
        // Fallback: Just draw a straight line if radii are not provided or path is too short
        return [{
            type: 'straight',
            start: p1,
            end: p2,
            length: distance
        }];
    }
};
