function exportData() {
    const data = {
        tracks: appState.tracks,
        nodes: appState.nodes,
        platforms: appState.platforms
    };
    
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = "train_layout.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Reconstruct objects (JSON doesn't save class methods)
            appState.nodes = data.nodes.map(n => {
                let node = new Node(n.pos.x, n.pos.y, n.h);
                return node;
            });
            
            appState.tracks = data.tracks.map(t => {
                let track = new Track();
                track.id = t.id;
                track.isCurve = t.isCurve;
                track.radius = t.radius;
                track.speedLimit = t.speedLimit;
                // Re-link nodes based on positions/IDs
                track.nodes = t.nodes.map(n => new Node(n.pos.x, n.pos.y, n.h));
                return track;
            });
            
            appState.platforms = data.platforms || [];
            
            console.log("Import successful.");
        } catch (err) {
            alert("Error parsing save file.");
            console.error(err);
        }
    };
    reader.readAsText(file);
}
