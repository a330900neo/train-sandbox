// Math and Geometry Utilities
const MathUtils = {
    distance2D: (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y),
    angle: (p1, p2) => Math.atan2(p2.y - p1.y, p2.x - p1.x),
    normalizeAngle: (a) => (a + Math.PI * 2) % (Math.PI * 2),
    
    // Calculates max speed based on radius (Metro style, max 160km/h)
    // Formula approximation based on standard cant and deficiency
    calcSpeedLimit: (radius) => {
        if (radius >= 20000 || radius === Infinity) return 160;
        let v = Math.sqrt(radius) * 3.6; // simplified curve velocity factor
        return Math.min(160, Math.max(10, Math.round(v)));
    },

    // Generates simple Arc data from 3 points or tangents
    createArcFromTangents: (p1, t1, p2) => {
        // Simplified arc generator for single curves.
        // In a full implementation, this calculates circle centers via tangent intersections.
        let dist = MathUtils.distance2D(p1, p2);
        let ang = MathUtils.angle(p1, p2);
        // Fallback for very straight lines
        if (Math.abs(t1 - ang) < 0.05) return { type: 'straight', radius: Infinity };
        
        let radius = dist / (2 * Math.sin(Math.abs(t1 - ang)));
        if (radius > 20000) return { type: 'straight', radius: Infinity };
        
        return { type: 'curve', radius: radius, startAngle: t1, endAngle: ang };
    },

    // Simplified Dubins Path calculator (CSC - Curve, Straight, Curve)
    // Connects two directed points A(x,y,θ) and B(x,y,θ) with a given minimum radius
    calculateDubins: (start, end, radius, dirStart = 1, dirEnd = 1) => {
        // NOTE: Exact Dubins requires LSL, RSR, RSL, LSR analysis. 
        // Returning a structured mock path object for the sandbox to process.
        return {
            segments: [
                { type: 'curve', radius: radius, len: 15, dir: dirStart },
                { type: 'straight', radius: Infinity, len: MathUtils.distance2D(start, end) * 0.5 },
                { type: 'curve', radius: radius, len: 15, dir: dirEnd }
            ]
        };
    },

    // Helper to find nearest point on a line segment
    closestPointOnSegment: (p, a, b) => {
        let atob = { x: b.x - a.x, y: b.y - a.y };
        let atop = { x: p.x - a.x, y: p.y - a.y };
        let len = atob.x*atob.x + atob.y*atob.y;
        let dot = atop.x*atob.x + atop.y*atob.y;
        let t = Math.min(1, Math.max(0, dot / len));
        return { x: a.x + atob.x * t, y: a.y + atob.y * t };
    }
};
