// Inside js/math.js -> calculateTrackGeometry

export function calculateTrackGeometry(p1, dir1, p2, dir2, mode, customRadius) {
    let segments = [];
    
    // Auto defaults to single arc / straight
    if (mode === 'auto' || dir2 === null) {
        const seg = createSegment(p1, dir1, p2);
        if (seg) segments.push(seg);
    } 
    // Biarc Approximation (Two Arcs forming an S-Curve)
    else if (mode === 'biarc') {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        
        const seg1 = createSegment(p1, dir1, {x: midX, y: midY});
        if (seg1) {
            // Force the second segment to start exactly where seg1 ends, using seg1's ending tangent
            const seg2 = createSegment({x: midX, y: midY}, seg1.endDir, p2);
            if (seg2) segments.push(seg1, seg2);
        }
    }
    // Arc-Line-Arc (Using customRadius from the UI)
    else if (mode === 'arclinearc') {
        const d = dist(p1, p2);
        
        // Calculate dynamic intersection bounds based on customRadius
        // This spreads the arc out smoothly.
        const offsetDist = Math.min(d * 0.4, customRadius * 0.5); 
        
        const midPt1 = { x: p1.x + Math.cos(dir1) * offsetDist, y: p1.y + Math.sin(dir1) * offsetDist };
        const midPt2 = { x: p2.x - Math.cos(dir2) * offsetDist, y: p2.y - Math.sin(dir2) * offsetDist };
        
        const seg1 = createSegment(p1, dir1, midPt1);
        if (seg1) {
            segments.push(seg1);
            segments.push({ 
                type: 'straight', 
                p1: midPt1, 
                p2: midPt2, 
                length: dist(midPt1, midPt2), 
                radius: Infinity, 
                startDir: seg1.endDir, 
                endDir: seg1.endDir 
            });
            const seg3 = createSegment(midPt2, seg1.endDir, p2);
            if (seg3) segments.push(seg3);
        }
    }

    if (segments.length === 0) return null;

    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const minRadius = Math.min(...segments.map(s => s.radius));

    return { segments, totalLength, radius: minRadius, endDir: segments[segments.length-1].endDir };
}
