// Scale: 1 unit = 1 meter
export const GAUGE = 1.435;
export const TRACK_WIDTH = 3.2;
export const STRAIGHT_RADIUS_THRESHOLD = 50000;

// Calculate distance
export function dist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Automatically create curve/straight geometry between a start tangent and end point
export function calculateTrackGeometry(p1, dir1, p2) {
    const d = dist(p1, p2);
    if (d < 0.1) return null; // Too close

    // Vector from p1 to p2
    const v12 = { x: p2.x - p1.x, y: p2.y - p1.y };
    // Tangent vector at p1
    const t1 = { x: Math.cos(dir1), y: Math.sin(dir1) };
    
    // Cross product to find if p2 is left or right of the tangent
    const cross = t1.x * v12.y - t1.y * v12.x;
    
    if (Math.abs(cross) < 0.01) {
        // Points are collinear -> Straight line
        return { type: 'straight', p1, p2, length: d, radius: Infinity };
    }

    // It's an arc. Find circle center.
    // Center lies on the normal to t1 at p1
    const n1 = { x: -t1.y, y: t1.x }; 
    
    // Center also lies on perpendicular bisector of p1-p2
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    
    // Intersection of line (p1 + U*n1) and bisector
    // Simple geometry: radius = (distance^2) / (2 * perpendicular_offset)
    const offset = cross; 
    const radius = Math.abs((d * d) / (2 * offset));

    if (radius > STRAIGHT_RADIUS_THRESHOLD) {
        return { type: 'straight', p1, p2, length: d, radius: Infinity };
    }

    // Center point
    const cx = p1.x + n1.x * (offset > 0 ? radius : -radius);
    const cy = p1.y + n1.y * (offset > 0 ? radius : -radius);

    const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const endAngle = Math.atan2(p2.y - cy, p2.x - cx);
    const ccw = offset > 0;

    let dAngle = endAngle - startAngle;
    if (ccw && dAngle < 0) dAngle += Math.PI * 2;
    if (!ccw && dAngle > 0) dAngle -= Math.PI * 2;

    const length = Math.abs(radius * dAngle);
    const endDir = dir1 + dAngle; // Tangent at end point

    return { type: 'arc', p1, p2, center: { x: cx, y: cy }, radius, startAngle, endAngle, ccw, length, endDir };
}

// Speed limit formula: v = sqrt(R * factor) limited to 350
export function getMaxSpeed(radius) {
    if (radius === Infinity || radius > STRAIGHT_RADIUS_THRESHOLD) return 350;
    // Realistic curve formula approximation for railways
    const speed = Math.sqrt(radius * 12.5); 
    return Math.min(350, Math.round(speed));
}

// Biarc Connection Strategy (Simplified): 
// If snapping to an end point WITH a direction, we would ideally generate an S-curve (Biarc).
// For simplicity in this engine, we generate the arc to the point, and let the user drag handles to smooth it.
