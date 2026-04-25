export function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Track Splitting (5m - 40m)
export function splitGeometry(geo, startZ, endZ) {
    const maxL = 40;
    const minL = 5;
    const segments = Math.max(1, Math.ceil(geo.length / maxL));
    const result = [];
    
    for (let i = 0; i < segments; i++) {
        const tStart = i / segments;
        const tEnd = (i + 1) / segments;
        const z1 = startZ + (endZ - startZ) * tStart;
        const z2 = startZ + (endZ - startZ) * tEnd;

        if (geo.type === 'straight') {
            result.push({
                type: 'straight',
                start: { x: geo.start.x + (geo.end.x - geo.start.x) * tStart, y: geo.start.y + (geo.end.y - geo.start.y) * tStart },
                end: { x: geo.start.x + (geo.end.x - geo.start.x) * tEnd, y: geo.start.y + (geo.end.y - geo.start.y) * tEnd },
                length: geo.length / segments,
                startAngle: geo.startAngle,
                endAngle: geo.endAngle,
                z1, z2
            });
        } else if (geo.type === 'curve') {
            const angleDiff = geo.endArcAngle - geo.startArcAngle;
            result.push({
                ...geo,
                startArcAngle: geo.startArcAngle + angleDiff * tStart,
                endArcAngle: geo.startArcAngle + angleDiff * tEnd,
                length: geo.length / segments,
                z1, z2
            });
            // Recalculate exact start/end points for the chunk
            const r = result[i];
            r.start = { x: r.center.x + Math.cos(r.startArcAngle) * r.radius, y: r.center.y + Math.sin(r.startArcAngle) * r.radius };
            r.end = { x: r.center.x + Math.cos(r.endArcAngle) * r.radius, y: r.center.y + Math.sin(r.endArcAngle) * r.radius };
        }
    }
    return result;
}

// Simplified Dubins CSC (Curve-Straight-Curve) solver for connecting two endpoints
export function calculateDubinsPath(p1, angle1, p2, angle2, r) {
    // Helper to get center of a tangent circle
    const getCenter = (p, angle, isRight) => ({
        x: p.x + Math.cos(angle + (isRight ? Math.PI/2 : -Math.PI/2)) * r,
        y: p.y + Math.sin(angle + (isRight ? Math.PI/2 : -Math.PI/2)) * r
    });

    // Evaluate 4 combinations: RSR, LSL, RSL, LSR
    const paths = [];
    const dirs = [[true, true], [false, false], [true, false], [false, true]]; // [StartRight, EndRight]

    for (let dir of dirs) {
        const c1 = getCenter(p1, angle1, dir[0]);
        const c2 = getCenter(p2, angle2, dir[1]);
        const distC = distance(c1, c2);

        if (dir[0] !== dir[1] && distC < r * 2) continue; // Circles intersect, invalid for cross tangent

        let tangentAngle, t1, t2;
        const angleC1C2 = Math.atan2(c2.y - c1.y, c2.x - c1.x);

        if (dir[0] === dir[1]) {
            // LSL or RSR (Outer tangent)
            tangentAngle = angleC1C2 + (dir[0] ? -Math.PI/2 : Math.PI/2);
            t1 = { x: c1.x + Math.cos(tangentAngle)*r, y: c1.y + Math.sin(tangentAngle)*r };
            t2 = { x: c2.x + Math.cos(tangentAngle)*r, y: c2.y + Math.sin(tangentAngle)*r };
        } else {
            // RSL or LSR (Inner tangent)
            const theta = Math.acos((2 * r) / distC);
            tangentAngle = angleC1C2 + (dir[0] ? -theta : theta);
            const norm = tangentAngle + (dir[0] ? -Math.PI/2 : Math.PI/2);
            t1 = { x: c1.x + Math.cos(norm)*r, y: c1.y + Math.sin(norm)*r };
            const norm2 = tangentAngle + (dir[1] ? -Math.PI/2 : Math.PI/2);
            t2 = { x: c2.x + Math.cos(norm2)*r, y: c2.y + Math.sin(norm2)*r };
        }

        paths.push({
            arc1: buildArc(p1, t1, c1, r, dir[0]),
            straight: { type: 'straight', start: t1, end: t2, length: distance(t1, t2), startAngle: tangentAngle, endAngle: tangentAngle },
            arc2: buildArc(t2, p2, c2, r, dir[1]),
            totalLength: distance(t1, t2)
        });
        paths[paths.length-1].totalLength += paths[paths.length-1].arc1.length + paths[paths.length-1].arc2.length;
    }

    if (paths.length === 0) return null; // Fallback needed
    paths.sort((a, b) => a.totalLength - b.totalLength);
    return [paths[0].arc1, paths[0].straight, paths[0].arc2].filter(g => g.length > 0.1); // Return shortest path array
}

function buildArc(pStart, pEnd, center, r, isRightTurn) {
    const startArcAngle = Math.atan2(pStart.y - center.y, pStart.x - center.x);
    const endArcAngle = Math.atan2(pEnd.y - center.y, pEnd.x - center.x);
    let diff = endArcAngle - startArcAngle;
    if (isRightTurn && diff < 0) diff += Math.PI * 2;
    if (!isRightTurn && diff > 0) diff -= Math.PI * 2;
    
    return {
        type: 'curve', start: pStart, end: pEnd, center, radius: r,
        startArcAngle, endArcAngle: startArcAngle + diff,
        isRightTurn, length: Math.abs(diff) * r
    };
}

// Distance from point to line segment for Selection
export function pointToSegmentDist(p, v, w) {
    const l2 = distance(v, w) ** 2;
    if (l2 === 0) return distance(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distance(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

// Distance from point to Arc
export function pointToArcDist(p, arc) {
    const distToCenter = distance(p, arc.center);
    let angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
    // Simple bound check (can be improved for precision)
    return Math.abs(distToCenter - arc.radius);
}
