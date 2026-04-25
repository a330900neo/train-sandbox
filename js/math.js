import { State } from './state.js';

export const MathUtils = {
    dist(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    },
    
    // Generates straight or arc path between two points.
    // Respects tangent of p1 (if provided)
    calculatePath(p1, p2) {
        const d = this.dist(p1, p2);
        if (d < 1) return null;

        if (p1.dir == null) {
            // Straight line if no initial constraint
            return { type: 'straight', p1, p2, length: d, radius: Infinity };
        }

        // Calculate arc to match p1 tangent and hit p2
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angleToP2 = Math.atan2(dy, dx);
        const theta = angleToP2 - p1.dir;
        
        // If angle is extremely small, it's straight
        if (Math.abs(Math.sin(theta)) < 0.001) {
            return { type: 'straight', p1, p2, length: d, radius: Infinity };
        }

        const radius = Math.abs(d / (2 * Math.sin(theta)));
        
        if (radius > State.straightThreshold) {
            return { type: 'straight', p1, p2, length: d, radius: Infinity };
        }

        // Arc center calculation
        const cross = Math.cos(p1.dir)*dy - Math.sin(p1.dir)*dx;
        const side = cross > 0 ? 1 : -1;
        const cx = p1.x + Math.cos(p1.dir + side * Math.PI/2) * radius;
        const cy = p1.y + Math.sin(p1.dir + side * Math.PI/2) * radius;

        let startAngle = Math.atan2(p1.y - cy, p1.x - cx);
        let endAngle = Math.atan2(p2.y - cy, p2.x - cx);

        return {
            type: 'arc', p1, p2, cx, cy, radius, startAngle, endAngle, 
            ccw: side > 0, length: Math.abs(endAngle - startAngle) * radius
        };
    },

    getEndTangent(path) {
        if (path.type === 'straight') {
            return Math.atan2(path.p2.y - path.p1.y, path.p2.x - path.p1.x);
        } else {
            const tangentOffset = path.ccw ? Math.PI/2 : -Math.PI/2;
            return path.endAngle + tangentOffset;
        }
    },

    findSnapPoint(worldPos) {
        if (!State.snapping) return null;
        let snapRadius = 20 / State.scale; 
        let closest = null;
        let minDist = snapRadius;

        State.tracks.forEach(track => {
            [track.p1, track.p2].forEach((p, idx) => {
                let d = this.dist(worldPos, p);
                if (d < minDist) {
                    minDist = d;
                    // Provide direction based on snapping to the end of a track
                    let dir = idx === 1 ? track.endDir : (track.startDir + Math.PI);
                    closest = { x: p.x, y: p.y, z: p.z, dir: dir };
                }
            });
        });
        return closest;
    }
};
