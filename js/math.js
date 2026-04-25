// Calculate circular arc from point A (with angle) passing through point B
export function calculateTrackGeometry(p1, dirAngle, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 0.1) return { type: 'invalid' };

    // Angle of the chord between p1 and p2
    const chordAngle = Math.atan2(dy, dx);
    // Angle difference between start direction and chord
    let theta = chordAngle - dirAngle;
    
    // Normalize theta to -PI to PI
    while (theta > Math.PI) theta -= Math.PI * 2;
    while (theta < -Math.PI) theta += Math.PI * 2;

    // If straight line (or very close to it)
    if (Math.abs(theta) < 0.01 || Math.abs(theta) > Math.PI - 0.01) {
        return {
            type: 'straight',
            start: p1,
            end: p2,
            length: distance,
            endAngle: chordAngle
        };
    }

    // Radius calculation based on chord and tangent angle
    // R = d / (2 * sin(theta))
    const radius = Math.abs(distance / (2 * Math.sin(theta)));

    // Snap to straight if radius is massive (> 20000m)
    if (radius > 20000) {
        return { type: 'straight', start: p1, end: p2, length: distance, endAngle: chordAngle };
    }

    // Find circle center
    const isRightTurn = theta > 0;
    const centerAngle = dirAngle + (isRightTurn ? Math.PI / 2 : -Math.PI / 2);
    const cx = p1.x + Math.cos(centerAngle) * radius;
    const cy = p1.y + Math.sin(centerAngle) * radius;

    const startArcAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const endArcAngle = Math.atan2(p2.y - cy, p2.x - cx);
    
    // Calculate speed limit (v = sqrt(a*r), a roughly 0.8 m/s^2 for trains)
    // cap at 350 km/h
    let speedKmh = 3.6 * Math.sqrt(0.8 * radius);
    if (speedKmh > 350) speedKmh = 350;

    return {
        type: 'curve',
        start: p1,
        end: p2,
        center: { x: cx, y: cy },
        radius: radius,
        startArcAngle,
        endArcAngle,
        isRightTurn,
        endAngle: dirAngle + (theta * 2), // Final tangent angle
        length: radius * Math.abs(theta * 2),
        speedLimit: speedKmh
    };
}

export function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}
