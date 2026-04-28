const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const camera = new Camera(canvas);
const editor = new Editor(camera);

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Center camera initially mapping screen center to 0,0 world
    camera.x = 0; camera.y = 0;
}
window.addEventListener('resize', resize);
resize();

// Input Handling
let isPointersDown = 0;
let lastPointers = [];

canvas.addEventListener('pointerdown', e => {
    isPointersDown++;
    lastPointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
    if (isPointersDown === 1) {
        editor.handleDown(e.clientX, e.clientY);
        camera.isDragging = editor.dragNode === null; // Pan if not dragging node
        camera.lastX = e.clientX; camera.lastY = e.clientY;
    }
});

canvas.addEventListener('pointermove', e => {
    const pIdx = lastPointers.findIndex(p => p.id === e.pointerId);
    if (pIdx > -1) { lastPointers[pIdx].x = e.clientX; lastPointers[pIdx].y = e.clientY; }

    if (isPointersDown === 1) {
        if (camera.isDragging) {
            camera.handlePan(e.clientX - camera.lastX, e.clientY - camera.lastY);
            camera.lastX = e.clientX; camera.lastY = e.clientY;
        } else {
            editor.handleMove(e.clientX, e.clientY);
        }
    } else if (isPointersDown === 2) {
        // Pinch zoom
        const dx = lastPointers[0].x - lastPointers[1].x;
        const dy = lastPointers[0].y - lastPointers[1].y;
        const dist = Math.hypot(dx, dy);
        if (camera.lastDist) {
            const delta = camera.lastDist - dist;
            camera.handleZoom(delta, (lastPointers[0].x + lastPointers[1].x) / 2, (lastPointers[0].y + lastPointers[1].y) / 2);
        }
        camera.lastDist = dist;
    }
});

canvas.addEventListener('pointerup', e => {
    isPointersDown--;
    lastPointers = lastPointers.filter(p => p.id !== e.pointerId);
    if (isPointersDown < 2) camera.lastDist = null;
    if (isPointersDown === 0) { camera.isDragging = false; editor.handleUp(); }
});

canvas.addEventListener('wheel', e => {
    camera.handleZoom(e.deltaY, e.clientX, e.clientY);
});

// UI Bindings
document.getElementById('btn-build').onclick = () => {
    editor.state = STATE.BUILD_P1;
    document.getElementById('info-panel').classList.remove('hidden');
    document.getElementById('selection-panel').classList.add('hidden');
};
document.getElementById('btn-select').onclick = () => {
    editor.state = STATE.SELECT;
    editor.cancelBuild();
};
document.getElementById('btn-confirm').onclick = () => editor.confirmBuild();
document.getElementById('btn-cancel').onclick = () => editor.cancelBuild();

// Dubins Update
const updateDubins = () => {
    editor.dubinSettings.flip1 = document.getElementById('dubin-flip-start').checked;
    editor.dubinSettings.flip2 = document.getElementById('dubin-flip-end').checked;
    editor.dubinSettings.r1 = parseFloat(document.getElementById('dubin-rad-start').value);
    editor.dubinSettings.r2 = parseFloat(document.getElementById('dubin-rad-end').value);
    editor.updatePreview();
};
['dubin-flip-start', 'dubin-flip-end', 'dubin-rad-start', 'dubin-rad-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateDubins);
});

document.getElementById('setting-parallel').addEventListener('change', (e) => editor.parallelDist = parseFloat(e.target.value));

// Render Loop
function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    const step = 10 * camera.zoom;
    const ox = (canvas.width / 2 - camera.x * camera.zoom) % step;
    const oy = (canvas.height / 2 - camera.y * camera.zoom) % step;
    ctx.beginPath();
    for (let x = ox; x < canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = oy; y < canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();

    editor.render(ctx);
    requestAnimationFrame(loop);
}
loop();