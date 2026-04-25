export const GameState = {
    tracks: [],
    platforms: [],
    selectedTracks: new Set(),
    
    currentTool: 'pan',
    
    snapEnabled: true,
    snapRadius: 1.5,     // Changed to 1.5m
    parallelOffset: 3.5, // Changed to 3.5m centerline-to-centerline
    
    currentElevation: 0,
    connectionRadius: 200,

    preview: null,
    
    addTracks(trackGeometries) {
        trackGeometries.forEach(geo => {
            this.tracks.push({ ...geo, id: Date.now() + Math.random() });
        });
    },

    deleteSelected() {
        this.tracks = this.tracks.filter(t => !this.selectedTracks.has(t.id));
        this.selectedTracks.clear();
    }
};
