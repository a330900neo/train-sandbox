export const Camera = {
    x: 0,
    y: 0,
    zoom: 5, // 1 meter = 5 pixels by default to see gauge clearly

    screenToWorld(sx, sy) {
        return {
            x: (sx - window.innerWidth / 2) / this.zoom + this.x,
            y: (sy - window.innerHeight / 2) / this.zoom + this.y
        };
    },

    worldToScreen(wx, wy) {
        return {
            x: (wx - this.x) * this.zoom + window.innerWidth / 2,
            y: (wy - this.y) * this.zoom + window.innerHeight / 2
        };
    },

    applyPan(dx, dy) {
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
    },

    applyZoom(factor, centerX, centerY) {
        const worldBefore = this.screenToWorld(centerX, centerY);
        this.zoom *= factor;
        // Clamp zoom
        if (this.zoom < 0.1) this.zoom = 0.1;
        if (this.zoom > 50) this.zoom = 50;
        const worldAfter = this.screenToWorld(centerX, centerY);
        
        // Adjust camera position to zoom to mouse
        this.x -= (worldAfter.x - worldBefore.x);
        this.y -= (worldAfter.y - worldBefore.y);
    }
};
