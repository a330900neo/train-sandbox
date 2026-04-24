// Inside js/math.js -> calculateTrackGeometry

// Add this new helper function right above calculateTrackGeometry in math.js
function solveArcLineArc(p1, dir1, p2, dir2, R) {
    const results = [];
    const signs = [1, -1]; 

    for (let s1 of signs) {
        for (let s2 of signs) {
            // Calculate Circle Centers for Start and End points
            const n1 = { x: -Math.sin(dir1) * s1, y: Math.cos(dir1) * s1 };
            const c1 = { x: p1.x + R * n1.x, y: p1.y + R * n1.y };

            const n2 = { x: -Math.sin(dir2) * s2, y: Math.cos(dir2) * s2 };
            const c2 = { x: p2.x + R * n2.x, y: p2.y + R * n2.y };

            const dx = c2.x - c1.x;
            const dy = c2.y - c1.y;
            const d = Math.hypot(dx, dy);
            const phi = Math.atan2(dy, dx);

            let t1, t2;

            if (s1 === s2) { 
                // Outer Tangent (C-Curves)
                const nx = -Math.sin(phi) * s1;
                const ny = Math.cos(phi) * s1;
                t1 = { x: c1.x + R * nx, y: c1.y + R * ny };
                t2 = { x: c2.x + R * nx, y: c2.y + R * ny };
            } else { 
                // Inner Tangent (S-Curves)
                if (d < 2 * R) continue; // Circles intersect, no inner tangent possible
                const beta = Math.acos(2 * R / d);
                const theta = phi - s1 * beta;
                const nx = Math.cos(theta);
                const ny = Math.sin(theta);
                t1 = { x: c1.x + R * nx, y: c1.y + R * ny };
                t2 = { x: c2.x - R * nx, y: c2.y - R * ny };
            }

            const seg1 = createSegment(p1, dir1, t1);
            if (!seg1 || seg1.length > Math.PI * R * 1.5) continue; // Reject looping arcs

            const seg2Dir = Math.atan2(t2.y - t1.y, t2.x - t1.x);
            const seg2 = { type: 'straight', p1: t1, p2: t2, length: dist(t1, t2), radius: Infinity, startDir: seg2Dir, endDir: seg2Dir };
            
            const seg3 = createSegment(t2, seg2.endDir, p2);
            if (!seg3 || seg3.length > Math.PI * R * 1.5) continue; 

            const totalLen = seg1.length + seg2.length + seg3.length;
            results.push({ segments: [seg1, seg2, seg3], len: totalLen, R: R });
        }
    }

    if (results.length > 0) {
        results.sort((a, b) => a.len - b.len); // Pick the shortest, most natural path
        return results[0].segments;
    }
    return null;
}

// Replace your existing calculateTrackGeometry with this:
export function calculateTrackGeometry(p1, dir1, p2, dir2, mode, customRadius) {
    let segments = [];
    
    if (mode === 'auto' || dir2 === null) {
        const seg = createSegment(p1, dir1, p2);
        if (seg) segments.push(seg);
    } 
    else if (mode === 'biarc') {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const seg1 = createSegment(p1, dir1, {x: midX, y: midY});
        if (seg1) {
            const seg2 = createSegment({x: midX, y: midY}, seg1.endDir, p2);
            if (seg2) segments.push(seg1, seg2);
        }
    }
    else if (mode === 'arclinearc') {
        // Dynamically step down the radius if the user's requested radius is too big to fit
        let currentR = customRadius;
        let solvedSegments = null;
        
        while (currentR >= 20 && !solvedSegments) {
            solvedSegments = solveArcLineArc(p1, dir1, p2, dir2, currentR);
            if (!solvedSegments) currentR -= 20; 
        }

        if (solvedSegments) {
            segments = solvedSegments;
        } else {
            // Fallback to straight line if math absolutely fails
            segments.push({ type: 'straight', p1, p2, length: dist(p1, p2), radius: Infinity, startDir: dir1, endDir: dir1 });
        }
    }

    if (segments.length === 0) return null;

    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const minRadius = Math.min(...segments.map(s => s.radius));

    return { segments, totalLength, radius: minRadius, endDir: segments[segments.length-1].endDir };
}
