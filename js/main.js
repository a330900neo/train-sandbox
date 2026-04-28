const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Game State & Constants ---
const GAUGE = 1.435; // 1435mm Standard Gauge
const BASE_WIDTH = 3.0; // Gray track base width
let camera = { x: 0, y: 0, zoom: 10 }; // 10 pixels per meter
let mode = 'build'; // 'build' or 'select'

let tracks = []; // Array of track segments
let nodes = [];  // Connection points
let selectedTracks = new Set();

// Building State
let preview = {
    active: false,
    start: null, // {x, y, angle, nodeRef}
    end: null,
    segments: [],
    dragging: null, // 'start' or 'end'
    dubins: { r1: 300, r2: 300, flip1: 1, flip2: 1 }
};

// Input State
let isPanning = false;
let lastPointer = { x: 0, y: 0 };
let touchDist = 0;

// --- Initialization ---
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
window.addEventListener('resize', resize);
resize();

// --- Math & Geometry Helpers ---
function dist(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y); }
function normalizeAngle(a) {
    while (a < -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
}
function screenToWorld(sx, sy) {
    return { x: (sx - canvas.width / 2) / camera.zoom + camera.x, y: (sy - canvas.height / 2) / camera.zoom + camera.y };
}
function worldToScreen(wx, wy) {
    return { x: (wx - camera.x) * camera.zoom + canvas.width / 2, y: (wy - camera.y) * camera.zoom + canvas.height / 2 };
}

// --- Track Generation Logic ---
function calculateMaxSpeed(radius) {
    if (radius > 25000) return 160;
    let speed = 4.5 * Math.sqrt(radius);
    return Math.min(160, Math.max(20, Math.round(speed)));
}

function createStraight(p1, p2) {
    let length = dist(p1, p2);
    let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return { type: 'straight', start: p1, end: p2, length, radius: Infinity, startAngle: angle, endAngle: angle, maxSpeed: 160 };
}

function createArc(p1, dir1, p2) {
    let nx = -Math.sin(dir1), ny = Math.cos(dir1);
    let dx = p2.x - p1.x, dy = p2.y - p1.y;
    let dot = dx * nx + dy * ny;

    if (Math.abs(dot) < 0.001) return createStraight(p1, p2);

    let r = (dx * dx + dy * dy) / (2 * dot);
    if (Math.abs(r) > 25000) return createStraight(p1, p2);

    let cx = p1.x + r * nx, cy = p1.y + r * ny;
    let startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    let endAngle = Math.atan2(p2.y - cy, p2.x - cx);

    let ccw = r < 0;
    let diff = normalizeAngle(endAngle - startAngle);
    if (ccw && diff > 0) diff -= Math.PI * 2;
    if (!ccw && diff < 0) diff += Math.PI * 2;

    let length = Math.abs(r * diff);
    let outEndAngle = endAngle + (ccw ? -Math.PI / 2 : Math.PI / 2);

    return { type: 'arc', start: p1, end: p2, center: { x: cx, y: cy }, radius: Math.abs(r), startAngle, endAngle, ccw, length, outEndAngle: normalizeAngle(outEndAngle), maxSpeed: calculateMaxSpeed(Math.abs(r)) };
}

function createDubins(p1, dir1, p2, dir2, r1, r2, flip1, flip2) {
    let c1 = { x: p1.x + Math.cos(dir1 + flip1 * Math.PI / 2) * r1, y: p1.y + Math.sin(dir1 + flip1 * Math.PI / 2) * r1 };
    let c2 = { x: p2.x + Math.cos(dir2 + flip2 * Math.PI / 2) * r2, y: p2.y + Math.sin(dir2 + flip2 * Math.PI / 2) * r2 };
    let d = dist(c1, c2);
    if (d < 0.001) return null;

    let angleC1C2 = Math.atan2(c2.y - c1.y, c2.x - c1.x);
    let tAngle1, tAngle2;

    if (flip1 === flip2) {
        if (d < Math.abs(r1 - r2)) return null;
        let theta = Math.acos((r1 - r2) / d);
        tAngle1 = angleC1C2 + flip1 * theta;
        tAngle2 = tAngle1;
    } else {
        if (d < r1 + r2) return null;
        let theta = Math.acos((r1 + r2) / d);
        tAngle1 = angleC1C2 + flip1 * theta;
        tAngle2 = tAngle1;
    }

    let t1 = { x: c1.x + Math.cos(tAngle1 - flip1 * Math.PI / 2) * r1, y: c1.y + Math.sin(tAngle1 - flip1 * Math.PI / 2) * r1 };
    let t2 = { x: c2.x + Math.cos(tAngle2 - flip2 * Math.PI / 2) * r2, y: c2.y + Math.sin(tAngle2 - flip2 * Math.PI / 2) * r2 };

    let arc1 = createArc(p1, dir1, t1);
    let straight = createStraight(t1, t2);
    let arc2 = createArc(t2, normalizeAngle(tAngle2), p2); // Force tangent

    return [arc1, straight, arc2];
}

function updatePreview() {
    if (!preview.start || !preview.end) return;

    let s = preview.start, e = preview.end;
    preview.segments = [];

    if (s.angle !== undefined && e.angle !== undefined) {
        // Dubins Path
        document.getElementById('dubins-menu').classList.remove('hidden');
        let d = preview.dubins;
        let segs = createDubins(s, s.angle, e, e.angle, d.r1, d.r2, d.flip1, d.flip2);
        if (segs) preview.segments = segs;
    } else if (s.angle !== undefined) {
        document.getElementById('dubins-menu').classList.add('hidden');
        preview.segments = [createArc(s, s.angle, e)];
    } else {
        document.getElementById('dubins-menu').classList.add('hidden');
        preview.segments = [createStraight(s, e)];
    }

    // Update UI Info
    let totalLen = 0, minR = Infinity, minSpd = 160;
    preview.segments.forEach(seg => {
        totalLen += seg.length;
        if (seg.radius < minR) minR = seg.radius;
        if (seg.maxSpeed < minSpd) minSpd = seg.maxSpeed;
    });

    document.getElementById('info-length').innerText = totalLen.toFixed(1);
    document.getElementById('info-radius').innerText = minR === Infinity ? 'Straight' : minR.toFixed(1);
    document.getElementById('info-speed').innerText = minSpd;
}

// --- Snapping Logic ---
function getSnap(wx, wy) {
    let snapDist = 15 / camera.zoom; // 15 pixels snap radius
    let best = { x: wx, y: wy, angle: undefined, nodeRef: null };
    let minDist = snapDist;

    // Snap to Nodes
    for (let n of nodes) {
        let d = dist({ x: wx, y: wy }, n);
        if (d < minDist) {
            minDist = d;
            best = { x: n.x, y: n.y, angle: n.angle, nodeRef: n };
        }
    }

    // Snap to Parallel (if no node snapped)
    if (minDist === snapDist) {
        let offset = parseFloat(document.getElementById('parallel-offset').value);
        for (let t of tracks) {
            if (t.type === 'straight') {
                let dx = t.end.x - t.start.x, dy = t.end.y - t.start.y;
                let len = Math.hypot(dx, dy);
                let nx = -dy / len, ny = dx / len;
                let px = wx - t.start.x, py = wy - t.start.y;
                let dot = px * nx + py * ny;

                if (Math.abs(Math.abs(dot) - offset) < snapDist) {
                    let sign = dot > 0 ? 1 : -1;
                    best.x = wx - (dot - offset * sign) * nx;
                    best.y = wy - (dot - offset * sign) * ny;
                    best.angle = t.startAngle;
                    break;
                }
            } else if (t.type === 'arc') {
                let dCenter = dist({ x: wx, y: wy }, t.center);
                if (Math.abs(Math.abs(dCenter - t.radius) - offset) < snapDist) {
                    let sign = dCenter > t.radius ? 1 : -1;
                    let targetR = t.radius + offset * sign;
                    let ang = Math.atan2(wy - t.center.y, wx - t.center.x);
                    best.x = t.center.x + Math.cos(ang) * targetR;
                    best.y = t.center.y + Math.sin(ang) * targetR;
                    best.angle = ang + (t.ccw ? -Math.PI / 2 : Math.PI / 2);
                    break;
                }
            }
        }
    }
    return best;
}

// --- Input Handling ---
canvas.addEventListener('pointerdown', e => {
    let w = screenToWorld(e.clientX, e.clientY);
    lastPointer = { x: e.clientX, y: e.clientY };

    if (e.button === 1 || e.button === 2) {
        isPanning = true;
        return;
    }

    if (mode === 'build') {
        if (preview.active) {
            // Check if dragging start or end
            if (dist(w, preview.start) < 20 / camera.zoom) preview.dragging = 'start';
            else if (dist(w, preview.end) < 20 / camera.zoom) preview.dragging = 'end';
            else {
                // Click outside, maybe restart preview
                preview.active = false;
                document.getElementById('preview-info').classList.add('hidden');
                document.getElementById('dubins-menu').classList.add('hidden');
            }
        }

        if (!preview.active) {
            let snap = getSnap(w.x, w.y);
            preview.start = snap;
            preview.end = { x: w.x + 0.1, y: w.y + 0.1, angle: undefined }; // Temp end
            preview.active = true;
            preview.dragging = 'end';
            document.getElementById('preview-info').classList.remove('hidden');
        }
    } else if (mode === 'select') {
        // Simple selection logic (bounding box / distance)
        let clicked = null;
        for (let t of tracks) {
            let d = Infinity;
            if (t.type === 'straight') {
                let midX = (t.start.x + t.end.x) / 2, midY = (t.start.y + t.end.y) / 2;
                d = dist(w, { x: midX, y: midY });
            } else {
                let dCenter = dist(w, t.center);
                if (Math.abs(dCenter - t.radius) < 5) d = 0; // rough hit
            }
            if (d < 10 / camera.zoom || d === 0) clicked = t;
        }

        if (clicked) {
            if (e.shiftKey) selectedTracks.add(clicked);
            else { selectedTracks.clear(); selectedTracks.add(clicked); }
            showSelectionMenu(clicked);
        } else {
            selectedTracks.clear();
            document.getElementById('selection-menu').classList.add('hidden');
        }
    }
    draw();
});

canvas.addEventListener('pointermove', e => {
    if (isPanning) {
        camera.x -= (e.clientX - lastPointer.x) / camera.zoom;
        camera.y -= (e.clientY - lastPointer.y) / camera.zoom;
        lastPointer = { x: e.clientX, y: e.clientY };
        draw();
        return;
    }

    if (mode === 'build' && preview.active && preview.dragging) {
        let w = screenToWorld(e.clientX, e.clientY);
        let snap = getSnap(w.x, w.y);
        preview[preview.dragging] = snap;
        updatePreview();
        draw();
    }
});

canvas.addEventListener('pointerup', e => {
    isPanning = false;
    if (preview.dragging) preview.dragging = null;
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('wheel', e => {
    let wBefore = screenToWorld(e.clientX, e.clientY);
    camera.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    camera.zoom = Math.max(0.5, Math.min(camera.zoom, 100));
    let wAfter = screenToWorld(e.clientX, e.clientY);
    camera.x += wBefore.x - wAfter.x;
    camera.y += wBefore.y - wAfter.y;
    draw();
});

// Touch Zoom (Pinch)
canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
        touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
});
canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
        let newDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        let center = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        let wBefore = screenToWorld(center.x, center.y);

        camera.zoom *= newDist / touchDist;
        touchDist = newDist;

        let wAfter = screenToWorld(center.x, center.y);
        camera.x += wBefore.x - wAfter.x;
        camera.y += wBefore.y - wAfter.y;
        draw();
    }
});

// --- UI Actions ---
document.getElementById('btn-build').onclick = () => setMode('build');
document.getElementById('btn-select').onclick = () => setMode('select');

function setMode(m) {
    mode = m;
    document.getElementById('btn-build').classList.toggle('active', m === 'build');
    document.getElementById('btn-select').classList.toggle('active', m === 'select');
    if (m !== 'build') {
        preview.active = false;
        document.getElementById('preview-info').classList.add('hidden');
        document.getElementById('dubins-menu').classList.add('hidden');
    }
    draw();
}

document.getElementById('btn-confirm').onclick = () => {
    if (!preview.active || preview.segments.length === 0) return;
    let layer = parseInt(document.getElementById('current-layer').value);

    preview.segments.forEach(seg => {
        seg.layer = layer;
        seg.platform = 'none';
        seg.platformWidth = 3;
        seg.isTurnback = false;
        seg.oneWay = false;
        tracks.push(seg);
    });

    // Add nodes
    let s = preview.segments[0];
    let e = preview.segments[preview.segments.length - 1];
    if (!preview.start.nodeRef) nodes.push({ x: s.start.x, y: s.start.y, angle: s.startAngle });
    if (!preview.end.nodeRef) nodes.push({ x: e.end.x, y: e.end.y, angle: e.outEndAngle || e.endAngle });

    preview.active = false;
    document.getElementById('preview-info').classList.add('hidden');
    document.getElementById('dubins-menu').classList.add('hidden');
    draw();
};

document.getElementById('btn-cancel').onclick = () => {
    preview.active = false;
    document.getElementById('preview-info').classList.add('hidden');
    document.getElementById('dubins-menu').classList.add('hidden');
    draw();
};

// Dubins UI
document.getElementById('dubins-r1').oninput = e => { preview.dubins.r1 = parseFloat(e.target.value); updatePreview(); draw(); };
document.getElementById('dubins-r2').oninput = e => { preview.dubins.r2 = parseFloat(e.target.value); updatePreview(); draw(); };
document.getElementById('btn-flip1').onclick = () => { preview.dubins.flip1 *= -1; updatePreview(); draw(); };
document.getElementById('btn-flip2').onclick = () => { preview.dubins.flip2 *= -1; updatePreview(); draw(); };

// Selection UI
function showSelectionMenu(track) {
    document.getElementById('selection-menu').classList.remove('hidden');
    document.getElementById('sel-speed').value = track.maxSpeed;
    document.getElementById('sel-turnback').checked = track.isTurnback;
    document.getElementById('sel-oneway').checked = track.oneWay;
    document.getElementById('sel-platform').value = track.platform;
    document.getElementById('sel-plat-width').value = track.platformWidth;
}

document.getElementById('btn-apply-sel').onclick = () => {
    selectedTracks.forEach(t => {
        t.maxSpeed = parseInt(document.getElementById('sel-speed').value);
        t.isTurnback = document.getElementById('sel-turnback').checked;
        t.oneWay = document.getElementById('sel-oneway').checked;
        t.platform = document.getElementById('sel-platform').value;
        t.platformWidth = parseFloat(document.getElementById('sel-plat-width').value);
    });
    draw();
};

document.getElementById('btn-delete-sel').onclick = () => {
    selectedTracks.forEach(t => {
        tracks = tracks.filter(tr => tr !== t);
    });
    selectedTracks.clear();
    document.getElementById('selection-menu').classList.add('hidden');
    draw();
};

document.getElementById('btn-rev-dir').onclick = () => {
    selectedTracks.forEach(t => {
        let temp = t.start; t.start = t.end; t.end = temp;
        if (t.type === 'arc') t.ccw = !t.ccw;
    });
    draw();
};

// --- Rendering ---
function drawSegmentPath(seg, offset = 0) {
    if (seg.type === 'straight') {
        let dx = seg.end.x - seg.start.x, dy = seg.end.y - seg.start.y;
        let len = Math.hypot(dx, dy);
        let nx = -dy / len, ny = dx / len;
        ctx.moveTo(seg.start.x + nx * offset, seg.start.y + ny * offset);
        ctx.lineTo(seg.end.x + nx * offset, seg.end.y + ny * offset);
    } else {
        let r = seg.radius + (seg.ccw ? -offset : offset);
        ctx.arc(seg.center.x, seg.center.y, r, seg.startAngle, seg.endAngle, seg.ccw);
    }
}

function drawTrackLayer(layerTracks, isPreview = false) {
    ctx.lineCap = 'butt';

    // 1. Draw Platforms (Underneath)
    layerTracks.forEach(t => {
        if (t.platform && t.platform !== 'none') {
            ctx.beginPath();
            let pOff = BASE_WIDTH / 2 + t.platformWidth / 2;
            if (t.platform === 'left' || t.platform === 'both') drawSegmentPath(t, -pOff);
            if (t.platform === 'right' || t.platform === 'both') {
                if (t.platform !== 'both') ctx.beginPath();
                drawSegmentPath(t, pOff);
            }
            ctx.strokeStyle = '#ddccaa';
            ctx.lineWidth = t.platformWidth;
            ctx.stroke();
        }
    });

    // 2. Draw Gray Base
    ctx.beginPath();
    layerTracks.forEach(t => drawSegmentPath(t, 0));
    ctx.strokeStyle = isPreview ? 'rgba(150, 200, 250, 0.6)' : '#888';
    ctx.lineWidth = BASE_WIDTH;
    ctx.stroke();

    // 3. Draw Rails (Black)
    ctx.beginPath();
    layerTracks.forEach(t => {
        drawSegmentPath(t, -GAUGE / 2);
        drawSegmentPath(t, GAUGE / 2);
    });
    ctx.strokeStyle = isPreview ? '#0055ff' : '#111';
    ctx.lineWidth = 0.2;
    ctx.stroke();

    // 4. Draw Selection Highlight
    if (!isPreview) {
        ctx.beginPath();
        layerTracks.forEach(t => {
            if (selectedTracks.has(t)) drawSegmentPath(t, 0);
        });
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.lineWidth = BASE_WIDTH + 1;
        ctx.stroke();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Sort tracks by layer to ensure higher layers draw on top
    let layers = [1, 2, 3];
    layers.forEach(l => {
        let layerTracks = tracks.filter(t => t.layer === l);
        if (layerTracks.length > 0) drawTrackLayer(layerTracks);
    });

    // Draw Preview
    if (preview.active && preview.segments.length > 0) {
        drawTrackLayer(preview.segments, true);

        // Draw drag handles
        ctx.fillStyle = 'red';
        ctx.beginPath(); ctx.arc(preview.start.x, preview.start.y, 5 / camera.zoom, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'blue';
        ctx.beginPath(); ctx.arc(preview.end.x, preview.end.y, 5 / camera.zoom, 0, Math.PI * 2); ctx.fill();
    }

    // Draw Nodes
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 / camera.zoom;
    nodes.forEach(n => {
        ctx.beginPath(); ctx.arc(n.x, n.y, 2 / camera.zoom, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    ctx.restore();
}

  