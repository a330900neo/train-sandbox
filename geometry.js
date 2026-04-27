export class GeometryEngine {
    constructor() {
        this.currentRadius = 30000; // Default to straight
    }

    // Snapping Engine
    snapToNearest(lngLat, trackCollection, currentLayer) {
        const point = turf.point([lngLat.lng, lngLat.lat]);
        let closestDist = Infinity;
        let snapCoords = point;

        // Tolerance for snapping (in km)
        const snapTolerance = 0.01; // roughly 10 meters

        // 1. Snap to nodes (start/end of existing tracks)
        turf.featureEach(trackCollection, (currentFeature) => {
            // Only snap if layers match or it's a ramp (simplified layer logic)
            if (currentFeature.properties.layer !== currentLayer) return;

            const coords = turf.getCoords(currentFeature);
            const startNode = turf.point(coords[0]);
            const endNode = turf.point(coords[coords.length - 1]);

            const distStart = turf.distance(point, startNode);
            const distEnd = turf.distance(point, endNode);

            if (distStart < closestDist && distStart < snapTolerance) {
                closestDist = distStart;
                snapCoords = startNode;
            }
            if (distEnd < closestDist && distEnd < snapTolerance) {
                closestDist = distDist;
                snapCoords = endNode;
            }
            
            // TODO for later expansion: Snap parallel offset (3.5m - 4m)
            // This requires calculating the nearest point on the line segment,
            // finding its orthogonal vector, and projecting 3.5 meters out.
        });

        return { lng: snapCoords.geometry.coordinates[0], lat: snapCoords.geometry.coordinates[1] };
    }

    // Track Routing (Dubins Path Stub)
    calculatePath(startLngLat, endLngLat) {
        const pt1 = turf.point([startLngLat.lng, startLngLat.lat]);
        const pt2 = turf.point([endLngLat.lng, endLngLat.lat]);
        
        const distance = turf.distance(pt1, pt2, { units: 'meters' });

        // TRUE DUBINS PATH (Arc-Straight-Arc): 
        // Requires tangent points of two circles. 
        // For the sake of this structural foundation, if the user points are 
        // loosely aligned, we create a straight line. If offset, we generate an arc.
        
        // Placeholder Logic: Straight line for now. To make actual circular arcs,
        // you will use turf.destination to plot points along a circle's circumference.
        this.currentRadius = 30000; // Mark as straight

        const line = turf.lineString([
            [startLngLat.lng, startLngLat.lat],
            [endLngLat.lng, endLngLat.lat]
        ]);

        return line;
    }

    getCurrentRadius() {
        return this.currentRadius;
    }
}
