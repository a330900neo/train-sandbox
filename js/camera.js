import { State } from './state.js';

export const Camera = {
    x: 0, y: 0, zoom: 1,
    
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

    applyZoom(factor, cx, cy) {
        const worldBefore = this.screenToWorld(cx, cy);
        this.zoom = Math.max(0.1, Math.min(this.zoom * factor, 10));
        const worldAfter = this.screenToWorld(cx, cy);
        this.x += (worldBefore.x - worldAfter.x);
        this.y += (worldBefore.y - worldAfter.y);
    }
};
