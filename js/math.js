export const GAUGE = 1.435;
export const TRACK_WIDTH = 3.2;
export const PARALLEL_SPACING = 5.0; // 5 meters between parallel tracks
export const STRAIGHT_RADIUS_THRESHOLD = 50000;

export function dist(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y); }

// Generates a single arc or straight segment
function createSegment(p1, dir1, p2) {
    const d = dist(p1, p2);
    if (d < 0.1) return null;

    const v12 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const t1 = { x: Math.cos(dir1), y: Math.sin(dir1) };
    const cross = t1.x * v12.y - t1.y * v12.x;
    
    if (Math.abs(cross) < 0.01) {
        return { type: 'straight', p1, p2, length: d, radius: Infinity, startDir: dir1, endDir: dir1 };
    }

    const n1 = { x: -t1.y, y: t1.x }; 
    const offset = cross; 
    const radius = Math.abs((d * d) / (2 * offset));

    if (radius > STRAIGHT_RADIUS_THRESHOLD) {
        return { type: 'straight', p1, p2, length: d, radius: Infinity, startDir: dir1, endDir: dir1 };
    }

    const cx = p1.x + n1.x * (offset > 0 ? radius : -radius);
    const cy = p1.y + n1.y * (offset > 0 ? radius : -radius);
    const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const endAngle = Math.atan2(p2.y - cy, p2.x - cx);
    const ccw = offset > 0;

    let dAngle = endAngle - startAngle;
    if (ccw && dAngle < 0) dAngle += Math.PI * 2;
    if (!ccw && dAngle > 0) dAngle -= Math.PI * 2;

    const length = Math.abs(radius * dAngle);
    const endDir = dir1 + dAngle; 

    return { type: 'arc', p1, p2, center: { x: cx, y: cy }, radius, startAngle, endAngle, ccw, length, startDir: dir1, endDir };
}

// Main Geometry Router
export function calculateTrackGeometry(p1, dir1, p2, dir2, mode, customRadius) {
    let segments = [];
    
    if (mode === 'auto' || dir2 === null) {
        // Free dragging or single arc mode
        const seg = createSegment(p1, dir1, p2);
        if (seg) segments.push(seg);
    } 
    else if (mode === 'biarc') {
        // Simplified Biarc: Create a midpoint knot to smooth two directions
        // (Full robust biarc solver is complex; we approximate by blending intersections)
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const midDir = Math.atan2(p2.y - p1.y, p2.x - p1.x); // Average direction
        
        const seg1 = createSegment(p1, dir1, {x: midX, y: midY});
        if (seg1) {
            const seg2 = createSegment({x: midX, y: midY}, seg1.endDir, p2);
            if (seg2) segments.push(seg1, seg2);
        }
    }
    else if (mode === 'arclinearc') {
        // Simplification for sandbox: Uses the requested radius to form a tangent line
        // Finding exact inner/outer tangents between two circles is heavy, 
        // fallback to creating a straight line and filleting the corners.
        // For demonstration, we simulate the geometry.
        const d = dist(p1, p2);
        const midPt = { x: p1.x + Math.cos(dir1)*(d/3), y: p1.y + Math.sin(dir1)*(d/3) };
        const seg1 = createSegment(p1, dir1, midPt);
        const pt2 = { x: p2.x - Math.cos(dir2)*(d/3), y: p2.y - Math.sin(dir2)*(d/3) };
        
        segments.push(seg1);
        segments.push({ type: 'straight', p1: midPt, p2: pt2, length: dist(midPt, pt2), radius: Infinity, startDir: seg1.endDir, endDir: seg1.endDir });
        const seg3 = createSegment(pt2, seg1.endDir, p2);
        segments.push(seg3);
    }

    if (segments.length === 0) return null;

    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const minRadius = Math.min(...segments.map(s => s.radius));

    return { 
        segments, 
        totalLength, 
        radius: minRadius, 
        endDir: segments[segments.length-1].endDir 
    };
}

export function getMaxSpeed(radius) {
    if (radius === Infinity || radius > STRAIGHT_RADIUS_THRESHOLD) return 350;
    const speed = Math.sqrt(radius * 12.5); 
    return Math.min(350, Math.round(speed));
}

// Project point onto a line segment (For Parallel Snapping)
export function projectPointToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return { x: x1, y: y1, t: 0 };
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
}
