export class TrackManager {
    constructor(map) {
        this.map = map;
        this.tracks = turf.featureCollection([]); // Stores all committed tracks
        this.previewTrack = turf.featureCollection([]);
    }

    initLayers() {
        // Add Source for Committed Tracks
        this.map.addSource('tracks-source', { type: 'geojson', data: this.tracks });
        
        // Add Source for Preview
        this.map.addSource('preview-source', { type: 'geojson', data: this.previewTrack });

        // --- Track Appearance (Real Scale Approximations) ---
        // 1. Base Layer (Gray bed)
        this.map.addLayer({
            id: 'tracks-base',
            type: 'line',
            source: 'tracks-source',
            paint: {
                'line-color': '#808080',
                // Interpolate line width to approximate real-world scaling at deep zoom
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 18, 12, 22, 40]
            }
        });

        // 2. Rails (Black, 1435mm gauge simulated using offsets)
        this.map.addLayer({
            id: 'tracks-rail-left',
            type: 'line',
            source: 'tracks-source',
            paint: {
                'line-color': '#000000',
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 18, 2, 22, 4],
                'line-offset': ['interpolate', ['linear'], ['zoom'], 10, -0.5, 18, -3, 22, -10]
            }
        });
        
        this.map.addLayer({
            id: 'tracks-rail-right',
            type: 'line',
            source: 'tracks-source',
            paint: {
                'line-color': '#000000',
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 18, 2, 22, 4],
                'line-offset': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 18, 3, 22, 10]
            }
        });

        // Preview Layer (Dashed blue)
        this.map.addLayer({
            id: 'preview-line',
            type: 'line',
            source: 'preview-source',
            paint: {
                'line-color': '#007bff',
                'line-width': 4,
                'line-dasharray': [2, 2]
            }
        });
    }

    updatePreviewLayer(geoJSON) {
        this.previewTrack = turf.featureCollection([geoJSON]);
        this.map.getSource('preview-source').setData(this.previewTrack);
    }

    getPreviewData() {
        return this.previewTrack.features[0];
    }

    clearPreview() {
        this.previewTrack = turf.featureCollection([]);
        this.map.getSource('preview-source').setData(this.previewTrack);
    }

    commitTrack(feature) {
        this.tracks.features.push(feature);
        this.map.getSource('tracks-source').setData(this.tracks);
    }

    getTracks() {
        return this.tracks;
    }
}
