export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.pointers = {};
        this.keys = {};
        this.wheelDelta = 0;
        this.isPanning = false;

        let addPointer = (id, e) => {
            let rect = canvas.getBoundingClientRect();
            this.pointers[id] = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                down: true,
                startX: e.clientX - rect.left,
                startY: e.clientY - rect.top,
                isMiddle: e.button === 1
            };
        };

        canvas.addEventListener('mousedown', e => { addPointer('mouse', e); });
        window.addEventListener('mousemove', e => {
            if (this.pointers['mouse']) {
                let rect = canvas.getBoundingClientRect();
                this.pointers['mouse'].x = e.clientX - rect.left;
                this.pointers['mouse'].y = e.clientY - rect.top;
            }
        });
        window.addEventListener('mouseup', e => { if (this.pointers['mouse']) this.pointers['mouse'].down = false; });

        canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            for (let t of e.changedTouches) addPointer(t.identifier, t);
        }, {passive: false});
        
        window.addEventListener('touchmove', e => {
            let rect = canvas.getBoundingClientRect();
            for (let t of e.changedTouches) {
                if (this.pointers[t.identifier]) {
                    this.pointers[t.identifier].x = t.clientX - rect.left;
                    this.pointers[t.identifier].y = t.clientY - rect.top;
                }
            }
        }, {passive: false});
        
        window.addEventListener('touchend', e => {
            for (let t of e.changedTouches) if (this.pointers[t.identifier]) this.pointers[t.identifier].down = false;
        });

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.wheelDelta += e.deltaY;
        }, {passive: false});
    }

    getPointer() {
        let active = Object.values(this.pointers).filter(p => p.down);
        return active.length > 0 ? active[0] : null;
    }

    clearReleased() {
        for (let id in this.pointers) {
            if (!this.pointers[id].down) delete this.pointers[id];
        }
        this.wheelDelta = 0;
    }
}