function setupInputs() {
    let pointers = [];
    let initialPinchDist = null;

    canvas.addEventListener('pointerdown', (e) => {
        pointers.push(e);
        const worldPt = camera.screenToWorld(e.clientX, e.clientY);

        if (state.currentTool === 'track') {
            if (!builder.handlePointerDown(worldPt)) {
                camera.handlePanStart(e.clientX, e.clientY);
            }
        } else if (state.currentTool === 'pan') {
            camera.handlePanStart(e.clientX, e.clientY);
        } else if (state.currentTool === 'select' || state.currentTool === 'multiselect') {
            handleSelection(worldPt);
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const index = pointers.findIndex(p => p.pointerId === e.pointerId);
        if (index !== -1) pointers[index] = e;

        if (pointers.length === 2) {
            // MOBILE PINCH ZOOM LOGIC
            const dx = pointers[0].clientX - pointers[1].clientX;
            const dy = pointers[0].clientY - pointers[1].clientY;
            const currentPinchDist = Math.hypot(dx, dy);
            const centerX = (pointers[0].clientX + pointers[1].clientX) / 2;
            const centerY = (pointers[0].clientY + pointers[1].clientY) / 2;

            if (initialPinchDist) {
                const scaleFactor = initialPinchDist / currentPinchDist;
                camera.handlePinchZoom(scaleFactor, centerX, centerY);
            }
            
            initialPinchDist = currentPinchDist;
        } else {
            initialPinchDist = null; // Reset pinch when fingers lift
            
            const worldPt = camera.screenToWorld(e.clientX, e.clientY);
            if (builder.isDraggingHandle) {
                builder.handlePointerMove(worldPt);
                updatePreviewText();
            } else if (camera.isDragging) {
                camera.handlePanMove(e.clientX, e.clientY);
            }
        }
    });

    canvas.addEventListener('pointerup', (e) => {
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        if (pointers.length < 2) initialPinchDist = null;
        
        builder.handlePointerUp();
        camera.handlePanEnd();
    });

    // To prevent touch from canceling unexpectedly on some mobile browsers
    canvas.addEventListener('pointercancel', (e) => {
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        initialPinchDist = null;
        builder.handlePointerUp();
        camera.handlePanEnd();
    });

    canvas.addEventListener('wheel', (e) => {
        camera.handleZoom(e.deltaY, e.clientX, e.clientY);
    });
}
