// Add these to your top-level const declarations
const connMode = document.getElementById('conn-mode');
const connRadius = document.getElementById('conn-radius');
const radiusContainer = document.getElementById('radius-container');

// Update setupMenus() to include the new UI listeners
function setupMenus() {
    // ... existing save/load/confirm bindings ...
    document.getElementById('btn-confirm').addEventListener('click', () => builder.confirm());
    document.getElementById('btn-cancel').addEventListener('click', () => document.getElementById('tool-pan').click());

    connMode.addEventListener('change', (e) => {
        builder.mode = e.target.value;
        if (e.target.value === 'arclinearc') radiusContainer.classList.remove('hidden');
        else radiusContainer.classList.add('hidden');
        builder.updatePreview();
    });

    connRadius.addEventListener('input', (e) => {
        builder.customRadius = parseFloat(e.target.value) || 500;
        builder.updatePreview();
    });
}

// Update updatePreviewText() to show length and handle the new data structure
function updatePreviewText() {
    const pt = builder.previewTrack;
    if (!pt) return;
    
    const speed = getMaxSpeed(pt.radius);
    const radiusText = pt.radius === Infinity ? 'Straight' : `${Math.round(pt.radius)}m`;
    const lengthText = `${Math.round(pt.totalLength)}m`;
    
    document.getElementById('preview-data').innerText = 
        `Len: ${lengthText} | Grad: 0% | Elev: ${builder.startP.h}m | Rad: ${radiusText} | Max: ${speed} km/h`;
}
