import { State } from './state.js';
import { Camera } from './camera.js';
import { MathUtils } from './math.js';

export const Tools = {
    init() {
        document.querySelectorAll('.toolbar button').forEach(btn => {
            if (btn.id.startsWith('btn-tool')) {
                btn.addEventListener('click', (e) => this.switchTool(e.target));
            }
        });

        document.getElementById('toggle-snap').addEventListener('change', e => {
            State.snapping = e.target.checked;
        });

        document.getElementById('btn-confirm-build').addEventListener('click', () => this.confirmBuild());
        document.getElementById('btn-cancel-build').addEventListener('click', () => this.cancelBuild());
    },

    switchTool(btn) {
        document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.currentTool = btn.id.replace('btn-tool-', '');
        
        if (State.currentTool !== 'build') this.cancelBuild();
    },

    handlePointerDown(worldPos) {
        if (State.currentTool === 'build') {
            if (!State.preview.active) {
                // Start building
                let snap = MathUtils.findSnapPoint(worldPos);
                State.preview.p1 = snap || { ...worldPos, z: 0, dir: null };
                State.preview.p2 = { ...State.preview.p1 };
                State.preview.active = true;
                State.preview.dragging = 'p2';
                document.getElementById('preview-panel').classList.remove('hidden');
            } else {
                // Check if clicking near existing preview points to drag them
                if (MathUtils.dist(worldPos, State.preview.p1) < 2) State.preview.dragging = 'p1';
                else if (MathUtils.dist(worldPos, State.preview.p2) < 2) State.preview.dragging = 'p2';
                else State.preview.dragging = 'p2'; // Default drag p2
            }
        }
    },

    handlePointerMove(worldPos) {
        if (State.currentTool === 'build' && State.preview.active && State.preview.dragging) {
            let snap = MathUtils.findSnapPoint(worldPos);
            let target = snap || { ...worldPos, z: parseFloat(document.getElementById('track-height').value), dir: null };
            
            if (State.preview.dragging === 'p1') State.preview.p1 = target;
            if (State.preview.dragging === 'p2') State.preview.p2 = target;
            
            this.updatePreviewStats();
        }
    },

    handlePointerUp() {
        if (State.preview.dragging) State.preview.dragging = null;
    },

    updatePreviewStats() {
        const path = MathUtils.calculatePath(State.preview.p1, State.preview.p2);
        if (!path) return;
        
        let radiusText = path.type === 'straight' ? 'Straight' : Math.round(path.radius) + 'm';
        let speedText = path.type === 'straight' ? '350' : Math.min(350, Math.round(Math.sqrt(path.radius) * 10));
        let gradText = Math.abs(State.preview.p2.z - State.preview.p1.z) / path.length * 100;

        document.getElementById('preview-stats').innerHTML = 
            `Radius: ${radiusText}<br>Max Speed: ${speedText} km/h<br>Gradient: ${gradText.toFixed(1)}%`;
    },

    confirmBuild() {
        const path = MathUtils.calculatePath(State.preview.p1, State.preview.p2);
        if (path) {
            path.startDir = State.preview.p1.dir || Math.atan2(path.p2.y - path.p1.y, path.p2.x - path.p1.x);
            path.endDir = MathUtils.getEndTangent(path);
            State.tracks.push(path);
        }
        this.cancelBuild();
    },

    cancelBuild() {
        State.preview.active = false;
        State.preview.dragging = null;
        document.getElementById('preview-panel').classList.add('hidden');
    }
};
