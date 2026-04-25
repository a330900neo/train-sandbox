// Calculates a single connection (straight or arc)
export function calculateSingleGeometry(p1, dirAngle, p2, z1, z2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance2D = Math.hypot(dx, dy);

    if (distance2D < 0.1) return null;

    const chordAngle = Math.atan2(dy, dx);
    let theta = chordAngle - dirAngle;
    while (theta > Math.PI) theta -= Math.PI * 2;
    while (theta < -Math.PI) theta += Math.PI * 2;

    const isStraight = Math.abs(theta) < 0.01 || Math.abs(theta) > Math.PI - 0.01;
    const radius = isStraight ? Infinity : Math.abs(distance2D / (2 * Math.sin(theta)));

    let geo = {
        start: { ...p1, z: z1 },
        end: { ...p2, z: z2 },
        length: distance2D
    };

    if (isStraight || radius > 20000) {
        geo.type = 'straight';
        geo.endAngle = chordAngle;
    } else {
        const isRightTurn = theta > 0;
        const centerAngle = dirAngle + (isRightTurn ? Math.PI / 2 : -Math.PI / 2);
        geo.type = 'curve';
        geo.center = { x: p1.x + Math.cos(centerAngle) * radius, y: p1.y + Math.sin(centerAngle) * radius };
        geo.radius = radius;
        geo.startArcAngle = Math.atan2(p1.y - geo.center.y, p1.x - geo.center.x);
        geo.endArcAngle = Math.atan2(p2.y - geo.center.y, p2.x - geo.center.x);
        geo.isRightTurn = isRightTurn;
        geo.endAngle = dirAngle + (theta * 2);
    }
    return geo;
}

// Split a long geometry into chunks (5m to 40m)
export function splitGeometry(geo) {
    if (!geo) return [];
    
    // Clamp sections to 40m max. If less than 5m, just keep it (don't break physics)
    let chunks = Math.ceil(geo.length / 40);
    if (geo.length < 5) chunks = 1; 
    
    const sections = [];
    const chunkLength = geo.length / chunks;
    const zDiff = geo.end.z - geo.start.z;

    if (geo.type === 'straight') {
        const dx = (geo.end.x - geo.start.x) / chunks;
        const dy = (geo.end.y - geo.start.y) / chunks;
        const dz = zDiff / chunks;

        for (let i = 0; i < chunks; i++) {
            sections.push({
                ...geo,
                start: { x: geo.start.x + dx * i, y: geo.start.y + dy * i, z: geo.start.z + dz * i },
                end: { x: geo.start.x + dx * (i + 1), y: geo.start.y + dy * (i + 1), z: geo.start.z + dz * (i+1) },
                length: chunkLength
            });
        }
    } else if (geo.type === 'curve') {
        // Splitting an arc
        let angleStep = (geo.endArcAngle - geo.startArcAngle);
        // Fix arc wrapping
        if (geo.isRightTurn && angleStep < 0) angleStep += Math.PI * 2;
        if (!geo.isRightTurn && angleStep > 0) angleStep -= Math.PI * 2;
        
        angleStep /= chunks;
        const dz = zDiff / chunks;
        const angleDiff = (geo.endAngle - (geo.endAngle - (geo.endAngle - geo.startAngle))) / chunks;

        for (let i = 0; i < chunks; i++) {
            const sAngle = geo.startArcAngle + angleStep * i;
            const eAngle = geo.startArcAngle + angleStep * (i + 1);
            sections.push({
                ...geo,
                start: { x: geo.center.x + Math.cos(sAngle) * geo.radius, y: geo.center.y + Math.sin(sAngle) * geo.radius, z: geo.start.z + dz * i },
                end: { x: geo.center.x + Math.cos(eAngle) * geo.radius, y: geo.center.y + Math.sin(eAngle) * geo.radius, z: geo.start.z + dz * (i+1) },
                startArcAngle: sAngle,
                endArcAngle: eAngle,
                length: chunkLength
            });
        }
    }
    return sections;
}

export function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function getDistanceToTrack(point, track) {
    if (track.type === 'straight') {
        const l2 = Math.pow(track.start.x - track.end.x, 2) + Math.pow(track.start.y - track.end.y, 2);
        if (l2 === 0) return distance(point, track.start);
        let t = ((point.x - track.start.x) * (track.end.x - track.start.x) + (point.y - track.start.y) * (track.end.y - track.start.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = { x: track.start.x + t * (track.end.x - track.start.x), y: track.start.y + t * (track.end.y - track.start.y) };
        return distance(point, proj);
    } else {
        const distToCenter = distance(point, track.center);
        return Math.abs(distToCenter - track.radius);
    }
}
