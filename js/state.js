export const GameState = {
    tracks: [],
    platforms: [],
    
    // Tools: 'pan', 'build_track', 'build_plat', 'select', 'multi'
    currentTool: 'pan',
    
    // Snapping configuration
    snapEnabled: true,
    snapRadius: 5, // meters

    // Preview state for building
    preview: null,
    
    addTrack(trackData) {
        this.tracks.push({ ...trackData, id: Date.now() });
    }
};
