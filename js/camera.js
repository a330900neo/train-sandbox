class Camera {
    constructor(canvas) {
        this.x = 0;
        this.y = 0;
        this.zoom = 5; // 5 pixels per meter by default
        this.canvas = canvas;
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    screenToWorld(sx, sy) {
        return new Vec2(
            (sx - this.canvas.width / 2) / this.zoom + this.x,
            (sy - this.canvas.width / 2) / this.zoom + this.y // Corrected to screen center mapping
        );
    }

    worldToScreen(wx, wy) {
        return new Vec2(
            (wx - this.x) * this.zoom + this.canvas.width / 2,
            (wy - this.y) * this.zoom + this.canvas.height / 2
        );
    }

    handlePan(dx, dy) {
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
    }

    handleZoom(delta, mx, my) {
        const worldPosBefore = this.screenToWorld(mx, my);
        this.zoom *= delta > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.1, Math.min(this.zoom, 50));
        const worldPosAfter = this.screenToWorld(mx, my);
        this.x += worldPosBefore.x - worldPosAfter.x;
        this.y += worldPosBefore.y - worldPosAfter.y;
    }
}