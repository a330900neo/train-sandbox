class Node {
    constructor(x, y, z) {
        this.pos = new Vector2(x, y);
        this.z = z;
        this.connections = []; // Array of Segment references
    }
}

class Segment {
    constructor(n1, n2, type, data) {
        this.n1 = n1;
        this.n2 = n2;
        this.type = type; // 'straight' or 'arc'
        this.data = data; // { radius, center, length, ccw }
        this.forceSingleTrain = false;
        
        n1.connections.push(this);
        n2.connections.push(this);
    }
}

class TrackManager {
    constructor() {
        this.nodes = [];
        this.segments = [];
        this.gauge = 1.435; // Standard gauge
        this.trainWidth = 3.2; 
        
        // State
        this.mode = 'pan'; // pan, build, select, multi
        this.preview = null; // { p1, p2, dir1, z, dragNode: 1|2|null, path: [] }
        this.selection = [];
    }

    setMode(mode) {
        this.mode = mode;
        this.preview = null;
        this.selection = [];
        document.getElementById('preview-menu').classList.add('hidden');
        document.getElementById('dubins-menu').classList.add('hidden');
        document.getElementById('select-menu').classList.add('hidden');
    }

    startPreview(worldPos, z) {
        let startPos = worldPos;
        let dir = new Vector2(1, 0); // Default dir
        
        if (document.getElementById('toggle-snap').checked) {
            const snap = this.findSnap(worldPos);
            if (snap) {
                startPos = snap.pos;
                dir = snap.dir;
                z = snap.z;
            }
        }

        this.preview = {
            p1: startPos, p2: startPos.add(new Vector2(10, 0)),
            dir1: dir, z: z, dragNode: 2, path: []
        };
        this.updatePreview();
    }

    updatePreview(worldPos = null) {
        if (!this.preview) return;
        
        if (worldPos && this.preview.dragNode === 2) {
            this.preview.p2 = worldPos;
            if (document.getElementById('toggle-snap').checked) {
                const snap = this.findSnap(worldPos);
                if (snap) this.preview.p2 = snap.pos; // Simple endpoint snap
            }
        }

        const path = MathUtils.fitArc(this.preview.p1, this.preview.dir1, this.preview.p2);
        this.preview.path = [path]; // For advanced, use solveConnection

        // Update UI
        const menu = document.getElementById('preview-menu');
        menu.classList.remove('hidden');
        const speed = MathUtils.calcSpeedLimit(path.radius);
        document.getElementById('preview-stats').innerText = 
            `L: ${Math.round(path.length)}m | R: ${path.type === 'straight' ? '∞' : Math.round(path.radius)}m\n` +
            `Max Speed: ${speed} km/h | Elevation: ${this.preview.z}`;
    }

    confirmBuild() {
        if (!this.preview || this.preview.path.length === 0) return;
        
        // Subdivision Logic (Segments must be 3m to 40m)
        this.preview.path.forEach(p => {
            const numSegments = Math.ceil(p.length / 40);
            let lastNode = new Node(p.p1.x, p.p1.y, this.preview.z);
            this.nodes.push(lastNode);

            for (let i = 1; i <= numSegments; i++) {
                const t = i / numSegments;
                // Interpolate pos (Simplified straight interp here, arc interp needs angle math)
                let nx = p.p1.x + (p.p2.x - p.p1.x) * t;
                let ny = p.p1.y + (p.p2.y - p.p1.y) * t;
                let newNode = new Node(nx, ny, this.preview.z);
                this.nodes.push(newNode);
                
                let seg = new Segment(lastNode, newNode, p.type, {
                    radius: p.radius, center: p.center, ccw: p.ccw, length: p.length / numSegments
                });
                this.segments.push(seg);
                lastNode = newNode;
            }
        });

        this.preview = null;
        document.getElementById('preview-menu').classList.add('hidden');
    }

    cancelBuild() {
        this.preview = null;
        document.getElementById('preview-menu').classList.add('hidden');
    }

    findSnap(pos) {
        const snapRadius = 1.5;
        let closest = null, minDist = Infinity;
        
        // Node snapping
        for (let node of this.nodes) {
            const d = node.pos.dist(pos);
            if (d < snapRadius && d < minDist) {
                minDist = d;
                closest = { pos: node.pos, z: node.z, dir: new Vector2(1,0) }; // Derive dir from segments
                if (node.connections.length > 0) {
                    const seg = node.connections[0];
                    const other = seg.n1 === node ? seg.n2 : seg.n1;
                    closest.dir = node.pos.sub(other.pos).norm(); // outward tangent
                }
            }
        }
        return closest;
    }

    selectTrack(worldPos) {
        // Find clicked segment
        this.selection = [];
        let minDist = Infinity;
        for (let seg of this.segments) {
            const d = Math.min(seg.n1.pos.dist(worldPos), seg.n2.pos.dist(worldPos)); // approximation
            if (d < 5 && d < minDist) {
                minDist = d;
                this.selection = [seg];
            }
        }
        
        if (this.selection.length > 0) {
            document.getElementById('select-menu').classList.remove('hidden');
            const s = this.selection[0];
            document.getElementById('select-data').innerText = `Track Type: ${s.type}`;
        } else {
            document.getElementById('select-menu').classList.add('hidden');
        }
    }

    deleteSelection() {
        this.selection.forEach(seg => {
            this.segments = this.segments.filter(s => s !== seg);
            seg.n1.connections = seg.n1.connections.filter(s => s !== seg);
            seg.n2.connections = seg.n2.connections.filter(s => s !== seg);
        });
        this.selection = [];
        document.getElementById('select-menu').classList.add('hidden');
    }
}

// Global Instance
const TrackSys = new TrackManager();
