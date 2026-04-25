export const GameState = {
    tracks: [],
    platforms: [],
    selectedTracks: new Set(),
    
    currentTool: 'pan',
    
    snapEnabled: true,
    snapRadius: 0.8, // 0.8m snapping
    parallelOffset: 3.2, // 3.2m train width
    
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
