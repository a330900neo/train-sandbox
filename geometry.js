// Math and Geometry Helpers
const Geometry = {
    // Calculate distance between two LatLng points in meters
    calculateDistance: function(latlng1, latlng2) {
        return map.distance(latlng1, latlng2);
    },

    // Calculate maximum speed based on curve radius (simplified formula)
    // Real world cant/superelevation is complex, but generally V_max = sqrt(R * 11.8) approx
    calculateMaxSpeed: function(radiusMeters) {
        if (!radiusMeters || radiusMeters > 25000) return 160; // Max system speed
        
        let speed = Math.sqrt(radiusMeters * 11.8);
        return Math.min(Math.round(speed), 160);
    },

    // A placeholder for the complex Dubins path logic (Arc-Straight-Arc)
    // To fully implement this, you need a JS library like 'dubins-path' or to write custom 2D vector math
    calculateDubinsPath: function(p1, heading1, p2, heading2, minRadius) {
        console.log("Dubins path calculation triggered. (Requires advanced 2D matrix math implementation)");
        // Returns an array of segments (arcs and straights)
        return [];
    }
};
