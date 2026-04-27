// Constants
const GAUGE_M = 1.435; // Standard gauge in meters
const MAX_SPEED_KMH = 160;
const STRAIGHT_THRESHOLD = 25000; // Radius > 25000m is straight

// Calculate max speed based on curve radius
function calculateMaxSpeed(radius) {
    if (!radius || radius >= STRAIGHT_THRESHOLD) return MAX_SPEED_KMH;
    // Simplified cant/physics formula for railway speed
    let speed = Math.sqrt(radius) * 4.5; 
    return Math.min(Math.round(speed), MAX_SPEED_KMH);
}

// Generate the visual representation of a track
// Returns a Leaflet FeatureGroup with gray base and black rails
function generateVisualTrack(startLatLng, endLatLng, layerIndex) {
    const group = L.featureGroup();
    
    // Convert to Turf.js format
    const line = turf.lineString([
        [startLatLng.lng, startLatLng.lat], 
        [endLatLng.lng, endLatLng.lat]
    ]);

    // 1. Gray Base (Ballast/Sleeper bed)
    // Leaflet weights are in pixels. We scale them roughly to look good.
    const baseLine = L.geoJSON(line, {
        style: { color: '#888', weight: 8, opacity: 0.8 }
    }).addTo(group);

    // 2. Black Rails (1435mm apart)
    // Turf.js lineOffset offsets lines in specific units (meters)
    const halfGauge = (GAUGE_M / 2) / 1000; // Convert to km for Turf
    
    const leftRailGeo = turf.lineOffset(line, halfGauge, {units: 'kilometers'});
    const rightRailGeo = turf.lineOffset(line, -halfGauge, {units: 'kilometers'});

    L.geoJSON(leftRailGeo, { style: { color: '#000', weight: 2 } }).addTo(group);
    L.geoJSON(rightRailGeo, { style: { color: '#000', weight: 2 } }).addTo(group);

    // Store custom data for selection logic later
    group.trackData = {
        layer: layerIndex,
        length: turf.length(line, {units: 'meters'}),
        speedLimit: calculateMaxSpeed(null) // Straight for now
    };

    return group;
}
