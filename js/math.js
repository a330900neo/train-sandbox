export function dist(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y); }
export function normalize(v) { let d = Math.hypot(v.x, v.y); return d === 0 ? {x:0, y:0} : {x: v.x/d, y: v.y/d}; }
export function dot(v1, v2) { return v1.x * v2.x + v1.y * v2.y; }
export function cross(v1, v2) { return v1.x * v2.y - v1.y * v2.x; }

export function calcArcFromTangent(p1, dir1, p2) {
    let dx = p2.x - p1.x, dy = p2.y - p1.y;
    let distSq = dx*dx + dy*dy;
    if (distSq < 0.001) return null;

    let normal = { x: -dir1.y, y: dir1.x };
    let d = dx * normal.x + dy * normal.y;

    if (Math.abs(d) < 0.001) return { type: 'straight', p1, p2, length: Math.sqrt(distSq) };

    let radius = distSq / (2 * Math.abs(d));
    if (radius > 25000) return { type: 'straight', p1, p2, length: Math.sqrt(distSq) };

    let sign = Math.sign(d);
    let center = { x: p1.x + sign * radius * normal.x, y: p1.y + sign * radius * normal.y };
    let startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
    let endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
    let ccw = sign < 0;

    let dAngle = endAngle - startAngle;
    if (ccw) { while (dAngle >= 0) dAngle -= 2*Math.PI; while (dAngle < -2*Math.PI) dAngle += 2*Math.PI; } 
    else { while (dAngle <= 0) dAngle += 2*Math.PI; while (dAngle > 2*Math.PI) dAngle -= 2*Math.PI; }

    return { type: 'arc', p1, p2, center, radius, startAngle, endAngle, ccw, length: Math.abs(dAngle) * radius };
}

export function calcDubins(p1, dir1, p2, dir2, r1, r2) {
    let paths = [];
    let dirs = [[1, 1],[1, -1], [-1, 1], [-1, -1]]; // L/R combinations
    
    for (let [s1, s2] of dirs) {
        let n1 = { x: -dir1.y * s1, y: dir1.x * s1 };
        let n2 = { x: -dir2.y * s2, y: dir2.x * s2 };
        let c1 = { x: p1.x + r1 * n1.x, y: p1.y + r1 * n1.y };
        let c2 = { x: p2.x + r2 * n2.x, y: p2.y + r2 * n2.y };
        
        let d = dist(c1, c2);
        let angle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
        let tangents =[];

        if (s1 === s2) { // Outer tangent (LSL, RSR)
            if (d < Math.abs(r1 - r2)) continue;
            let theta = Math.acos((r1 - r2) / d);
            tangents.push({ a1: angle + theta, a2: angle + theta }, { a1: angle - theta, a2: angle - theta });
        } else { // Inner tangent (LSR, RSL)
            if (d < r1 + r2) continue;
            let theta = Math.acos((r1 + r2) / d);
            tangents.push({ a1: angle + theta, a2: angle + theta + Math.PI }, { a1: angle - theta, a2: angle - theta + Math.PI });
        }

        for (let t of tangents) {
            let tp1 = { x: c1.x + r1 * Math.cos(t.a1), y: c1.y + r1 * Math.sin(t.a1) };
            let tp2 = { x: c2.x + r2 * Math.cos(t.a2), y: c2.y + r2 * Math.sin(t.a2) };
            let tDir = normalize({ x: tp2.x - tp1.x, y: tp2.y - tp1.y });

            let cross1 = cross({ x: tp1.x - c1.x, y: tp1.y - c1.y }, tDir);
            let cross2 = cross({ x: tp2.x - c2.x, y: tp2.y - c2.y }, tDir);
            
            let ccw1 = s1 < 0, ccw2 = s2 < 0;
            let valid1 = ccw1 ? cross1 < 0 : cross1 > 0;
            let valid2 = ccw2 ? cross2 < 0 : cross2 > 0;

            if (valid1 && valid2) {
                let arc1 = calcArcFromTangent(p1, dir1, tp1);
                let arc2 = calcArcFromTangent(tp1, tDir, p2); // using tp1 to p2 via tp2
                arc2 = calcArcFromTangent(tp2, tDir, p2);
                
                if (arc1 && arc2) {
                    let straightLength = dist(tp1, tp2);
                    let straight = { type: 'straight', p1: tp1, p2: tp2, length: straightLength };
                    paths.push({ segments: [arc1, straight, arc2], length: arc1.length + straightLength + arc2.length });
                }
            }
        }
    }
    
    paths.sort((a, b) => a.length - b.length);
    return paths.length > 0 ? paths[0].segments : null;
}