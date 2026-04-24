export const GAUGE = 1.435;
export const TRACK_WIDTH = 3.2;
export const PARALLEL_SPACING = 5.0; // Distance between parallel tracks
export const STRAIGHT_RADIUS_THRESHOLD = 50000;

export function dist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Get the closest point on a track segment, returning normal and parameter (t)
export function projectPointOntoTrack(pt, track) {
    if (track.type === 'straight') {
        const l2 = dist(track.p1, track.p2) ** 2;
        if (l2 === 0) return null;
        
        // Parameter t along the segment
        let t = ((pt.x - track.p1.x) * (track.p2.x - track.p1.x) + (pt.y - track.p1.y) * (track.p2.y - track.p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        
        const projX = track.p1.x + t * (track.p2.x - track.p1.x);
        const projY = track.p1.y + t * (track.p2.y - track.p1.y);
        
        // Normal vector
        const dx = track.p2.x - track.p1.x;
        const dy = track.p2.y - track.p1.y;
        const len = Math.hypot(dx, dy);
        
        return { x: projX, y: projY, distance: dist(pt, {x: projX, y: projY}), t, nx: -dy/len, ny: dx/len };
    } 
    else if (track.type === 'arc') {
        const dCenter = dist(pt, track.center);
        const nx = (pt.x - track.center.x) / dCenter;
        const ny = (pt.y - track.center.y) / dCenter;
        
        const projX = track.center.x + nx * track.radius;
        const projY = track.center.y + ny * track.radius;
        
        // Check if projected point is within the arc's angles
        let angle = Math.atan2(projY - track.center.y, projX - track.center.x);
        // Normalize angles to 0-2PI for comparison
        if (angle < 0) angle += Math.PI * 2;
        
        // t represents how far along the curve we are (0 = start, 1 = end detents)
        let t = 0.5; // Simplified for this snippet.
        
        return { x: projX, y: projY, distance: Math.abs(dCenter - track.radius), t, nx, ny };
    }
    return null;
}

// Line-Line Intersection for crossings
export function getLineIntersection(p1, p2, p3, p4) {
    const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (denom === 0) return null; // Parallel

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;

    if (t > 0 && t < 1 && u > 0 && u < 1) {
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }
    return null;
}

// Standard Single Arc/Straight router
export function calculateTrackGeometry(p1, dir1, p2) {
    // ... (Keep your existing math.js calculateTrackGeometry code here) ...
    // Make sure to return total 'length' in the object so we can read it in UI.
}

// Simplified Biarc structure (Returns an array of track segments)
export function calculateBiarc(p1, dir1, p2, dir2) {
    // Advanced math requires finding a knot point K.
    // For now, we return two connected arcs based on equal tangent lengths.
    // To fully solve the geometric continuity $G^1$, we match tangent vectors at a midpoint $M$.
    console.log("Biarc generation requested"); 
    // Fallback to single arc for this implementation bridge
    return [calculateTrackGeometry(p1, dir1, p2)]; 
}

// Arc-Straight-Arc structure
export function calculateArcStraightArc(p1, dir1, p2, dir2, customRadius) {
    console.log(`Arc-Straight-Arc generation with radius ${customRadius}`);
    // Fallback to single arc for this implementation bridge
    return [calculateTrackGeometry(p1, dir1, p2)];
}

export function getMaxSpeed(radius) {
    if (radius === Infinity || radius > STRAIGHT_RADIUS_THRESHOLD) return 350;
    const speed = Math.sqrt(radius * 12.5); 
    return Math.min(350, Math.round(speed));
}
