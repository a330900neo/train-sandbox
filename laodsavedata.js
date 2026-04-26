const SaveSystem = {
    serialize: () => {
        // Convert references to indices for JSON
        const nodeMap = new Map();
        const nodesData = TrackSys.nodes.map((n, i) => {
            nodeMap.set(n, i);
            return { x: n.pos.x, y: n.pos.y, z: n.z };
        });
        const segmentsData = TrackSys.segments.map(s => ({
            n1: nodeMap.get(s.n1), n2: nodeMap.get(s.n2),
            type: s.type, data: s.data, single: s.forceSingleTrain
        }));
        return JSON.stringify({ nodes: nodesData, segments: segmentsData });
    },

    deserialize: (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            TrackSys.nodes = data.nodes.map(n => new Node(n.x, n.y, n.z));
            TrackSys.segments = [];
            data.segments.forEach(s => {
                const seg = new Segment(TrackSys.nodes[s.n1], TrackSys.nodes[s.n2], s.type, s.data);
                seg.forceSingleTrain = s.single;
                TrackSys.segments.push(seg);
            });
            TrackSys.setMode('pan');
        } catch(e) { alert("Failed to load save data."); }
    }
};

document.getElementById('btn-save').onclick = () => {
    localStorage.setItem('trainSaveData', SaveSystem.serialize());
    alert('Saved to local storage.');
};

document.getElementById('btn-load').onclick = () => {
    const data = localStorage.getItem('trainSaveData');
    if (data) SaveSystem.deserialize(data);
};

document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([SaveSystem.serialize()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "track_save.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

document.getElementById('btn-import-btn').onclick = () => document.getElementById('btn-import').click();
document.getElementById('btn-import').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => SaveSystem.deserialize(event.target.result);
    reader.readAsText(file);
});
