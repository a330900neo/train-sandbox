export const State = {
    tracks: [],
    platforms: [],
    currentTool: 'pan',
    snapping: true,
    scale: 10, // 10 pixels = 1 meter
    gauge: 1.435, // meters
    trainWidth: 3.2, // meters
    
    // Preview Data
    preview: {
        active: false,
        p1: { x: 0, y: 0, z: 0, dir: null },
        p2: { x: 0, y: 0, z: 0, dir: null },
        dragging: null // 'p1' or 'p2'
    },
    
    // Config
    maxSpeedRadiusRatio: 350 / 2000, // naive approx
    straightThreshold: 20000
};
