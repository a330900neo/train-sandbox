import { render } from './renderer.js';
import { initTools } from './tools.js';
import { initIO } from './io.js';
import { GameState } from './state.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// UI Buttons logic
// UI Buttons logic
document.querySelectorAll('.toolbar button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // 1. Handle one-off action buttons first
        if(e.target.id === 'btn-export' || e.target.id === 'btn-import') return;
        
        if(e.target.id === 'btn-delete') {
            GameState.deleteSelected();
            return; // Exit early so it doesn't change the active tool highlight
        }
        
        // 2. Handle tool switching and UI highlighting
        document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        const actionMap = {
            'btn-pan': 'pan',
            'btn-build-track': 'build_track',
            'btn-build-plat': 'build_plat',
            'btn-select': 'select',
            'btn-multi': 'multi'
        };
        GameState.currentTool = actionMap[e.target.id];
    });
});

document.getElementById('toggle-snap').addEventListener('change', (e) => {
    GameState.snapEnabled = e.target.checked;
});

// Init subsystems
initTools(canvas);
initIO();

// Game Loop
function loop() {
    render(ctx, canvas);
    requestAnimationFrame(loop);
}

loop();
