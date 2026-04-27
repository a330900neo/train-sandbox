// math.js - Handles real-world distances, scale, and track geometry
const MathUtils = {
    // Calculates meters per pixel based on Leaflet map center and zoom level
    getScale: function(map) {
        const center = map.getCenter();
        const zoom = map.getZoom();
        // Web Mercator formula for meters per pixel
        return 40075016.686 * Math.abs(Math.cos(center.lat * Math.PI/180)) / Math.pow(2, zoom + 8);
    },

    // Convert LatLng to local Cartesian (meters) relative to a reference point for easier math
    latLngToMeters: function(latlng, reference) {
        const dx = (latlng.lng - reference.lng) * 40075016.686 * Math.cos(reference.lat * Math.PI/180) / 360;
        const dy = (latlng.lat - reference.lat) * 40075016.686 / 360;
        return { x: dx, y: dy };
    },

    // Distance between two meter-coordinate points
    distance: (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)),

    // Calculates max speed based on radius (radius > 25000m is straight)
    calculateMaxSpeed: function(radiusMeters) {
        if (!radiusMeters || radiusMeters > 25000) return 160;
        // Approximation formula for safe lateral acceleration
        let speed = Math.floor(4.5 * Math.sqrt(radiusMeters)); 
        return Math.min(speed, 160);
    },

    // Dubins Path (Arc-Straight-Arc) logic placeholder. 
    // Calculating exact tangent points between two directed nodes is complex.
    // This function structures where your connection logic goes.
    calculateDubinsPath: function(startNode, endNode, currentDirAngle) {
        // 1. Calculate turn radius required to face endNode
        // 2. Generate arc 1
        // 3. Generate straight tangent
        // 4. Generate arc 2 to match endNode direction
        return {
            path: [
                { type: 'arc', radius: 500, length: 200 },
                { type: 'straight', length: 1200 },
                { type: 'arc', radius: 500, length: 100 }
            ],
            totalLength: 1500
        };
    }
};
