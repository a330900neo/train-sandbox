import { Vector2 } from './MathUtils.js';

export class TrackManager {
    constructor() {
        this.nodes = [];
        this.segments = [];
    }

    addSegment(startWorld, endWorld, layer) {
        // In a full implementation, you'd check for existing nodes to merge here
        this.nodes.push({ x: startWorld.x, y: startWorld.y, layer: layer });
        this.nodes.push({ x: endWorld.x, y: endWorld.y, layer: layer });
        
        this.segments.push({
            start: startWorld,
            end: endWorld,
            layer: layer,
            maxSpeed: 160,
            platforms: 'none'
        });
    }

    getSnappedPoint(worldPos, activeLayer, parallelSnapDist) {
        let closest = worldPos;
        let minDist = 2.0; // Snap threshold (2 meters)

        // 1. Node Snapping (Connections/Merges)
        for (let node of this.nodes) {
            // Layer collision logic (Ramps to be handled by checking multiple layers)
            if (Math.abs(node.layer - activeLayer) > 0.5) continue; 
            
            const dist = new Vector2(worldPos.x, worldPos.y).distanceTo(new Vector2(node.x, node.y));
            if (dist < minDist) {
                minDist = dist;
                closest = { x: node.x, y: node.y };
            }
        }

        // 2. Parallel track snapping would involve projecting worldPos onto existing line segments
        // and snapping at exact parallelSnapDist offset. (Skeleton logic ready for expansion)

        return closest;
    }
}
