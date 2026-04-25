import { State } from './state.js';
import { Camera } from './camera.js';
import { initInput } from './input.js';
import { Tools } from './tools.js';
import { render } from './render.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Init Systems
Tools.init();
initInput(canvas);

// Data Management
document.getElementById('btn-save').addEventListener('click', () => {
    localStorage.setItem('trainSave', JSON.stringify(State.tracks));
    alert('Saved to local storage');
});
document.getElementById('btn-load').addEventListener('click', () => {
    const data = localStorage.getItem('trainSave');
    if (data) State.tracks = JSON.parse(data);
});
document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(State.tracks)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tracks.json';
    a.click();
});
document.getElementById('btn-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { State.tracks = JSON.parse(ev.target.result); };
        reader.readAsText(file);
    }
});

// Game Loop
function loop() {
    render(ctx, canvas);
    requestAnimationFrame(loop);
}
loop();
