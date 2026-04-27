export class InputHandler {
    constructor(canvas, renderer) {
        this.renderer = renderer;
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.mouseWorld = { x: 0, y: 0 };
        this.onTap = null;

        canvas.addEventListener('mousedown', this.onDown.bind(this));
        canvas.addEventListener('mousemove', this.onMove.bind(this));
        window.addEventListener('mouseup', this.onUp.bind(this));
        canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

        // Basic Mobile Touch implementation
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.onDown(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); this.onMove(e.touches[0]); }, { passive: false });
        window.addEventListener('touchend', this.onUp.bind(this));
    }

    onDown(e) {
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        if(this.onTap) this.onTap(this.renderer.screenToWorld(e.clientX, e.clientY));
    }

    onMove(e) {
        this.mouseWorld = this.renderer.screenToWorld(e.clientX, e.clientY);
        if (this.isDragging && document.getElementById('btn-select').classList.contains('active')) {
            const dx = (e.clientX - this.lastMouse.x) / this.renderer.camera.zoom;
            const dy = (e.clientY - this.lastMouse.y) / this.renderer.camera.zoom;
            this.renderer.camera.x -= dx;
            this.renderer.camera.y -= dy;
        }
        this.lastMouse = { x: e.clientX, y: e.clientY };
    }

    onUp() {
        this.isDragging = false;
    }

    onWheel(e) {
        e.preventDefault();
        const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
        this.renderer.camera.zoom *= zoomAmount;
        // Clamp zoom to prevent floating point breakdown
        this.renderer.camera.zoom = Math.max(0.5, Math.min(this.renderer.camera.zoom, 100));
    }
}
