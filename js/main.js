const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- GAME & MAP STATE ---
const EARTH_R = 6378137;
const WORLD_SIZE = 2 * Math.PI * EARTH_R;

const startLon = 114.1694;
const startLat = 22.3193;
const startMx = startLon * EARTH_R * Math.PI / 180;
const startMy = -Math.log(Math.tan(Math.PI / 4 + startLat * Math.PI / 360)) * EARTH_R;

let tracks = [];
let nodes = [];
let mode = 'build';
let camera = { x: startMx, y: startMy, zoom: 0.5 };
let gauge = 1.435;

const tileCache = {};

const uiInfo = document.getElementById('ui-info');
const uiActions = document.getElementById('ui-actions');
const uiDubins = document.getElementById('ui-dubins');
const uiSelection = document.getElementById('ui-selection');

let preview = {
    active: false, valid: false,
    start: null, end: null,
    dubins: { r1: 500, r2: 500 },
    elevStart: 0, elevEnd: 0,
    geometry: []
};

let selectedTrackId = null;
let selectedNode = null;
let draggingPoint = null;

let pointers = new Map();
let lastPan = { x: 0, y: 0 };
let lastZoomDist = null;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- MATH & GEOMETRY UTILS ---
function dist(p1, p2) { return Math.hypot(p2.x - p1.x, p2.y - p1.y); }

function normalizeAngle(a) {
    let res = a % (2 * Math.PI);
    if (res <= -Math.PI) res += 2 * Math.PI;
    if (res > Math.PI) res -= 2 * Math.PI;
    return res;
}

function resolveNodeDir(nodeDir, targetPt, sourcePt, isEndNode) {
    let vecAngle = Math.atan2(targetPt.y - sourcePt.y, targetPt.x - sourcePt.x);
    return Math.abs(normalizeAngle(nodeDir - vecAngle)) < Math.PI / 2 ? nodeDir : normalizeAngle(nodeDir + Math.PI);
}

function calcArc(p1, dir1, p2) {
    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 0.001) return null;

    const nx = -Math.sin(dir1); const ny = Math.cos(dir1);
    const dot = dx * nx + dy * ny;
    if (Math.abs(dot) < 0.001) return { type: 'straight', length: Math.sqrt(l2), start: p1, end: p2, dir1, dir2: dir1 };

    const r = l2 / (2 * dot);
    const radius = Math.abs(r);
    if (radius > 25000) return { type: 'straight', length: Math.sqrt(l2), start: p1, end: p2, dir1, dir2: dir1 };

    const cx = p1.x + nx * r; const cy = p1.y + ny * r;
    const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

    return createArc(cx, cy, radius, p1, p2, startAngle, endAngle, r > 0 ? 1 : -1, dir1);
}

function createArc(cx, cy, radius, startPt, endPt, startAngle, endAngle, flip, startDir) {
    const ccw = flip === 1;
    let dTheta = endAngle - startAngle;
    if (ccw) {
        while (dTheta < 0) dTheta += 2 * Math.PI;
        while (dTheta >= 2 * Math.PI) dTheta -= 2 * Math.PI;
    } else {
        while (dTheta > 0) dTheta -= 2 * Math.PI;
        while (dTheta <= -2 * Math.PI) dTheta += 2 * Math.PI;
    }
    if (Math.abs(dTheta) < 0.001) dTheta = 0;

    return { type: 'arc', cx, cy, radius, startAngle, endAngle, ccw, dTheta, length: radius * Math.abs(dTheta), start: startPt, end: endPt, dir1: startDir, dir2: normalizeAngle(startDir + dTheta) };
}

function getTangents(c1, r1, c2, r2, isInner, sign1) {
    const dx = c2.x - c1.x; const dy = c2.y - c1.y;
    const D = Math.hypot(dx, dy);
    const phi = Math.atan2(dy, dx);

    if (!isInner) {
        if (D < Math.abs(r1 - r2)) return null;
        const theta = Math.acos((r1 - r2) / D);
        const aT1 = phi - sign1 * theta;
        return { aT1: aT1, aT2: aT1 };
    } else {
        if (D < r1 + r2) return null;
        const theta = Math.acos((r1 + r2) / D);
        const aT1 = phi - sign1 * theta;
        return { aT1: aT1, aT2: aT1 + Math.PI };
    }
}

function calcDubinsType(p1, dir1, p2, dir2, r1, r2, type) {
    const s1 = type[0] === 'L' ? 1 : -1;
    const s2 = type[2] === 'L' ? 1 : -1;

    const c1 = { x: p1.x - Math.sin(dir1) * r1 * s1, y: p1.y + Math.cos(dir1) * r1 * s1 };
    const c2 = { x: p2.x - Math.sin(dir2) * r2 * s2, y: p2.y + Math.cos(dir2) * r2 * s2 };

    const tangs = getTangents(c1, r1, c2, r2, s1 !== s2, s1);
    if (!tangs) return null;

    const t1 = { x: c1.x + r1 * Math.cos(tangs.aT1), y: c1.y + r1 * Math.sin(tangs.aT1) };
    const t2 = { x: c2.x + r2 * Math.cos(tangs.aT2), y: c2.y + r2 * Math.sin(tangs.aT2) };

    const sDir = Math.atan2(t2.y - t1.y, t2.x - t1.x);
    const sLen = Math.hypot(t2.x - t1.x, t2.y - t1.y);

    const sAng1 = Math.atan2(p1.y - c1.y, p1.x - c1.x);
    const eAng2 = Math.atan2(p2.y - c2.y, p2.x - c2.x);

    const arc1 = createArc(c1.x, c1.y, r1, p1, t1, sAng1, tangs.aT1, s1, dir1);
    const arc2 = createArc(c2.x, c2.y, r2, t2, p2, tangs.aT2, eAng2, s2, sDir);

    if (Math.abs(normalizeAngle(arc1.dir2 - sDir)) > 0.05) return null;
    if (Math.abs(normalizeAngle(arc2.dir1 - sDir)) > 0.05) return null;

    let penalty = 0;
    if (arc1.length > r1 * Math.PI) penalty += 10000;
    if (arc2.length > r2 * Math.PI) penalty += 10000;

    return { path: [arc1, { type: 'straight', start: t1, end: t2, length: sLen, dir1: sDir, dir2: sDir }, arc2], len: arc1.length + sLen + arc2.length + penalty };
}

function getBestDubins(p1, dir1, p2, dir2, r1, r2) {
    let best = null;
    ['LSL', 'RSR', 'LSR', 'RSL'].forEach(t => {
        const res = calcDubinsType(p1, dir1, p2, dir2, r1, r2, t);
        if (res && (!best || res.len < best.len)) best = res;
    });
    return best ? best.path : null;
}

function getExactTrackProjection(w, track) {
    if (track.type === 'straight') {
        const dx = track.end.x - track.start.x;
        const dy = track.end.y - track.start.y;
        const len = track.length;
        if (len === 0) return null;

        let t = ((w.x - track.start.x) * dx + (w.y - track.start.y) * dy) / (len * len);
        if (t <= 0.02 || t >= 0.98) return null;

        const px = track.start.x + dx * t;
        const py = track.start.y + dy * t;
        return { x: px, y: py, tParam: t, dist: Math.hypot(w.x - px, w.y - py) };
    } else {
        const angle = Math.atan2(w.y - track.cy, w.x - track.cx);
        let dAngle = angle - track.startAngle;

        if (track.ccw) {
            while (dAngle < 0) dAngle += 2 * Math.PI;
            while (dAngle >= 2 * Math.PI) dAngle -= 2 * Math.PI;
        } else {
            while (dAngle > 0) dAngle -= 2 * Math.PI;
            while (dAngle <= -2 * Math.PI) dAngle += 2 * Math.PI;
        }

        let t = dAngle / track.dTheta;
        if (t <= 0.02 || t >= 0.98) return null;

        const px = track.cx + track.radius * Math.cos(track.startAngle + track.dTheta * t);
        const py = track.cy + track.radius * Math.sin(track.startAngle + track.dTheta * t);
        return { x: px, y: py, tParam: t, dist: Math.hypot(w.x - px, w.y - py) };
    }
}

// --- SNAPPING LOGIC ---
function getSnapPoint(worldX, worldY, ignoreTrackId = null) {
    if (!document.getElementById('chk-snap').checked) return { x: worldX, y: worldY, type: 'none' };

    let bestSnap = null;
    let bestDist = 20 / camera.zoom;

    for (let node of nodes) {
        const d = dist({ x: worldX, y: worldY }, node);
        if (d < bestDist) {
            bestDist = d;
            bestSnap = { x: node.x, y: node.y, dir: node.dir, elev: node.elev, type: 'node', node: node };
        }
    }
    if (bestSnap) return bestSnap;

    const pDist = parseFloat(document.getElementById('slider-offset').value);

    for (let track of tracks) {
        if (track.id === ignoreTrackId) continue;
        const pts = getTrackPoints(track);
        for (let p of pts) {
            const d = dist({ x: worldX, y: worldY }, p);
            let pElev = track.elevStart + (track.elevEnd - track.elevStart) * p.tParam;

            if (d < bestDist) {
                bestDist = d;
                bestSnap = { x: p.x, y: p.y, dir: p.dir, type: 'mid-track', track: track, tParam: p.tParam, elev: pElev };
            }

            const pnx = p.x - Math.sin(p.dir) * pDist; const pny = p.y + Math.cos(p.dir) * pDist;
            if (dist({ x: worldX, y: worldY }, { x: pnx, y: pny }) < bestDist) {
                bestDist = dist({ x: worldX, y: worldY }, { x: pnx, y: pny });
                bestSnap = { x: pnx, y: pny, dir: p.dir, type: 'parallel', track: track, elev: pElev };
            }

            const pnx2 = p.x + Math.sin(p.dir) * pDist; const pny2 = p.y - Math.cos(p.dir) * pDist;
            if (dist({ x: worldX, y: worldY }, { x: pnx2, y: pny2 }) < bestDist) {
                bestDist = dist({ x: worldX, y: worldY }, { x: pnx2, y: pny2 });
                bestSnap = { x: pnx2, y: pny2, dir: p.dir, type: 'parallel', track: track, elev: pElev };
            }
        }
    }
    return bestSnap || { x: worldX, y: worldY, type: 'none' };
}

function getTrackPoints(track) {
    let pts = [];
    let steps = Math.max(2, Math.ceil(track.length / 2));
    if (track.type === 'straight') {
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            pts.push({ x: track.start.x + (track.end.x - track.start.x) * t, y: track.start.y + (track.end.y - track.start.y) * t, dir: track.dir1, tParam: t });
        }
    } else {
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let ang = track.startAngle + track.dTheta * t;
            pts.push({ x: track.cx + Math.cos(ang) * track.radius, y: track.cy + Math.sin(ang) * track.radius, dir: normalizeAngle(ang + (track.ccw ? Math.PI / 2 : -Math.PI / 2)), tParam: t });
        }
    }
    return pts;
}

// --- NATIVE MAP TILE ENGINE ---
function getMapTile(z, x, y) {
    const key = `${z}_${x}_${y}`;
    if (tileCache[key]) return tileCache[key];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    tileCache[key] = { img, loaded: false };
    img.onload = () => tileCache[key].loaded = true;
    return tileCache[key];
}

function renderMapTiles() {
    let targetZ = Math.round(Math.log2(camera.zoom * WORLD_SIZE / 256));
    targetZ = Math.max(0, Math.min(19, targetZ));
    const tileSizeMeters = WORLD_SIZE / Math.pow(2, targetZ);

    const mLeft = camera.x - (canvas.width / 2) / camera.zoom;
    const mRight = camera.x + (canvas.width / 2) / camera.zoom;
    const mTop = camera.y - (canvas.height / 2) / camera.zoom;
    const mBottom = camera.y + (canvas.height / 2) / camera.zoom;

    const osmTopLeft = { ox: mLeft + WORLD_SIZE / 2, oy: mTop + WORLD_SIZE / 2 };
    const osmBottomRight = { ox: mRight + WORLD_SIZE / 2, oy: mBottom + WORLD_SIZE / 2 };

    const startTileX = Math.floor(osmTopLeft.ox / tileSizeMeters);
    const endTileX = Math.floor(osmBottomRight.ox / tileSizeMeters);
    const startTileY = Math.floor(osmTopLeft.oy / tileSizeMeters);
    const endTileY = Math.floor(osmBottomRight.oy / tileSizeMeters);

    const maxTile = Math.pow(2, targetZ) - 1;

    for (let tx = startTileX; tx <= endTileX; tx++) {
        for (let ty = startTileY; ty <= endTileY; ty++) {
            if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;
            const tile = getMapTile(targetZ, tx, ty);
            if (tile.loaded) {
                const gameTileLeft = (tx * tileSizeMeters) - WORLD_SIZE / 2;
                const gameTileTop = (ty * tileSizeMeters) - WORLD_SIZE / 2;
                const screenPos = worldToScreen(gameTileLeft, gameTileTop);
                const screenWidth = Math.ceil(tileSizeMeters * camera.zoom);
                ctx.drawImage(tile.img, Math.floor(screenPos.x), Math.floor(screenPos.y), screenWidth, screenWidth);
            }
        }
    }
}

// --- INTERACTION ---
function screenToWorld(px, py) { return { x: (px - canvas.width / 2) / camera.zoom + camera.x, y: (py - canvas.height / 2) / camera.zoom + camera.y }; }
function worldToScreen(wx, wy) { return { x: (wx - camera.x) * camera.zoom + canvas.width / 2, y: (wy - camera.y) * camera.zoom + canvas.height / 2 }; }

canvas.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas) return;
    pointers.set(e.pointerId, e);
    const screenPos = { x: e.clientX, y: e.clientY };
    const w = screenToWorld(e.clientX, e.clientY);

    if (pointers.size === 2) {
        let pts = Array.from(pointers.values());
        lastZoomDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
    }

    if (pointers.size === 1) {
        lastPan = { x: e.clientX, y: e.clientY };

        if (mode === 'pan') return;
        if (mode === 'build') {
            if (preview.active) {
                const sStart = worldToScreen(preview.start.x, preview.start.y);
                const sEnd = worldToScreen(preview.end.x, preview.end.y);
                // Increased touch target size to 60px for extremely easy mobile dragging
                if (dist(screenPos, sStart) < 60) { draggingPoint = 'start'; return; }
                if (dist(screenPos, sEnd) < 60) { draggingPoint = 'end'; return; }
                return;
            }
            const snap = getSnapPoint(w.x, w.y);
            preview.start = { x: snap.x, y: snap.y, dir: snap.dir || 0, snapData: snap };
            preview.end = { x: snap.x, y: snap.y, dir: null, snapData: null };
            preview.active = true;
            draggingPoint = 'end';
            updatePreviewGeometry();
        } else if (mode === 'select') {
            selectedTrackId = null;
            selectedNode = null;
            let bestDist = 20 / camera.zoom;

            for (let n of nodes) {
                if (dist(w, n) < bestDist) { selectedNode = n; bestDist = dist(w, n); }
            }

            if (selectedNode) {
                uiSelection.classList.remove('hidden');
            } else {
                for (let t of tracks) {
                    for (let p of getTrackPoints(t)) {
                        if (dist(w, p) < bestDist) { selectedTrackId = t.id; bestDist = dist(w, p); }
                    }
                }
                if (selectedTrackId) uiSelection.classList.remove('hidden');
                else uiSelection.classList.add('hidden');
            }
        } else if (mode === 'insert') {
            let bestTrack = null; let bestProj = null; let bestDist = 20 / camera.zoom;
            for (let t of tracks) {
                const proj = getExactTrackProjection(w, t);
                if (proj && proj.dist < bestDist) { bestDist = proj.dist; bestTrack = t; bestProj = proj; }
            }
            if (bestTrack && bestProj) {
                splitTrack(bestTrack, { x: bestProj.x, y: bestProj.y, snapData: { tParam: bestProj.tParam } });
            }
        }
    }
});

canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);

    if (pointers.size === 2) {
        let pts = Array.from(pointers.values());
        let dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        if (lastZoomDist) {
            let cx = (pts[0].clientX + pts[1].clientX) / 2, cy = (pts[0].clientY + pts[1].clientY) / 2;
            const wBefore = screenToWorld(cx, cy);
            camera.zoom = Math.max(0.01, Math.min(camera.zoom * (dist / lastZoomDist), 50));
            const wAfter = screenToWorld(cx, cy);
            camera.x -= (wAfter.x - wBefore.x); camera.y -= (wAfter.y - wBefore.y);
        }
        lastZoomDist = dist; return;
    }

    if (e.buttons === 4 || e.buttons === 2 || mode === 'pan') {
        if (pointers.size === 1) {
            camera.x -= (e.clientX - lastPan.x) / camera.zoom; camera.y -= (e.clientY - lastPan.y) / camera.zoom;
            lastPan = { x: e.clientX, y: e.clientY };
        }
        return;
    }

    if (draggingPoint && preview.active) {
        const w = screenToWorld(e.clientX, e.clientY);
        const snap = getSnapPoint(w.x, w.y);

        if (snap.type === 'none' && draggingPoint === 'end' && preview.start.dir !== null) {
            let dx = w.x - preview.start.x; let dy = w.y - preview.start.y;
            let mouseDist = Math.hypot(dx, dy); let mouseDir = Math.atan2(dy, dx);
            let cross = Math.abs(Math.sin(mouseDir - preview.start.dir) * mouseDist);

            if (cross < (20 / camera.zoom)) {
                snap.x = preview.start.x + Math.cos(preview.start.dir) * mouseDist;
                snap.y = preview.start.y + Math.sin(preview.start.dir) * mouseDist;
            }
        }

        preview[draggingPoint] = { x: snap.x, y: snap.y, dir: snap.dir !== undefined ? snap.dir : (draggingPoint === 'start' ? Math.atan2(w.y - preview.end.y, w.x - preview.end.x) : null), snapData: snap };
        updatePreviewGeometry();
    }
});

canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastZoomDist = null;
    if (pointers.size === 1) lastPan = { x: Array.from(pointers.values())[0].clientX, y: Array.from(pointers.values())[0].clientY };
    draggingPoint = null;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
    if (e.target !== canvas) return;
    const wBefore = screenToWorld(e.clientX, e.clientY);
    camera.zoom = Math.max(0.01, Math.min(camera.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 50));
    const wAfter = screenToWorld(e.clientX, e.clientY);
    camera.x -= (wAfter.x - wBefore.x); camera.y -= (wAfter.y - wBefore.y);
});

// --- PREVIEW & LOGIC ---
function updatePreviewGeometry() {
    if (!preview.start || !preview.end || dist(preview.start, preview.end) < 1) { preview.geometry = []; preview.valid = false; updatePreviewUI(); return; }

    if (preview.start.snapData?.type === 'node') preview.start.dir = resolveNodeDir(preview.start.snapData.node.dir, preview.end, preview.start, false);
    if (preview.end.snapData?.type === 'node') preview.end.dir = resolveNodeDir(preview.end.snapData.node.dir, preview.end, preview.start, true);

    ['start', 'end'].forEach((pt, i) => {
        let el = preview[pt].snapData?.elev;
        let slider = document.getElementById(i === 0 ? 'slider-e1' : 'slider-e2');
        if (el !== undefined) { slider.value = el; slider.disabled = true; preview[i === 0 ? 'elevStart' : 'elevEnd'] = el; }
        else { slider.disabled = false; preview[i === 0 ? 'elevStart' : 'elevEnd'] = parseFloat(slider.value); }
        document.getElementById(i === 0 ? 'val-e1' : 'val-e2').innerText = slider.value;
    });

    if (preview.start.snapData?.type === 'node' && preview.end.snapData?.type === 'node') {
        uiDubins.classList.remove('hidden');
        preview.dubins.r1 = parseFloat(document.getElementById('input-r1').value) || 5;
        preview.dubins.r2 = parseFloat(document.getElementById('input-r2').value) || 5;

        preview.geometry = getBestDubins(preview.start, preview.start.dir, preview.end, preview.end.dir, preview.dubins.r1, preview.dubins.r2) || [];
        preview.valid = preview.geometry.length > 0;
    } else {
        uiDubins.classList.add('hidden');
        if (preview.start.dir === null) preview.start.dir = Math.atan2(preview.end.y - preview.start.y, preview.end.x - preview.start.x);
        const arc = calcArc(preview.start, preview.start.dir, preview.end);
        preview.geometry = arc ? [arc] : [];
        preview.valid = preview.geometry.length > 0;
    }

    if (preview.valid) {
        let totalLen = preview.geometry.reduce((sum, g) => sum + g.length, 0);
        let currElev = preview.elevStart;
        preview.geometry.forEach(seg => {
            seg.elevStart = currElev;
            currElev += (preview.elevEnd - preview.elevStart) * (seg.length / totalLen);
            seg.elevEnd = currElev;
        });
    }
    updatePreviewUI();
}

function updatePreviewUI() {
    if (preview.active && preview.valid && preview.geometry.length > 0) {
        uiActions.classList.remove('hidden'); uiInfo.classList.remove('hidden');
        let totalLength = 0; let minRadius = Infinity;
        preview.geometry.forEach(g => { totalLength += g.length; if (g.type === 'arc' && g.radius < minRadius) minRadius = g.radius; });
        document.getElementById('info-len').innerText = totalLength.toFixed(1);
        document.getElementById('info-rad').innerText = minRadius === Infinity ? 'Straight' : minRadius.toFixed(1);
        document.getElementById('info-spd').innerText = minRadius === Infinity ? 160 : Math.min(160, Math.floor(4.5 * Math.sqrt(minRadius)));
    } else {
        uiActions.classList.add('hidden'); uiInfo.classList.add('hidden');
    }
}

function confirmBuild() {
    if (!preview.valid) return;
    [preview.start, preview.end].forEach(pt => { if (pt.snapData?.type === 'mid-track') splitTrack(pt.snapData.track, pt); });

    preview.geometry.forEach(seg => {
        seg.id = Date.now() + Math.random();
        tracks.push(seg);
        if (!nodes.find(n => dist(n, seg.start) < 0.1)) nodes.push({ id: Date.now() + Math.random(), x: seg.start.x, y: seg.start.y, dir: seg.dir1, elev: seg.elevStart });
        if (!nodes.find(n => dist(n, seg.end) < 0.1)) nodes.push({ id: Date.now() + Math.random(), x: seg.end.x, y: seg.end.y, dir: seg.dir2, elev: seg.elevEnd });
    });
    cancelBuild();
}

function splitTrack(track, point) {
    tracks = tracks.filter(t => t.id !== track.id);
    const tParam = point.snapData.tParam;
    const midElev = track.elevStart + (track.elevEnd - track.elevStart) * tParam;
    let midDir;

    if (track.type === 'straight') {
        midDir = track.dir1;
        tracks.push({ ...track, id: Date.now() + Math.random(), end: point, length: track.length * tParam, elevEnd: midElev });
        tracks.push({ ...track, id: Date.now() + Math.random(), start: point, length: track.length * (1 - tParam), elevStart: midElev });
    } else {
        const angP = Math.atan2(point.y - track.cy, point.x - track.cx);
        midDir = normalizeAngle(angP + (track.ccw ? Math.PI / 2 : -Math.PI / 2));

        let t1 = createArc(track.cx, track.cy, track.radius, track.start, point, track.startAngle, angP, track.ccw ? 1 : -1, track.dir1);
        t1.id = Date.now() + Math.random(); t1.elevStart = track.elevStart; t1.elevEnd = midElev;

        let t2 = createArc(track.cx, track.cy, track.radius, point, track.end, angP, track.endAngle, track.ccw ? 1 : -1, midDir);
        t2.id = Date.now() + Math.random(); t2.elevStart = midElev; t2.elevEnd = track.elevEnd;

        tracks.push(t1, t2);
    }
    nodes.push({ id: Date.now() + Math.random(), x: point.x, y: point.y, dir: midDir, elev: midElev });
}

function cancelBuild() {
    preview.active = false; preview.geometry = []; draggingPoint = null;
    uiActions.classList.add('hidden'); uiInfo.classList.add('hidden'); uiDubins.classList.add('hidden');
}

// UI Listeners
function setMode(newMode, btnId) {
    mode = newMode;
    selectedNode = null; selectedTrackId = null; uiSelection.classList.add('hidden');
    ['btn-pan', 'btn-build', 'btn-select', 'btn-insert'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById(btnId).classList.add('active'); cancelBuild();
}
document.getElementById('btn-pan').onclick = () => setMode('pan', 'btn-pan');
document.getElementById('btn-build').onclick = () => setMode('build', 'btn-build');
document.getElementById('btn-select').onclick = () => setMode('select', 'btn-select');
document.getElementById('btn-insert').onclick = () => setMode('insert', 'btn-insert');

// Save / Load System (Local Storage)
document.getElementById('btn-save').onclick = () => {
    localStorage.setItem('railway_save', JSON.stringify({ tracks, nodes, camera }));
    alert('Tracks saved to local storage!');
};
document.getElementById('btn-load').onclick = () => {
    const data = localStorage.getItem('railway_save');
    if (data) {
        const parsed = JSON.parse(data);
        tracks = parsed.tracks; nodes = parsed.nodes; camera = parsed.camera;
        alert('Tracks loaded successfully!');
    } else {
        alert('No save file found.');
    }
};

// Export / Import System (JSON Files)
document.getElementById('btn-export').onclick = () => {
    const dataStr = JSON.stringify({ tracks, nodes, camera });
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'railway_save.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const fileImport = document.getElementById('file-import');
document.getElementById('btn-import').onclick = () => fileImport.click();
fileImport.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            tracks = parsed.tracks || [];
            nodes = parsed.nodes || [];
            camera = parsed.camera || camera;
            alert('Tracks imported successfully!');
        } catch (err) {
            alert('Invalid file format. Please upload a valid JSON save file.');
        }
    };
    reader.readAsText(file);
    // Reset input so the same file can be uploaded again if needed
    e.target.value = '';
};

document.getElementById('btn-confirm').onclick = confirmBuild;
document.getElementById('btn-cancel').onclick = cancelBuild;

document.getElementById('btn-delete').onclick = () => {
    if (selectedNode) {
        tracks = tracks.filter(t => dist(t.start, selectedNode) > 0.1 && dist(t.end, selectedNode) > 0.1);
        nodes = nodes.filter(n => n.id !== selectedNode.id);
        selectedNode = null;
    } else if (selectedTrackId) {
        tracks = tracks.filter(t => t.id !== selectedTrackId);
        selectedTrackId = null;
    }
    uiSelection.classList.add('hidden');
};

['offset', 'e1', 'e2'].forEach(id => {
    document.getElementById(`slider-${id}`).oninput = (e) => {
        document.getElementById(`val-${id}`).innerText = e.target.value;
        updatePreviewGeometry();
    };
});

function setupNumberInput(id) {
    const input = document.getElementById(`input-${id}`);
    document.getElementById(`btn-${id}-up`).onclick = () => { input.value = Math.max(5, parseFloat(input.value) + 5); updatePreviewGeometry(); };
    document.getElementById(`btn-${id}-down`).onclick = () => { input.value = Math.max(5, parseFloat(input.value) - 5); updatePreviewGeometry(); };
    input.onchange = () => { input.value = Math.max(5, parseFloat(input.value) || 5); updatePreviewGeometry(); };
}
setupNumberInput('r1'); setupNumberInput('r2');

// --- RENDERING ---
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Native Map
    renderMapTiles();

    // Draw grid overlay
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)'; ctx.lineWidth = 1;
    const step = 50 * camera.zoom;
    const ox = (camera.x * camera.zoom) % step, oy = (camera.y * camera.zoom) % step;
    ctx.beginPath();
    for (let x = -ox; x < canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = -oy; y < canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();

    let maxLayer = 0;
    tracks.forEach(t => { t._layer = Math.floor(Math.max(t.elevStart, t.elevEnd)); if (t._layer > maxLayer) maxLayer = t._layer; });

    for (let l = -100; l <= maxLayer; l++) {
        const layerTracks = tracks.filter(t => t._layer === l);
        layerTracks.forEach(t => drawSegment(t, false, t.id === selectedTrackId, 'base'));
        layerTracks.forEach(t => drawSegment(t, false, t.id === selectedTrackId, 'rail'));
    }

    if (preview.active) {
        if (preview.geometry.length > 0) {
            preview.geometry.forEach(t => drawSegment(t, true, false, 'base'));
            preview.geometry.forEach(t => drawSegment(t, true, false, 'rail'));
        } else if (preview.start && preview.end) {
            const s = worldToScreen(preview.start.x, preview.start.y), e = worldToScreen(preview.end.x, preview.end.y);
            ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.setLineDash([]);
        }
        drawHandle(preview.start, '#007bff'); drawHandle(preview.end, '#dc3545');
    }

    nodes.forEach(n => {
        const s = worldToScreen(n.x, n.y);
        ctx.fillStyle = (selectedNode && selectedNode.id === n.id) ? '#ff0000' : '#ffc107';
        ctx.beginPath();
        ctx.arc(s.x, s.y, (selectedNode && selectedNode.id === n.id) ? 6 : 4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
    });
    requestAnimationFrame(render);
}

function drawHandle(pt, color) {
    if (!pt) return;
    const s = worldToScreen(pt.x, pt.y);

    // VISUAL TOUCH RADIUS INDICATOR
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 60, 0, Math.PI * 2);
    ctx.fill();

    // Actual Point
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}

function drawSegment(seg, isPreview, isSelected, drawMode) {
    const baseWidth = 3 * camera.zoom;
    const railOffset = (gauge / 2) * camera.zoom;
    let baseColor = isSelected ? '#ffaaaa' : (isPreview ? 'rgba(136,136,136,0.5)' : '#888');
    let railColor = isPreview ? 'rgba(0,0,0,0.5)' : '#000';
    ctx.lineCap = 'butt';

    if (seg.type === 'straight') {
        const s = worldToScreen(seg.start.x, seg.start.y);
        const e = worldToScreen(seg.end.x, seg.end.y);

        if (drawMode === 'base') {
            ctx.strokeStyle = baseColor; ctx.lineWidth = baseWidth;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        } else if (drawMode === 'rail') {
            const dx = e.x - s.x; const dy = e.y - s.y; const len = Math.hypot(dx, dy);
            const nx = -dy / len * railOffset; const ny = dx / len * railOffset;
            ctx.strokeStyle = railColor; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(s.x + nx, s.y + ny); ctx.lineTo(e.x + nx, e.y + ny); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s.x - nx, s.y - ny); ctx.lineTo(e.x - nx, e.y - ny); ctx.stroke();
        }
    } else if (seg.type === 'arc') {
        const c = worldToScreen(seg.cx, seg.cy);
        const rScreen = Math.abs(seg.radius * camera.zoom);

        if (drawMode === 'base') {
            ctx.strokeStyle = baseColor; ctx.lineWidth = baseWidth;
            ctx.beginPath(); ctx.arc(c.x, c.y, rScreen, seg.startAngle, seg.endAngle, !seg.ccw); ctx.stroke();
        } else if (drawMode === 'rail') {
            ctx.strokeStyle = railColor; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(c.x, c.y, rScreen + railOffset, seg.startAngle, seg.endAngle, !seg.ccw); ctx.stroke();
            ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(0, rScreen - railOffset), seg.startAngle, seg.endAngle, !seg.ccw); ctx.stroke();
        }
    }
}

requestAnimationFrame(render);