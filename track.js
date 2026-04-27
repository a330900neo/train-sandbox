class Track {
    constructor(startNode, endNode, type = 'straight') {
        this.id = Date.now() + Math.random();
        this.startNode = startNode; // {x, y, dir} in Projected Meters
        this.endNode = endNode;
        this.type = type; 
        
        // Path sub-segments (for Dubins: Arc, Straight, Arc)
        this.segments = []; 
        
        // Properties
        this.layer = 1;
        this.isRamp = false;
        this.maxSpeed = 160;
        this.platform = 'none'; // 'none', 'left', 'right', 'both'
        this.platformWidth = 3; // meters
        this.isOneWay = false;
        this.isTurnback = false;
        
        this.selected = false;
    }

    // Render track on canvas
    draw(ctx, map) {
        // Project meter coordinates to screen pixels
        let p1LatLng = map.unproject(this.startNode, map.getMaxZoom());
        let p2LatLng = map.unproject(this.endNode, map.getMaxZoom());
        
        let p1Screen = map.latLngToContainerPoint(p1LatLng);
        let p2Screen = map.latLngToContainerPoint(p2LatLng);

        // Visual Selection Highlight
        if (this.selected) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y);
            ctx.lineTo(p2Screen.x, p2Screen.y);
            ctx.stroke();
        }

        // Draw physical track gauge (1.435m)
        // Calculate pixel size of 1 meter at current zoom
        let metersPerPixel = 40075016.686 * Math.abs(Math.cos(p1LatLng.lat * Math.PI/180)) / Math.pow(2, map.getZoom() + 8);
        let gaugePixels = Math.max(1.435 / metersPerPixel, 2); // Minimum 2px for visibility

        // Main track center line
        ctx.strokeStyle = '#222';
        ctx.lineWidth = gaugePixels;
        ctx.beginPath();
        ctx.moveTo(p1Screen.x, p1Screen.y);
        ctx.lineTo(p2Screen.x, p2Screen.y);
        ctx.stroke();

        // Draw platforms if they exist
        if (this.platform !== 'none') {
            let platPixels = Math.max(this.platformWidth / metersPerPixel, 4);
            ctx.strokeStyle = '#aaaaaa';
            ctx.lineWidth = platPixels;
            // Geometry offset left/right based on normal vector goes here
            // We draw over the center for the basic prototype
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(p1Screen.x, p1Screen.y + gaugePixels);
            ctx.lineTo(p2Screen.x, p2Screen.y + gaugePixels);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}
