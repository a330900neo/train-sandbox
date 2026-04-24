function setupInputs() {
    let pointers = [];
    let initialPinchDist = null;
     // Stop touches on the dropdown menu from bleeding into the game
    const connMode = document.getElementById('connMode'); // Ensure this matches your <select> ID

    if (connMode) {
      connMode.addEventListener('pointerdown', (e) => e.stopPropagation());
      connMode.addEventListener('touchstart', (e) => e.stopPropagation());
    }

    canvas.addEventListener('pointerdown', (e) => {
        // CRITICAL: Force the canvas to track this finger even if it slides slightly off-screen
        canvas.setPointerCapture(e.pointerId); 
        
        // Prevent duplicate pointers in the array just in case
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        pointers.push(e);

        const worldPt = camera.screenToWorld(e.clientX, e.clientY);

        if (pointers.length === 1) {
            // First finger down: Start pan or build
            if (state.currentTool === 'track') {
                if (!builder.handlePointerDown(worldPt)) {
                    camera.handlePanStart(e.clientX, e.clientY);
                }
            } else if (state.currentTool === 'pan') {
                camera.handlePanStart(e.clientX, e.clientY);
            } else if (state.currentTool === 'select' || state.currentTool === 'multiselect') {
                handleSelection(worldPt);
            }
        } else if (pointers.length === 2) {
            // Second finger down: Stop panning immediately so we don't jump when zooming
            camera.handlePanEnd(); 
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        const index = pointers.findIndex(p => p.pointerId === e.pointerId);
        if (index !== -1) pointers[index] = e; // Update the pointer's current position

        if (pointers.length === 2) {
            // --- MOBILE PINCH ZOOM LOGIC ---
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

        } else if (pointers.length === 1) {
            // --- SINGLE FINGER LOGIC ---
            initialPinchDist = null; 
            
            const worldPt = camera.screenToWorld(e.clientX, e.clientY);
            if (builder.isDraggingHandle) {
                builder.handlePointerMove(worldPt);
                if (typeof updatePreviewText === 'function') updatePreviewText();
            } else if (camera.isDragging) {
                camera.handlePanMove(e.clientX, e.clientY);
            }
        }
    });

    // Unified function to handle lifting a finger or losing tracking
    const handlePointerEnd = (e) => {
        pointers = pointers.filter(p => p.pointerId !== e.pointerId);
        canvas.releasePointerCapture(e.pointerId);
        
        if (pointers.length < 2) {
            initialPinchDist = null;
        }

        if (pointers.length === 1) {
            // If we lifted one finger of a pinch, cleanly resume panning with the remaining finger
            camera.handlePanStart(pointers[0].clientX, pointers[0].clientY);
        } else if (pointers.length === 0) {
            // No fingers left
            builder.handlePointerUp();
            camera.handlePanEnd();
        }
    };

    // Catch all ways a touch can end
    canvas.addEventListener('pointerup', handlePointerEnd);
    canvas.addEventListener('pointercancel', handlePointerEnd);
    canvas.addEventListener('pointerout', handlePointerEnd);

    canvas.addEventListener('wheel', (e) => {
        camera.handleZoom(e.deltaY, e.clientX, e.clientY);
    });
}
