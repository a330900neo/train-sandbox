// Add inside your setupTools() or setupMenus() function in main.js:

const routeModeSelect = document.getElementById('route-mode');
const customRadiusContainer = document.getElementById('custom-radius-container');
const customRadiusInput = document.getElementById('custom-radius');

routeModeSelect.addEventListener('change', (e) => {
    builder.routeMode = e.target.value;
    if (e.target.value === 'asa') {
        customRadiusContainer.classList.remove('hidden');
    } else {
        customRadiusContainer.classList.add('hidden');
    }
    builder.updatePreview();
    updatePreviewText();
});

customRadiusInput.addEventListener('change', (e) => {
    builder.customRadius = parseFloat(e.target.value);
    builder.updatePreview();
    updatePreviewText();
});

// Replace your existing updatePreviewText() with this:
function updatePreviewText() {
    if (!builder.previewTracks || builder.previewTracks.length === 0) return;
    
    // Sum data for multiple segments (like Biarcs)
    let totalLength = 0;
    let minRadius = Infinity;
    
    builder.previewTracks.forEach(t => {
        totalLength += t.length;
        if (t.radius < minRadius) minRadius = t.radius;
    });

    const speed = getMaxSpeed(minRadius);
    const radiusText = minRadius === Infinity ? 'Straight' : `${Math.round(minRadius)}m`;
    
    previewData.innerText = `Len: ${Math.round(totalLength)}m | Grad: 0% | Elev: ${builder.startP.h}m | Min Rad: ${radiusText} | Max Spd: ${speed} km/h`;
}
