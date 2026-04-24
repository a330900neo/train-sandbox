export const state = {
    tracks: [],
    platforms: [],
    intersections: [], // Store {x, y} points where tracks cross
    currentTool: 'pan',
    selection: [],
    
    save() {
        const data = { tracks: this.tracks, platforms: this.platforms };
        localStorage.setItem('trainBuilderData', JSON.stringify(data));
    },
    
    load() {
        const data = localStorage.getItem('trainBuilderData');
        if (data) {
            const parsed = JSON.parse(data);
            this.tracks = parsed.tracks || [];
            this.platforms = parsed.platforms || [];
            this.computeIntersections();
        }
    },

    // O(N^2) brute force line intersection for simplicity
    computeIntersections() {
        this.intersections = [];
        // Extract all straight segments (Arc intersections require complex polynomial solvers)
        const lines = [];
        this.tracks.forEach(t => t.segments.forEach(s => {
            if (s.type === 'straight') lines.push(s);
        }));

        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const pt = getLineIntersection(lines[i].p1, lines[i].p2, lines[j].p1, lines[j].p2);
                if (pt) this.intersections.push(pt);
            }
        }
    }
};

function getLineIntersection(p0, p1, p2, p3) {
    const s1_x = p1.x - p0.x, s1_y = p1.y - p0.y;
    const s2_x = p3.x - p2.x, s2_y = p3.y - p2.y;
    const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
    const t = ( s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return { x: p0.x + (t * s1_x), y: p0.y + (t * s1_y) };
    }
    return null;
}
