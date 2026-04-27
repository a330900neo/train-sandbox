// Track Data Structure and Rendering
const TrackManager = {
    tracks: [],
    nodes: [], // Points where tracks connect
    snapRadius: 20, // pixels

    // Visual styles mimicking real railways
    styles: {
        base: { color: '#888888', weight: 8, opacity: 0.8 }, // Gray base
        rail: { color: '#000000', weight: 2, opacity: 1, dashArray: '5, 5' }, // Black rail
        preview: { color: '#FF5722', weight: 4, opacity: 0.6, dashArray: '10, 10' }
    },

    addTrack: function(startLatLng, endLatLng, layer, isArc, radius) {
        const trackData = {
            id: Date.now(),
            points: [startLatLng, endLatLng],
            layer: layer,
            isArc: isArc,
            radius: radius || null,
            length: Geometry.calculateDistance(startLatLng, endLatLng),
            maxSpeed: Geometry.calculateMaxSpeed(radius),
            oneWay: false,
            hasPlatform: false
        };

        this.tracks.push(trackData);
        this.renderTrack(trackData);
        this.addNodes(startLatLng, endLatLng);
    },

    renderTrack: function(trackData) {
        // Render Gray Base
        L.polyline(trackData.points, this.styles.base).addTo(map);
        // Render Black Rails on top
        L.polyline(trackData.points, this.styles.rail).addTo(map);
    },

    addNodes: function(p1, p2) {
        this.nodes.push(p1, p2);
    },

    // Find the closest node for snapping
    findSnapNode: function(latlng) {
        let closest = null;
        let minDistance = Infinity;

        for (let node of this.nodes) {
            // Convert LatLng to container points (pixels) for screen-based snapping
            let p1 = map.latLngToContainerPoint(latlng);
            let p2 = map.latLngToContainerPoint(node);
            
            let dist = p1.distanceTo(p2);
            if (dist < this.snapRadius && dist < minDistance) {
                minDistance = dist;
                closest = node;
            }
        }
        return closest;
    }
};
