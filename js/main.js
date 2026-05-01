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
let platforms = [];
let platformBoundaries = [];
let platformNodes = [];

let mode = 'build';
let camera = { x: startMx, y: startMy, zoom: 0.5 };
let gauge = 1.435;
let maxElevFilter = 100;

const tileCache = {};

const uiInfo = document.getElementById('ui-info');
const uiActions = document.getElementById('ui-actions');
const uiDubins = document.getElementById('ui-dubins');
const uiSelection = document.getElementById('ui-selection');
const uiSelectionProps = document.getElementById('selection-track-props');
const uiSelectionPlatTools = document.getElementById('selection-platform-tools');
const uiSelectionLen = document.getElementById('selection-length-info');
const uiSelectionColorProps = document.getElementById('selection-color-props');

let preview = {
    active: false, valid: false,
    start: null, end: null,
    dubins: { r1: 500, r2: 500 },
    elevStart: 0, elevEnd: 0,
    geometry: []
};

let platformBuildSequence = [];

// Multi-Selection State
let selectedTracks = new Set();
let selectedNodes = new Set();
let selectedPlatforms = new Set();
let continuousPath = null;
let draggingPoint = null;

let pointers = new Map();
let lastPan = { x: 0, y: 0 };
let lastZoomDist = null;

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
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

function getArcPt(arc, tParam) {
    const ang = arc.startAngle + arc.dTheta * tParam;
    return {
        x: arc.cx + arc.radius * Math.cos(ang),
        y: arc.cy + arc.radius * Math.sin(ang)
    };
}

function pointInPolygon(point, vs) {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
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
        const aT1 = phi - sign1 * theta; return { aT1, aT2: aT1 };
    } else {
        if (D < r1 + r2) return null;
        const theta = Math.acos((r1 + r2) / D);
        const aT1 = phi - sign1 * theta; return { aT1, aT2: aT1 + Math.PI };
    }
}

function calcDubinsType(p1, dir1, p2, dir2, r1, r2, type) {
    const s1 = type[0] === 'L' ? 1 : -1, s2 = type[2] === 'L' ? 1 : -1;
    const c1 = { x: p1.x - Math.sin(dir1) * r1 * s1, y: p1.y + Math.cos(dir1) * r1 * s1 };
    const c2 = { x: p2.x - Math.sin(dir2) * r2 * s2, y: p2.y + Math.cos(dir2) * r2 * s2 };
    const tangs = getTangents(c1, r1, c2, r2, s1 !== s2, s1);
    if (!tangs) return null;

    const t1 = { x: c1.x + r1 * Math.cos(tangs.aT1), y: c1.y + r1 * Math.sin(tangs.aT1) };
    const t2 = { x: c2.x + r2 * Math.cos(tangs.aT2), y: c2.y + r2 * Math.sin(tangs.aT2) };
    const sDir = Math.atan2(t2.y - t1.y, t2.x - t1.x);
    const sLen = Math.hypot(t2.x - t1.x, t2.y - t1.y);

    const arc1 = createArc(c1.x, c1.y, r1, p1, t1, Math.atan2(p1.y - c1.y, p1.x - c1.x), tangs.aT1, s1, dir1);
    const arc2 = createArc(c2.x, c2.y, r2, t2, p2, tangs.aT2, Math.atan2(p2.y - c2.y, p2.x - c2.x), s2, sDir);

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
        const dx = track.end.x - track.start.x, dy = track.end.y - track.start.y, len = track.length;
        if (len === 0) return null;
        let t = ((w.x - track.start.x) * dx + (w.y - track.start.y) * dy) / (len * len);
        if (t <= 0.02 || t >= 0.98) return null;
        const px = track.start.x + dx * t, py = track.start.y + dy * t;
        return { x: px, y: py, tParam: t, dist: Math.hypot(w.x - px, w.y - py) };
    } else {
        let dAngle = Math.atan2(w.y - track.cy, w.x - track.cx) - track.startAngle;
        if (track.ccw) { while (dAngle < 0) dAngle += 2 * Math.PI; while (dAngle >= 2 * Math.PI) dAngle -= 2 * Math.PI; }
        else { while (dAngle > 0) dAngle -= 2 * Math.PI; while (dAngle <= -2 * Math.PI) dAngle += 2 * Math.PI; }
        let t = dAngle / track.dTheta;
        if (t <= 0.02 || t >= 0.98) return null;
        const px = track.cx + track.radius * Math.cos(track.startAngle + track.dTheta * t);
        const py = track.cy + track.radius * Math.sin(track.startAngle + track.dTheta * t);
        return { x: px, y: py, tParam: t, dist: Math.hypot(w.x - px, w.y - py) };
    }
}

// --- PLATFORM GENERATION ALGORITHMS ---
function getContinuousPath(trackSet) {
    let trks = Array.from(trackSet).map(id => tracks.find(t => t.id === id)).filter(t => t);
    if (trks.length === 0) return null;

    let pts = [];
    trks.forEach(t => {
        pts.push({ t, pt: t.start, isStart: true });
        pts.push({ t, pt: t.end, isStart: false });
    });

    let groups = [];
    pts.forEach(p => {
        let g = groups.find(g => dist(g.pt, p.pt) < 0.1);
        if (g) g.items.push(p); else groups.push({ pt: p.pt, items: [p] });
    });

    let endpoints = groups.filter(g => g.items.length === 1);
    let branches = groups.filter(g => g.items.length > 2);

    if (branches.length > 0 || endpoints.length !== 2) return null;
    if (endpoints.length + groups.filter(g => g.items.length === 2).length !== groups.length) return null;

    let path = [];
    let currGroup = endpoints[0];
    let currItem = currGroup.items[0];
    let currTrack = currItem.t;
    let forward = currItem.isStart;

    while (true) {
        path.push({ track: currTrack, forward });
        let nextPt = forward ? currTrack.end : currTrack.start;
        let nextGroup = groups.find(g => dist(g.pt, nextPt) < 0.1);
        if (nextGroup.items.length === 1) break;

        let nextItem = nextGroup.items.find(i => i.t.id !== currTrack.id);
        currTrack = nextItem.t;
        forward = nextItem.isStart;
    }
    return path;
}

function generatePlatformBoundary(path, side, pathId) {
    const offsetDist = 1.7 * side; // -1 for Left, 1 for Right
    let segments = [];
    let idBase = Date.now() + Math.random();

    path.forEach((seg) => {
        let t = seg.track;
        let fwd = seg.forward;

        let dirStart = fwd ? t.dir1 : normalizeAngle(t.dir2 + Math.PI);
        let nx1 = -Math.sin(dirStart) * offsetDist;
        let ny1 = Math.cos(dirStart) * offsetDist;
        let pStart = fwd ? t.start : t.end;
        let newStart = { x: pStart.x + nx1, y: pStart.y + ny1 };

        let dirEnd = fwd ? t.dir2 : normalizeAngle(t.dir1 + Math.PI);
        let nx2 = -Math.sin(dirEnd) * offsetDist;
        let ny2 = Math.cos(dirEnd) * offsetDist;
        let pEnd = fwd ? t.end : t.start;
        let newEnd = { x: pEnd.x + nx2, y: pEnd.y + ny2 };

        if (t.type === 'straight') {
            segments.push({ type: 'straight', start: newStart, end: newEnd, length: t.length });
        } else if (t.type === 'arc') {
            let newRadius = Math.hypot(newStart.x - t.cx, newStart.y - t.cy);
            let flip = (fwd ? t.ccw : !t.ccw) ? 1 : -1;
            let sAng = Math.atan2(newStart.y - t.cy, newStart.x - t.cx);
            let eAng = Math.atan2(newEnd.y - t.cy, newEnd.x - t.cx);
            let newArc = createArc(t.cx, t.cy, newRadius, newStart, newEnd, sAng, eAng, flip, dirStart);
            segments.push(newArc);
        }
    });

    let sNode = { id: idBase + 'n1', x: segments[0].start.x, y: segments[0].start.y, elev: path[0].track.elevStart };
    let eNode = { id: idBase + 'n2', x: segments[segments.length - 1].end.x, y: segments[segments.length - 1].end.y, elev: path[path.length - 1].track.elevEnd };
    platformNodes.push(sNode, eNode);
    platformBoundaries.push({ id: idBase, pathId, side, segments, node1: sNode.id, node2: eNode.id });
}

function togglePlatformBoundary(path, side) {
    let pathId = path.map(p => p.track.id).sort().join(',');
    let existingIdx = platformBoundaries.findIndex(b => b.pathId === pathId && b.side === side);
    if (existingIdx !== -1) {
        let b = platformBoundaries[existingIdx];
        platformNodes = platformNodes.filter(n => n.id !== b.node1 && n.id !== b.node2);
        platformBoundaries.splice(existingIdx, 1);
    } else {
        generatePlatformBoundary(path, side, pathId);
    }
}

function getPlatformPolygon(p) {
    let poly = [];
    for (let i = 0; i < p.nodes.length; i++) {
        let curr = p.nodes[i], next = p.nodes[(i + 1) % p.nodes.length];
        let bnd = platformBoundaries.find(b => (b.node1 === curr && b.node2 === next) || (b.node1 === next && b.node2 === curr));

        let nCurr = platformNodes.find(n => n.id === curr);
        if (!nCurr) continue;
        poly.push({ x: nCurr.x, y: nCurr.y });

        if (bnd) {
            let reverse = bnd.node2 === curr;
            let segs = reverse ? [...bnd.segments].reverse() : bnd.segments;
            segs.forEach(seg => {
                if (seg.type === 'arc') {
                    let steps = Math.max(5, Math.ceil(seg.length / 5));
                    for (let s = 1; s <= steps; s++) {
                        let tParam = reverse ? (1 - s / steps) : (s / steps);
                        poly.push(getArcPt(seg, tParam));
                    }
                } else {
                    poly.push(reverse ? seg.start : seg.end);
                }
            });
        }
    }
    return poly;
}

// --- SNAPPING LOGIC ---
function getSnapPoint(worldX, worldY, ignoreTrackId = null) {
    if (!document.getElementById('chk-snap').checked) return { x: worldX, y: worldY, type: 'none' };
    let bestSnap = null; let bestDist = 20 / camera.zoom;

    for (let node of nodes) {
        if (node.elev > maxElevFilter) continue;
        const d = dist({ x: worldX, y: worldY }, node);
        if (d < bestDist) { bestDist = d; bestSnap = { x: node.x, y: node.y, dir: node.dir, elev: node.elev, type: 'node', node: node }; }
    }
    if (bestSnap) return bestSnap;

    const pDist = parseFloat(document.getElementById('slider-offset').value);

    for (let track of tracks) {
        if (track.id === ignoreTrackId || track.elevStart > maxElevFilter) continue;
        const pts = getTrackPoints(track);
        for (let p of pts) {
            const d = dist({ x: worldX, y: worldY }, p);
            let pElev = track.elevStart + (track.elevEnd - track.elevStart) * p.tParam;

            if (d < bestDist) { bestDist = d; bestSnap = { x: p.x, y: p.y, dir: p.dir, type: 'mid-track', track: track, tParam: p.tParam, elev: pElev }; }

            const pnx = p.x - Math.sin(p.dir) * pDist, pny = p.y + Math.cos(p.dir) * pDist;
            if (dist({ x: worldX, y: worldY }, { x: pnx, y: pny }) < bestDist) {
                bestDist = dist({ x: worldX, y: worldY }, { x: pnx, y: pny });
                bestSnap = { x: pnx, y: pny, dir: p.dir, type: 'parallel', track: track, elev: pElev };
            }

            const pnx2 = p.x + Math.sin(p.dir) * pDist, pny2 = p.y - Math.cos(p.dir) * pDist;
            if (dist({ x: worldX, y: worldY }, { x: pnx2, y: pny2 }) < bestDist) {
                bestDist = dist({ x: worldX, y: worldY }, { x: pnx2, y: pny2 });
                bestSnap = { x: pnx2, y: pny2, dir: p.dir, type: 'parallel', track: track, elev: pElev };
            }
        }
    }
    return bestSnap || { x: worldX, y: worldY, type: 'none' };
}

function getTrackPoints(track) {
    let pts = []; let steps = Math.max(2, Math.ceil(track.length / 2));
    if (track.type === 'straight') {
        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            pts.push({ x: track.start.x + (track.end.x - track.start.x) * t, y: track.start.y + (track.end.y - track.start.y) * t, dir: track.dir1, tParam: t });
        }
    } else {
        for (let i = 0; i <= steps; i++) {
            let t = i / steps; let ang = track.startAngle + track.dTheta * t;
            pts.push({ x: track.cx + Math.cos(ang) * track.radius, y: track.cy + Math.sin(ang) * track.radius, dir: normalizeAngle(ang + (track.ccw ? Math.PI / 2 : -Math.PI / 2)), tParam: t });
        }
    }
    return pts;
}

// --- NATIVE MAP TILE ENGINE ---
function getMapTile(z, x, y) {
    const key = `${z}_${x}_${y}`;
    if (tileCache[key]) return tileCache[key];
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    tileCache[key] = { img, loaded: false }; img.onload = () => tileCache[key].loaded = true;
    return tileCache[key];
}

function renderMapTiles() {
    let targetZ = Math.max(0, Math.min(19, Math.round(Math.log2(camera.zoom * WORLD_SIZE / 256))));
    const tileSizeMeters = WORLD_SIZE / Math.pow(2, targetZ);
    const mLeft = camera.x - (canvas.width / 2) / camera.zoom, mRight = camera.x + (canvas.width / 2) / camera.zoom;
    const mTop = camera.y - (canvas.height / 2) / camera.zoom, mBottom = camera.y + (canvas.height / 2) / camera.zoom;

    const maxTile = Math.pow(2, targetZ) - 1;
    for (let tx = Math.floor((mLeft + WORLD_SIZE / 2) / tileSizeMeters); tx <= Math.floor((mRight + WORLD_SIZE / 2) / tileSizeMeters); tx++) {
        for (let ty = Math.floor((mTop + WORLD_SIZE / 2) / tileSizeMeters); ty <= Math.floor((mBottom + WORLD_SIZE / 2) / tileSizeMeters); ty++) {
            if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;
            const tile = getMapTile(targetZ, tx, ty);
            if (tile.loaded) {
                const sPos = worldToScreen((tx * tileSizeMeters) - WORLD_SIZE / 2, (ty * tileSizeMeters) - WORLD_SIZE / 2);
                ctx.drawImage(tile.img, Math.floor(sPos.x), Math.floor(sPos.y), Math.ceil(tileSizeMeters * camera.zoom), Math.ceil(tileSizeMeters * camera.zoom));
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
                if (dist(screenPos, sStart) < 60) { draggingPoint = 'start'; return; }
                if (dist(screenPos, sEnd) < 60) { draggingPoint = 'end'; return; }
                return;
            }
            const snap = getSnapPoint(w.x, w.y);
            preview.start = { x: snap.x, y: snap.y, dir: snap.dir || 0, snapData: snap };
            preview.end = { x: snap.x, y: snap.y, dir: null, snapData: null };
            preview.active = true; draggingPoint = 'end'; updatePreviewGeometry();

        } else if (mode === 'select') {
            let bestDist = 40 / camera.zoom;
            let clickedNode = null, clickedTrack = null, clickedPlatform = null;

            for (let n of nodes) { if (n.elev <= maxElevFilter && dist(w, n) < bestDist) { clickedNode = n; bestDist = dist(w, n); } }

            if (clickedNode) {
                if (selectedNodes.has(clickedNode.id)) selectedNodes.delete(clickedNode.id);
                else selectedNodes.add(clickedNode.id);
            } else {
                for (let t of tracks) {
                    if (t.elevStart > maxElevFilter) continue;
                    for (let p of getTrackPoints(t)) { if (dist(w, p) < bestDist) { clickedTrack = t; bestDist = dist(w, p); } }
                }
                if (clickedTrack) {
                    if (selectedTracks.has(clickedTrack.id)) selectedTracks.delete(clickedTrack.id);
                    else selectedTracks.add(clickedTrack.id);
                } else {
                    for (let p of platforms) {
                        let poly = getPlatformPolygon(p);
                        if (pointInPolygon(w, poly) && p._layer <= maxElevFilter) {
                            clickedPlatform = p; break;
                        }
                    }
                    if (clickedPlatform) {
                        if (selectedPlatforms.has(clickedPlatform.id)) selectedPlatforms.delete(clickedPlatform.id);
                        else selectedPlatforms.add(clickedPlatform.id);
                    } else {
                        selectedNodes.clear(); selectedTracks.clear(); selectedPlatforms.clear();
                    }
                }
            }
            updateSelectionUI();

        } else if (mode === 'insert') {
            let bestTrack = null, bestProj = null, bestDist = 40 / camera.zoom;
            for (let t of tracks) {
                if (t.elevStart > maxElevFilter) continue;
                const proj = getExactTrackProjection(w, t);
                if (proj && proj.dist < bestDist) { bestDist = proj.dist; bestTrack = t; bestProj = proj; }
            }
            if (bestTrack && bestProj) splitTrack(bestTrack, { x: bestProj.x, y: bestProj.y, snapData: { tParam: bestProj.tParam } });

        } else if (mode === 'plat_node') {
            platformNodes.push({ id: Date.now() + Math.random(), x: w.x, y: w.y, elev: 0 });

        } else if (mode === 'plat_build') {
            let bestDist = 40 / camera.zoom, clickedNode = null;
            for (let n of platformNodes) { if (n.elev <= maxElevFilter && dist(w, n) < bestDist) { clickedNode = n; bestDist = dist(w, n); } }
            if (clickedNode) {
                platformBuildSequence.push(clickedNode.id);
                uiActions.classList.remove('hidden');
                document.getElementById('btn-plat-undo').classList.remove('hidden');
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
            let dx = w.x - preview.start.x, dy = w.y - preview.start.y, mouseDist = Math.hypot(dx, dy), mouseDir = Math.atan2(dy, dx);
            if (Math.abs(Math.sin(mouseDir - preview.start.dir) * mouseDist) < (20 / camera.zoom)) {
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

// --- UI UPDATES & PREVIEW ---
function updateSelectionUI() {
    uiSelectionLen.classList.add('hidden');
    uiSelectionPlatTools.classList.add('hidden');
    uiSelectionProps.classList.add('hidden');
    uiSelectionColorProps.classList.add('hidden');

    if (selectedNodes.size > 0 || selectedTracks.size > 0 || selectedPlatforms.size > 0) {
        uiSelection.classList.remove('hidden');
        if (selectedTracks.size > 0 && selectedNodes.size === 0 && selectedPlatforms.size === 0) {
            uiSelectionProps.classList.remove('hidden');

            let selLen = 0;
            selectedTracks.forEach(id => { let t = tracks.find(x => x.id === id); if (t) selLen += t.length; });
            uiSelectionLen.innerText = `Total Length: ${selLen.toFixed(1)}m`;
            uiSelectionLen.classList.remove('hidden');

            continuousPath = getContinuousPath(selectedTracks);
            if (continuousPath) uiSelectionPlatTools.classList.remove('hidden');
        } else if (selectedPlatforms.size > 0 && selectedTracks.size === 0 && selectedNodes.size === 0) {
            uiSelectionColorProps.classList.remove('hidden');
            let firstId = Array.from(selectedPlatforms)[0];
            let p = platforms.find(x => x.id === firstId);
            if (p) {
                document.getElementById('input-plat-color').value = p.color || '#cccccc';
                document.getElementById('input-plat-outline').value = p.outlineColor || '#555555';
            }
        }
    } else {
        uiSelection.classList.add('hidden');
    }
}

document.getElementById('input-plat-color').onchange = (e) => {
    selectedPlatforms.forEach(id => { let p = platforms.find(x => x.id === id); if (p) p.color = e.target.value; });
};
document.getElementById('input-plat-outline').onchange = (e) => {
    selectedPlatforms.forEach(id => { let p = platforms.find(x => x.id === id); if (p) p.outlineColor = e.target.value; });
};

document.getElementById('btn-plat-left').onclick = () => { if (continuousPath) togglePlatformBoundary(continuousPath, -1); };
document.getElementById('btn-plat-right').onclick = () => { if (continuousPath) togglePlatformBoundary(continuousPath, 1); };
document.getElementById('btn-plat-both').onclick = () => {
    if (continuousPath) {
        let pathId = continuousPath.map(p => p.track.id).sort().join(',');
        let hasL = platformBoundaries.some(b => b.pathId === pathId && b.side === -1);
        let hasR = platformBoundaries.some(b => b.pathId === pathId && b.side === 1);
        if (hasL && hasR) { togglePlatformBoundary(continuousPath, -1); togglePlatformBoundary(continuousPath, 1); }
        else {
            if (!hasL) togglePlatformBoundary(continuousPath, -1);
            if (!hasR) togglePlatformBoundary(continuousPath, 1);
        }
    }
};

function updatePreviewGeometry() {
    if (!preview.start || !preview.end || dist(preview.start, preview.end) < 1) { preview.geometry = []; preview.valid = false; updatePreviewUI(); return; }
    if (preview.start.snapData?.type === 'node') preview.start.dir = resolveNodeDir(preview.start.snapData.node.dir, preview.end, preview.start, false);
    if (preview.end.snapData?.type === 'node') preview.end.dir = resolveNodeDir(preview.end.snapData.node.dir, preview.end, preview.start, true);

    ['start', 'end'].forEach((pt, i) => {
        let el = preview[pt].snapData?.elev;
        let input = document.getElementById(i === 0 ? 'input-e1' : 'input-e2');
        if (el !== undefined) { input.value = Math.round(el); input.disabled = true; preview[i === 0 ? 'elevStart' : 'elevEnd'] = el; }
        else { input.disabled = false; preview[i === 0 ? 'elevStart' : 'elevEnd'] = parseFloat(input.value) || 0; }
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
            seg.elevStart = currElev; currElev += (preview.elevEnd - preview.elevStart) * (seg.length / totalLen); seg.elevEnd = currElev;
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
    if (mode === 'plat_build') {
        if (platformBuildSequence.length > 2) {
            platforms.push({ id: Date.now() + Math.random(), nodes: [...platformBuildSequence], color: '#cccccc', outlineColor: '#555555' });
        }
        cancelBuild();
        return;
    }

    if (!preview.valid) return;
    [preview.start, preview.end].forEach(pt => { if (pt.snapData?.type === 'mid-track') splitTrack(pt.snapData.track, pt); });

    preview.geometry.forEach(seg => {
        seg.id = Date.now() + Math.random(); seg.speedLimit = null; seg.oneWay = 0; tracks.push(seg);
        if (!nodes.find(n => dist(n, seg.start) < 0.1)) nodes.push({ id: Date.now() + Math.random(), x: seg.start.x, y: seg.start.y, dir: seg.dir1, elev: seg.elevStart });
        if (!nodes.find(n => dist(n, seg.end) < 0.1)) nodes.push({ id: Date.now() + Math.random(), x: seg.end.x, y: seg.end.y, dir: seg.dir2, elev: seg.elevEnd });
    });
    cancelBuild();
}

document.getElementById('btn-plat-undo').onclick = () => {
    platformBuildSequence.pop();
    if (platformBuildSequence.length === 0) { uiActions.classList.add('hidden'); document.getElementById('btn-plat-undo').classList.add('hidden'); }
};

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
        t1.id = Date.now() + Math.random(); t1.elevStart = track.elevStart; t1.elevEnd = midElev; t1.speedLimit = track.speedLimit; t1.oneWay = track.oneWay;
        let t2 = createArc(track.cx, track.cy, track.radius, point, track.end, angP, track.endAngle, track.ccw ? 1 : -1, midDir);
        t2.id = Date.now() + Math.random(); t2.elevStart = midElev; t2.elevEnd = track.elevEnd; t2.speedLimit = track.speedLimit; t2.oneWay = track.oneWay;
        tracks.push(t1, t2);
    }
    nodes.push({ id: Date.now() + Math.random(), x: point.x, y: point.y, dir: midDir, elev: midElev });
}

function cancelBuild() {
    preview.active = false; preview.geometry = []; draggingPoint = null; platformBuildSequence = [];
    uiActions.classList.add('hidden'); uiInfo.classList.add('hidden'); uiDubins.classList.add('hidden'); document.getElementById('btn-plat-undo').classList.add('hidden');
}

// UI Listeners
function setMode(newMode, btnId) {
    mode = newMode;
    selectedNodes.clear(); selectedTracks.clear(); selectedPlatforms.clear(); updateSelectionUI();
    ['btn-pan', 'btn-build', 'btn-select', 'btn-insert', 'btn-plat-node', 'btn-plat-build'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById(btnId).classList.add('active'); cancelBuild();
}
document.getElementById('btn-pan').onclick = () => setMode('pan', 'btn-pan');
document.getElementById('btn-build').onclick = () => setMode('build', 'btn-build');
document.getElementById('btn-select').onclick = () => setMode('select', 'btn-select');
document.getElementById('btn-insert').onclick = () => setMode('insert', 'btn-insert');
document.getElementById('btn-plat-node').onclick = () => setMode('plat_node', 'btn-plat-node');
document.getElementById('btn-plat-build').onclick = () => setMode('plat_build', 'btn-plat-build');

// Save / Load / Export / Import System
document.getElementById('btn-save').onclick = () => { localStorage.setItem('railway_save', JSON.stringify({ tracks, nodes, camera, platforms, platformBoundaries, platformNodes })); alert('Tracks saved to local storage!'); };
document.getElementById('btn-load').onclick = () => {
    const data = localStorage.getItem('railway_save');
    if (data) {
        const parsed = JSON.parse(data); tracks = parsed.tracks; nodes = parsed.nodes; camera = parsed.camera; platforms = parsed.platforms || []; platformBoundaries = parsed.platformBoundaries || []; platformNodes = parsed.platformNodes || [];
        alert('Tracks loaded successfully!');
    } else alert('No save file found.');
};
document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify({ tracks, nodes, camera, platforms, platformBoundaries, platformNodes })], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'railway_save.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};
document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
document.getElementById('file-import').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            tracks = parsed.tracks || []; nodes = parsed.nodes || []; camera = parsed.camera || camera; platforms = parsed.platforms || []; platformBoundaries = parsed.platformBoundaries || []; platformNodes = parsed.platformNodes || [];
            alert('Tracks imported successfully!');
        } catch (err) { alert('Invalid file format. Please upload a valid JSON save file.'); }
    };
    reader.readAsText(file); e.target.value = '';
};

document.getElementById('btn-confirm').onclick = confirmBuild;
document.getElementById('btn-cancel').onclick = cancelBuild;

document.getElementById('btn-delete').onclick = () => {
    if (selectedNodes.size > 0) {
        tracks = tracks.filter(t => {
            let keep = true;
            for (let nId of selectedNodes) { let n = nodes.find(x => x.id === nId); if (n && (dist(t.start, n) < 0.1 || dist(t.end, n) < 0.1)) { keep = false; break; } }
            return keep;
        });
        nodes = nodes.filter(n => !selectedNodes.has(n.id));
    }
    if (selectedTracks.size > 0) tracks = tracks.filter(t => !selectedTracks.has(t.id));
    if (selectedPlatforms.size > 0) platforms = platforms.filter(p => !selectedPlatforms.has(p.id));
    selectedNodes.clear(); selectedTracks.clear(); selectedPlatforms.clear(); updateSelectionUI();
};

document.getElementById('btn-apply-speed').onclick = () => {
    const val = document.getElementById('input-speed').value; const newSpeed = val ? parseFloat(val) : null;
    selectedTracks.forEach(id => { const t = tracks.find(x => x.id === id); if (t) t.speedLimit = newSpeed; });
};

document.getElementById('btn-oneway').onclick = () => {
    let firstState = 0;
    for (let id of selectedTracks) { const t = tracks.find(x => x.id === id); if (t) { firstState = t.oneWay || 0; break; } }
    let nextState = firstState === 0 ? 1 : (firstState === 1 ? -1 : 0);
    let labels = { 0: "Off", 1: "Forward", "-1": "Backward" };
    document.getElementById('btn-oneway').innerText = `One-Way: ${labels[nextState]}`;
    selectedTracks.forEach(id => { const t = tracks.find(x => x.id === id); if (t) t.oneWay = nextState; });
};

document.getElementById('slider-offset').oninput = (e) => { document.getElementById('val-offset').innerText = e.target.value; updatePreviewGeometry(); };
document.getElementById('slider-max-elev').oninput = (e) => { maxElevFilter = parseFloat(e.target.value); document.getElementById('val-max-elev').innerText = e.target.value; };

function setupNumberInput(id, step = 5) {
    const input = document.getElementById(`input-${id}`);
    document.getElementById(`btn-${id}-up`).onclick = () => { if (input.disabled) return; input.value = Math.min(parseFloat(input.max) || Infinity, parseFloat(input.value) + step); updatePreviewGeometry(); };
    document.getElementById(`btn-${id}-down`).onclick = () => { if (input.disabled) return; input.value = Math.max(parseFloat(input.min) || -Infinity, parseFloat(input.value) - step); updatePreviewGeometry(); };
    input.onchange = () => { input.value = Math.max(parseFloat(input.min) || -Infinity, Math.min(parseFloat(input.max) || Infinity, parseFloat(input.value) || 0)); updatePreviewGeometry(); };
}
setupNumberInput('r1', 5); setupNumberInput('r2', 5);
setupNumberInput('e1', 1); setupNumberInput('e2', 1);


// --- RENDERING ---
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    renderMapTiles();

    ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)'; ctx.lineWidth = 1;
    const step = 50 * camera.zoom;
    const ox = (camera.x * camera.zoom) % step, oy = (camera.y * camera.zoom) % step;
    ctx.beginPath();
    for (let x = -ox; x < canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = -oy; y < canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();

    let maxLayer = 0;
    tracks.forEach(t => { t._layer = Math.floor(Math.max(t.elevStart, t.elevEnd)); if (t._layer > maxLayer) maxLayer = t._layer; });

    platforms.forEach(p => {
        let sum = 0; let count = 0;
        p.nodes.forEach(nid => { let n = platformNodes.find(x => x.id === nid); if (n) { sum += n.elev; count++; } });
        p._layer = count > 0 ? Math.floor(sum / count) : 0;
        if (p._layer > maxLayer) maxLayer = p._layer;
    });

    for (let l = -100; l <= maxLayer; l++) {
        if (l > maxElevFilter) continue;

        const layerPlatforms = platforms.filter(p => p._layer === l);
        layerPlatforms.forEach(p => {
            let poly = getPlatformPolygon(p);
            if (poly.length < 3) return;
            ctx.beginPath();
            let s0 = worldToScreen(poly[0].x, poly[0].y);
            ctx.moveTo(s0.x, s0.y);
            for (let i = 1; i < poly.length; i++) {
                let si = worldToScreen(poly[i].x, poly[i].y);
                ctx.lineTo(si.x, si.y);
            }
            ctx.closePath();
            ctx.fillStyle = selectedPlatforms.has(p.id) ? 'rgba(255, 235, 59, 0.5)' : (p.color || 'rgba(200,200,200,0.8)');
            ctx.fill();
            ctx.strokeStyle = p.outlineColor || '#555555';
            ctx.lineWidth = selectedPlatforms.has(p.id) ? 3 : 1;
            ctx.stroke();
        });

        const layerTracks = tracks.filter(t => t._layer === l);
        layerTracks.forEach(t => {
            let isSel = selectedTracks.has(t.id);
            let isCont = isSel && continuousPath && continuousPath.some(cp => cp.track.id === t.id);
            drawSegment(t, false, isSel, 'base', isCont);
        });
        layerTracks.forEach(t => drawSegment(t, false, selectedTracks.has(t.id), 'rail'));

        layerTracks.forEach(t => {
            if (t.oneWay && t.oneWay !== 0) {
                const numArrows = Math.max(1, Math.floor(t.length / 20));
                for (let i = 1; i <= numArrows; i++) {
                    const param = i / (numArrows + 1);
                    const pts = getTrackPoints(t);
                    const idx = Math.floor(param * (pts.length - 1));
                    const midP = pts[idx];
                    const sMid = worldToScreen(midP.x, midP.y);
                    const dir = t.oneWay === 1 ? midP.dir : normalizeAngle(midP.dir + Math.PI);

                    ctx.beginPath();
                    ctx.moveTo(sMid.x + Math.cos(dir) * 12, sMid.y + Math.sin(dir) * 12);
                    ctx.lineTo(sMid.x + Math.cos(dir + 2.6) * 8, sMid.y + Math.sin(dir + 2.6) * 8);
                    ctx.lineTo(sMid.x + Math.cos(dir - 2.6) * 8, sMid.y + Math.sin(dir - 2.6) * 8);
                    ctx.closePath();
                    ctx.fillStyle = '#00a8ff';
                    ctx.fill();
                }
            }
        });
    }

    if (preview.active && Math.min(preview.elevStart, preview.elevEnd) <= maxElevFilter) {
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

    platformBoundaries.forEach(b => {
        let n1 = platformNodes.find(n => n.id === b.node1);
        if (!n1 || n1.elev > maxElevFilter) return;

        ctx.strokeStyle = 'rgba(150, 50, 200, 0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath();
        b.segments.forEach(seg => {
            if (seg.type === 'straight') {
                let s = worldToScreen(seg.start.x, seg.start.y); let e = worldToScreen(seg.end.x, seg.end.y);
                ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
            } else {
                let c = worldToScreen(seg.cx, seg.cy);
                ctx.arc(c.x, c.y, seg.radius * camera.zoom, seg.startAngle, seg.endAngle, !seg.ccw);
            }
        });
        ctx.stroke(); ctx.setLineDash([]);
    });

    platformNodes.forEach(pn => {
        if (pn.elev > maxElevFilter) return;
        const isSelected = platformBuildSequence.includes(pn.id);
        if (camera.zoom < 0.3 && !isSelected && mode !== 'plat_node' && mode !== 'plat_build') return;

        const s = worldToScreen(pn.x, pn.y);
        ctx.fillStyle = isSelected ? '#ff00ff' : '#9c27b0';
        ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    if (mode === 'plat_build' && platformBuildSequence.length > 0) {
        ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2; ctx.beginPath();
        let first = platformNodes.find(n => n.id === platformBuildSequence[0]);
        if (first) {
            let sf = worldToScreen(first.x, first.y); ctx.moveTo(sf.x, sf.y);
            for (let i = 1; i < platformBuildSequence.length; i++) {
                let next = platformNodes.find(n => n.id === platformBuildSequence[i]);
                if (next) { let sn = worldToScreen(next.x, next.y); ctx.lineTo(sn.x, sn.y); }
            }
            ctx.stroke();
        }
    }

    nodes.forEach(n => {
        if (n.elev > maxElevFilter) return;
        const isSelected = selectedNodes.has(n.id);
        if (camera.zoom < 0.3 && !isSelected && mode !== 'build' && mode !== 'insert') return;

        const s = worldToScreen(n.x, n.y);
        ctx.fillStyle = isSelected ? '#ff0000' : '#ffc107';
        ctx.beginPath();
        ctx.arc(s.x, s.y, isSelected ? 6 : 4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        if (mode === 'select') {
            ctx.fillStyle = '#000'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(Math.round(n.elev) + 'm', s.x + 8, s.y - 8);
        }
    });

    if (mode === 'select') {
        tracks.forEach(t => {
            if (t.elevStart > maxElevFilter) return;
            const pts = getTrackPoints(t);
            const midP = pts[Math.floor(pts.length / 2)];
            const sMid = worldToScreen(midP.x, midP.y);
            const speed = t.speedLimit || (t.type === 'arc' ? Math.min(160, Math.floor(4.5 * Math.sqrt(t.radius))) : 160);
            ctx.fillStyle = '#004494'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(speed, sMid.x, sMid.y - 15);
        });
    }

    requestAnimationFrame(render);
}

function drawHandle(pt, color) {
    if (!pt) return;
    const s = worldToScreen(pt.x, pt.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; ctx.beginPath(); ctx.arc(s.x, s.y, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}

function drawSegment(seg, isPreview, isSelected, drawMode, isContinuous = false) {
    const baseWidth = 3 * camera.zoom, railOffset = (gauge / 2) * camera.zoom;
    let baseColor = isContinuous ? '#ffeb3b' : (isSelected ? '#ffaaaa' : (isPreview ? 'rgba(136,136,136,0.5)' : '#888'));
    let railColor = isPreview ? 'rgba(0,0,0,0.5)' : '#000';
    ctx.lineCap = 'butt';

    if (seg.type === 'straight') {
        const s = worldToScreen(seg.start.x, seg.start.y), e = worldToScreen(seg.end.x, seg.end.y);
        if (drawMode === 'base') {
            if (isContinuous) {
                ctx.strokeStyle = '#f39c12'; ctx.lineWidth = baseWidth + (4 * camera.zoom);
                ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
            }
            ctx.strokeStyle = baseColor; ctx.lineWidth = baseWidth;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        } else if (drawMode === 'rail') {
            const dx = e.x - s.x, dy = e.y - s.y, len = Math.hypot(dx, dy);
            const nx = -dy / len * railOffset, ny = dx / len * railOffset;
            ctx.strokeStyle = railColor; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(s.x + nx, s.y + ny); ctx.lineTo(e.x + nx, e.y + ny); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s.x - nx, s.y - ny); ctx.lineTo(e.x - nx, e.y - ny); ctx.stroke();
        }
    } else if (seg.type === 'arc') {
        const c = worldToScreen(seg.cx, seg.cy), rScreen = Math.abs(seg.radius * camera.zoom);
        if (drawMode === 'base') {
            if (isContinuous) {
                ctx.strokeStyle = '#f39c12'; ctx.lineWidth = baseWidth + (4 * camera.zoom);
                ctx.beginPath(); ctx.arc(c.x, c.y, rScreen, seg.startAngle, seg.endAngle, !seg.ccw); ctx.stroke();
            }
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