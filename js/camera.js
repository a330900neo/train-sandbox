export class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.zoom = 10; // 10 pixels per meter makes a 3.2m track 32px wide
        
        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - window.innerWidth / 2) / this.zoom + this.x,
            y: (screenY - window.innerHeight / 2) / this.zoom + this.y
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.x) * this.zoom + window.innerWidth / 2,
            y: (worldY - this.y) * this.zoom + window.innerHeight / 2
        };
    }

    handlePanStart(x, y) {
        this.isDragging = true;
        this.lastX = x;
        this.lastY = y;
    }

    handlePanMove(x, y) {
        if (!this.isDragging) return;
        const dx = x - this.lastX;
        const dy = y - this.lastY;
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
        this.lastX = x;
        this.lastY = y;
    }

    handlePanEnd() {
        this.isDragging = false;
    }

    handleZoom(delta, mouseX, mouseY) {
        const worldBefore = this.screenToWorld(mouseX, mouseY);
        
        const zoomFactor = 1.1;
        if (delta > 0) this.zoom /= zoomFactor;
        else this.zoom *= zoomFactor;
        
        // Cap zoom
        this.zoom = Math.max(0.5, Math.min(this.zoom, 100));

        const worldAfter = this.screenToWorld(mouseX, mouseY);
        this.x -= (worldAfter.x - worldBefore.x);
        this.y -= (worldAfter.y - worldBefore.y);
    }
}
