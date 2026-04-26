// Data structures for tracks
class Node {
    constructor(x, y, z = 0) {
        this.id = crypto.randomUUID();
        this.x = x; this.y = y; this.z = z;
        this.connections = []; // Array of TrackSegment IDs
    }
}

class TrackSegment {
    constructor(n1, n2, type, radius = Infinity) {
        this.id = crypto.randomUUID();
        this.n1 = n1; // Start Node ID
        this.n2 = n2; // End Node ID
        this.type = type; // 'straight', 'curve'
        this.radius = radius;
        this.speedLimit = MathUtils.calcSpeedLimit(radius);
        this.isOneTrainOnly = false;
    }
}

const TrackManager = {
    nodes: {},
    segments: {},
    
    addNode: function(x, y, z) {
        let n = new Node(x, y, z);
        this.nodes[n.id] = n;
        return n;
    },

    addSegment: function(n1, n2, type, radius) {
        // Enforce 3m - 40m segmentation rule
        let dist = MathUtils.distance2D(this.nodes[n1], this.nodes[n2]);
        if (dist > 40) {
            // Needs splitting (simplified logic for straight)
            let midX = (this.nodes[n1].x + this.nodes[n2].x) / 2;
            let midY = (this.nodes[n1].y + this.nodes[n2].y) / 2;
            let midZ = (this.nodes[n1].z + this.nodes[n2].z) / 2;
            let midNode = this.addNode(midX, midY, midZ);
            this.addSegment(n1, midNode.id, type, radius);
            this.addSegment(midNode.id, n2, type, radius);
            return;
        }

        let seg = new TrackSegment(n1, n2, type, radius);
        this.nodes[n1].connections.push(seg.id);
        this.nodes[n2].connections.push(seg.id);
        this.segments[seg.id] = seg;
    },

    deleteSegment: function(id) {
        if (!this.segments[id]) return;
        let seg = this.segments[id];
        // Remove connections from nodes
        this.nodes[seg.n1].connections = this.nodes[seg.n1].connections.filter(sId => sId !== id);
        this.nodes[seg.n2].connections = this.nodes[seg.n2].connections.filter(sId => sId !== id);
        delete this.segments[id];
        // Cleanup orphaned nodes
        if (this.nodes[seg.n1].connections.length === 0) delete this.nodes[seg.n1];
        if (this.nodes[seg.n2].connections.length === 0) delete this.nodes[seg.n2];
    },

    // Snapping logic (1.5m radius)
    findSnapNode: function(x, y) {
        let closest = null;
        let minDist = 1.5; // 1.5m snapping radius
        for (let id in this.nodes) {
            let d = MathUtils.distance2D({x, y}, this.nodes[id]);
            if (d < minDist) { minDist = d; closest = this.nodes[id]; }
        }
        return closest;
    },

    // Parallel snapping and cross detection skeletons
    findParallelSnap: function(x, y, parallelDist) {
        // Logic to find point parallel to existing track curve/straight
        return null;
    },
    
    checkCrossings: function(newSegment) {
        // Logic to detect if new track intersects existing at SAME Z height -> form cross
    }
};
