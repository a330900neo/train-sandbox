// --- SIMULATION & DATA MODELS ---
window.depots = [];
window.selectedDepot = null;
window.trains = [];
window.selectedTrain = null;
window.turnaroundAreas = []; // [{id, trackIds: [str,...]}]

// Clock & Time Simulation State
window.sim = {
    time: 8 * 3600, // Starts at 08:00:00
    speed: 1,
    lines: [],
    editingLine: null,
    editingDir: 'inbound',
    settingSecondaryFor: null
};

window.SIM_CONFIG = { depotTrackSpacing: 4 };

window.formatTime = function (sec) {
    let h = Math.floor(sec / 3600).toString().padStart(2, '0');
    let m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    let s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

window.parseSchedule = function (str) {
    if (!str) return [];
    try {
        let parts = str.split('+');
        let start = window.parseTime(parts[0].trim());
        if (isNaN(start)) return [];
        let res = [start];
        if (parts[1]) {
            let sub = parts[1].split('*');
            let intvStr = sub[0].trim();
            let intv = window.parseTime(intvStr);
            if (isNaN(intv)) return res;
            let cnt = parseInt(sub[1]) || 1;
            for (let i = 1; i < cnt; i++) res.push(start + i * intv);
        }
        return res;
    } catch (e) { return []; }
}

window.parseTime = function (s) {
    let p = s.split(':').map(Number);
    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
}

// --- DEPOT LOGIC ---
window.generateDepotGeometry = function (idBase, x, y, dir, length, width, elev) {
    let tArr = []; let nArr = [];
    let dx = Math.cos(dir), dy = Math.sin(dir), nx = -Math.sin(dir), ny = Math.cos(dir);
    let halfL = length / 2, tOffset = window.SIM_CONFIG.depotTrackSpacing / 2;

    for (let i = -1; i <= 1; i += 2) {
        let cx = x + nx * (tOffset * i), cy = y + ny * (tOffset * i);
        let sX = cx - dx * halfL, sY = cy - dy * halfL, eX = cx + dx * halfL, eY = cy + dy * halfL;
        let nStart = { id: idBase + '_n_s_' + i, x: sX, y: sY, dir: dir, elev: elev };
        let nEnd = { id: idBase + '_n_e_' + i, x: eX, y: eY, dir: dir, elev: elev };
        let track = {
            id: idBase + '_t_' + i, type: 'straight',
            start: nStart, end: nEnd, dir1: dir, dir2: dir, length: length,
            elevStart: elev, elevEnd: elev, speedLimit: 40, oneWay: 0
        };
        nArr.push(nStart, nEnd); tArr.push(track);
    }
    return { tracks: tArr, nodes: nArr };
};

window.drawDepotBox = function (ctx, camera, depot, isPreview, isSelected, w2s) {
    let s = w2s(depot.x, depot.y);
    let w = depot.width * camera.zoom, l = depot.length * camera.zoom;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(depot.dir);
    ctx.fillStyle = isPreview ? 'rgba(100, 150, 255, 0.5)' : (isSelected ? 'rgba(255, 200, 100, 0.8)' : 'rgba(120, 130, 140, 0.8)');
    ctx.strokeStyle = isSelected ? '#ff0000' : '#444'; ctx.lineWidth = isSelected ? 3 : 1;
    ctx.fillRect(-l / 2, -w / 2, l, w); ctx.strokeRect(-l / 2, -w / 2, l, w);
    ctx.beginPath(); ctx.moveTo(-l / 2, 0); ctx.lineTo(l / 2, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
};

window.isPointInDepot = function (pt, depot) {
    let dx = pt.x - depot.x, dy = pt.y - depot.y;
    let localX = dx * Math.cos(-depot.dir) - dy * Math.sin(-depot.dir);
    let localY = dx * Math.sin(-depot.dir) + dy * Math.cos(-depot.dir);
    return Math.abs(localX) <= depot.length / 2 && Math.abs(localY) <= depot.width / 2;
};

window.saveDepotProps = function () {
    if (!window.selectedDepot) return;
    window.selectedDepot.trains = document.getElementById('prop-depot-trains').value;
    window.selectedDepot.carriages = parseInt(document.getElementById('prop-depot-carriages').value) || 4;
    window.selectedDepot.line = document.getElementById('prop-depot-line').value;
    window.selectedDepot.accel = parseFloat(document.getElementById('prop-depot-accel').value);
    window.selectedDepot.brake = parseFloat(document.getElementById('prop-depot-brake').value);
    window.selectedDepot.ebrake = parseFloat(document.getElementById('prop-depot-ebrake').value);
    window.selectedDepot.maxSpeed = parseFloat(document.getElementById('prop-depot-speed').value);
    window.selectedDepot.color = document.getElementById('prop-depot-color').value;

    let len = window.selectedDepot.carriages * 25 + Math.max(0, window.selectedDepot.carriages - 1);
    document.getElementById('prop-depot-len-disp').innerText = len;
};

// --- LINE MANAGER UI ---
window.initSimUI = function () {
    ['trains', 'carriages', 'line', 'accel', 'brake', 'ebrake', 'speed', 'color'].forEach(prop => {
        let el = document.getElementById('prop-depot-' + prop);
        if (el) el.addEventListener('change', (e) => {
            if (prop === 'brake' || prop === 'ebrake') {
                let b = parseFloat(document.getElementById('prop-depot-brake').value);
                let ebEl = document.getElementById('prop-depot-ebrake');
                let eb = parseFloat(ebEl.value);
                if (eb <= b) ebEl.value = (b + 0.1).toFixed(1);
            }
            if (prop === 'speed') { let s = parseFloat(e.target.value); if (s > 160) e.target.value = 160; }
            window.saveDepotProps();
        });
    });

    document.getElementById('slider-sim-speed').oninput = (e) => {
        window.sim.speed = parseInt(e.target.value);
        document.getElementById('val-sim-speed').innerText = e.target.value;
    };

    document.getElementById('line-selector').onchange = (e) => {
        if (e.target.value === 'new') window.createNewLine();
        else {
            let l = window.sim.lines.find(x => x.id == e.target.value);
            if (l) {
                window.sim.editingLine = l;
                document.getElementById('line-name').value = l.name;
                document.getElementById('line-color').value = l.color;
                document.getElementById('line-buffer').value = l.buffer || 5;
                document.getElementById('val-line-buffer').innerText = l.buffer || 5;
                window.refreshLineEditor();
            }
        }
    };

    document.getElementById('btn-line-inbound').onclick = () => { window.sim.editingDir = 'inbound'; document.getElementById('btn-line-inbound').classList.add('active'); document.getElementById('btn-line-outbound').classList.remove('active'); window.refreshLineEditor(); };
    document.getElementById('btn-line-outbound').onclick = () => { window.sim.editingDir = 'outbound'; document.getElementById('btn-line-outbound').classList.add('active'); document.getElementById('btn-line-inbound').classList.remove('active'); window.refreshLineEditor(); };

    document.getElementById('line-buffer').oninput = (e) => {
        document.getElementById('val-line-buffer').innerText = e.target.value;
        if (window.sim.editingLine) window.sim.editingLine.buffer = parseInt(e.target.value);
    };

    document.getElementById('btn-line-add-time').onclick = () => {
        if (!window.sim.editingLine) return;
        let input = document.getElementById('line-schedule-input').value.trim();

        // Fleet schedule format: "HH:MM:SS N" (time + space + train count)
        let fleetMatch = input.match(/^(\d{1,2}:\d{2}:\d{2})\s+(\d+)$/);
        if (fleetMatch) {
            let t = window.parseTime(fleetMatch[1]);
            let count = parseInt(fleetMatch[2]);
            let schedule = window.sim.editingLine.fleetSchedule || [];
            schedule.push({ time: t, count: count });
            schedule.sort((a, b) => a.time - b.time);
            window.sim.editingLine.fleetSchedule = schedule;
            document.getElementById('line-schedule-input').value = '';
            window.renderScheduleList();
            return;
        }

        // Legacy departure time: "HH:MM:SS" or "HH:MM:SS+Int*Cnt"
        let newTimes = window.parseSchedule(input);
        if (newTimes.length > 0) {
            let dir = window.sim.editingDir;
            let current = window.sim.editingLine[dir].departures || [];
            current = current.concat(newTimes.map(t => ({ time: t, spawned: false })));
            current.sort((a, b) => a.time - b.time);
            window.sim.editingLine[dir].departures = current;
            document.getElementById('line-schedule-input').value = '';
            window.renderScheduleList();
        }
    };

    document.getElementById('line-name').onchange = (e) => { if (window.sim.editingLine) window.sim.editingLine.name = e.target.value; };
    document.getElementById('line-color').onchange = (e) => { if (window.sim.editingLine) window.sim.editingLine.color = e.target.value; };

    document.getElementById('btn-line-save').onclick = () => {
        let l = window.sim.editingLine;
        if (!l) return;
        l.name = document.getElementById('line-name').value || 'Line';
        l.color = document.getElementById('line-color').value || '#ff0000';
        window.calculateLinePathsAndSchedule(l);
        let exist = window.sim.lines.find(x => x.id === l.id);
        if (!exist) window.sim.lines.push(l); else Object.assign(exist, l);
        window.refreshLineSelector(); alert('Line Simulated & Schedules Generated!');
    };

    document.getElementById('btn-line-delete').onclick = () => {
        if (window.sim.editingLine) {
            window.sim.lines = window.sim.lines.filter(l => l.id !== window.sim.editingLine.id);
            window.createNewLine(); window.refreshLineSelector();
        }
    };

    document.getElementById('btn-train-despawn').onclick = () => {
        if (window.selectedTrain) {
            window.trains = window.trains.filter(t => t.id !== window.selectedTrain.id);
            window.selectedTrain = null;
            document.getElementById('ui-train-info').classList.add('hidden');
        }
    }
};

window.createNewLine = function () {
    window.sim.editingLine = {
        id: Date.now() + Math.random(), name: 'New Line', color: '#ff0000', buffer: 5,
        fleetSchedule: [], // [{time, count}] - number of trains to run at each time
        inbound: { stations: [], departures: [], stationTimetable: [] },
        outbound: { stations: [], departures: [], stationTimetable: [] }
    };
    window.sim.editingDir = 'inbound';
    document.getElementById('line-name').value = 'New Line';
    document.getElementById('line-color').value = '#ff0000';
    document.getElementById('line-buffer').value = 5;
    document.getElementById('val-line-buffer').innerText = 5;
    document.getElementById('btn-line-inbound').click();
    window.refreshLineEditor();
};

window.refreshLineSelector = function () {
    let sel = document.getElementById('line-selector');
    sel.innerHTML = '<option value="new">+ Create New Line</option>';
    window.sim.lines.forEach(l => {
        let opt = document.createElement('option'); opt.value = l.id; opt.innerText = l.name; sel.appendChild(opt);
    });
    if (window.sim.editingLine) sel.value = window.sim.editingLine.id || 'new';
};

window.refreshLineEditor = function () {
    if (!window.sim.editingLine) return;
    let l = window.sim.editingLine; let dir = window.sim.editingDir;
    let list = document.getElementById('line-stations');
    list.innerHTML = '';
    l[dir].stations.forEach((st, idx) => {
        let count = st.trackIds ? st.trackIds.length : 1;
        let li = document.createElement('li');
        li.innerHTML = `
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${st.sec ? 'Main+Sec' : 'Platform (' + count + 't)'}</span>
            <input type="number" value="${st.dwell}" onchange="window.updateDwell(${idx}, this.value)" title="Dwell(s)">s
            <button onclick="window.setSecondary(${idx})" style="${window.sim.settingSecondaryFor === idx ? 'background:orange' : ''}">+Sec</button>
            <button onclick="window.removeSecondary(${idx})" style="${!st.sec ? 'display:none' : ''}">Rem Sec</button>
            <button onclick="window.removeStation(${idx})" class="danger">X</button>
        `;
        list.appendChild(li);
    });
    window.renderScheduleList();
};

window.renderScheduleList = function () {
    let list = document.getElementById('line-schedule-list');
    list.innerHTML = '';
    if (!window.sim.editingLine) return;

    // Show fleet schedule entries (new system)
    let fleetSched = window.sim.editingLine.fleetSchedule || [];
    fleetSched.forEach((entry, idx) => {
        let li = document.createElement('li');
        li.style.cssText = 'display:flex; justify-content:space-between; padding:2px 4px; border-bottom:1px solid #eee; background:#e8f4ff;';
        li.innerHTML = `<span>⏰ ${window.formatTime(entry.time)} → <b>${entry.count}</b> trains</span><button onclick="window.removeFleetEntry(${idx})" class="danger" style="padding:2px 6px;font-size:10px;">X</button>`;
        list.appendChild(li);
    });

    // Show legacy departure times if present
    let deps = window.sim.editingLine[window.sim.editingDir].departures || [];
    deps.forEach((dep, idx) => {
        let li = document.createElement('li');
        li.style.cssText = 'display:flex; justify-content:space-between; padding:2px 4px; border-bottom:1px solid #eee;';
        li.innerHTML = `<span>🚂 ${window.formatTime(dep.time)}</span><button onclick="window.removeDeparture(${idx})" class="danger" style="padding:2px 6px;font-size:10px;">X</button>`;
        list.appendChild(li);
    });
};

window.removeDeparture = function (idx) {
    if (!window.sim.editingLine) return;
    window.sim.editingLine[window.sim.editingDir].departures.splice(idx, 1);
    window.renderScheduleList();
};

window.removeFleetEntry = function (idx) {
    if (!window.sim.editingLine) return;
    if (!window.sim.editingLine.fleetSchedule) return;
    window.sim.editingLine.fleetSchedule.splice(idx, 1);
    window.renderScheduleList();
};

window.addLineStation = function (trackId) {
    if (!window.sim.editingLine) return;
    let arr = window.sim.editingLine[window.sim.editingDir].stations;
    let platformTrackIds = [trackId.toString()];
    if (window.platformBoundaries) {
        for (let b of window.platformBoundaries) {
            let ids = b.pathId.split(',');
            if (ids.includes(trackId.toString())) { platformTrackIds = ids; break; }
        }
    }
    if (window.sim.settingSecondaryFor !== null) {
        if (window.sim.settingSecondaryFor < arr.length) arr[window.sim.settingSecondaryFor].sec = platformTrackIds;
        window.sim.settingSecondaryFor = null;
    } else arr.push({ trackIds: platformTrackIds, dwell: 30, sec: null });
    window.refreshLineEditor();
};

window.updateDwell = function (idx, val) { window.sim.editingLine[window.sim.editingDir].stations[idx].dwell = parseInt(val) || 0; };
window.setSecondary = function (idx) { window.sim.settingSecondaryFor = window.sim.settingSecondaryFor === idx ? null : idx; window.refreshLineEditor(); };
window.removeSecondary = function (idx) { window.sim.editingLine[window.sim.editingDir].stations[idx].sec = null; window.refreshLineEditor(); };
window.removeStation = function (idx) { window.sim.editingLine[window.sim.editingDir].stations.splice(idx, 1); window.refreshLineEditor(); };


// --- DYNAMIC GRAPH CONSTRUCTION ---
window.buildGraph = function () {
    let graph = new Map();
    if (!window.tracks || !window.nodes) return graph;

    const POS_SNAP = 1.0; // metres — positions within this are same node
    let posToCanonId = new Map();
    let snapKey = (x, y) => `${Math.round(x / POS_SNAP)},${Math.round(y / POS_SNAP)}`;

    if (window.nodes) {
        window.nodes.forEach(n => {
            let k = snapKey(n.x, n.y);
            if (!posToCanonId.has(k)) posToCanonId.set(k, n.id);
        });
    }

    // Store node positions keyed by ID for geometry fallback in _trackOutwardTangent
    let nodePositions = new Map();
    if (window.nodes) window.nodes.forEach(n => nodePositions.set(n.id.toString(), n));
    window._nodePositions = nodePositions;

    let canonNode = (x, y, fallbackId) => {
        let k = snapKey(x, y);
        if (posToCanonId.has(k)) return posToCanonId.get(k);
        posToCanonId.set(k, fallbackId);
        return fallbackId;
    };

    window.tracks.forEach(t => {
        let sNodeRaw = window.nodes.find(n => Math.hypot(n.x - t.start.x, n.y - t.start.y) < POS_SNAP);
        let eNodeRaw = window.nodes.find(n => Math.hypot(n.x - t.end.x, n.y - t.end.y) < POS_SNAP);
        if (!sNodeRaw || !eNodeRaw) return;

        let sId = canonNode(t.start.x, t.start.y, sNodeRaw.id);
        let eId = canonNode(t.end.x, t.end.y, eNodeRaw.id);

        // Ensure canonical IDs have position entries (handles depot remapped nodes)
        if (!nodePositions.has(sId.toString())) nodePositions.set(sId.toString(), { x: t.start.x, y: t.start.y, id: sId });
        if (!nodePositions.has(eId.toString())) nodePositions.set(eId.toString(), { x: t.end.x, y: t.end.y, id: eId });

        if (!graph.has(sId)) graph.set(sId, []);
        if (!graph.has(eId)) graph.set(eId, []);
        let spd = t.speedLimit || (t.type === 'arc' ? Math.min(160, 4.5 * Math.sqrt(t.radius)) : 160);

        // Compute departure directions from coordinate geometry (not dir1/dir2 which may be wrong)
        let sDx = t.end.x - t.start.x, sDy = t.end.y - t.start.y;
        let baseAngle = Math.atan2(sDy, sDx);
        let deptFromS, deptFromE;

        if (t.type === 'arc' && t.cx !== undefined && t.cy !== undefined) {
            let rsX = t.start.x - t.cx, rsY = t.start.y - t.cy;
            let reX = t.end.x - t.cx, reY = t.end.y - t.cy;
            let tsX, tsY, teX, teY;
            if (t.ccw) { tsX = -rsY; tsY = rsX; teX = -reY; teY = reX; }
            else { tsX = rsY; tsY = -rsX; teX = reY; teY = -reX; }
            deptFromS = Math.atan2(tsY, tsX);
            deptFromE = normalizeAngle(Math.atan2(teY, teX) + Math.PI);
        } else {
            deptFromS = baseAngle;
            deptFromE = normalizeAngle(baseAngle + Math.PI);
        }

        if (t.oneWay !== -1) graph.get(sId).push({ trackId: t.id, to: eId, cost: t.length, speed: spd, departDir: deptFromS });
        if (t.oneWay !== 1) graph.get(eId).push({ trackId: t.id, to: sId, cost: t.length, speed: spd, departDir: deptFromE });
    });

    window._cachedGraph = graph;
    window._canonNodeMap = posToCanonId;
    return graph;
};

// Returns the physical tangent departure angle from fromNodeId along trackId.
window._getEdgeDir = function (trackId, fromNodeId, graphOrNull) {
    let g = graphOrNull || window._cachedGraph;
    if (g) {
        let edges = g.get(fromNodeId) || [];
        let e = edges.find(ed => ed.trackId === trackId || ed.trackId.toString() === trackId.toString());
        if (e && e.departDir !== undefined) return e.departDir;
        // Also try canonicalized fromNodeId
        if (window._canonNodeMap) {
            let node = window.nodes && window.nodes.find(n => n.id.toString() === fromNodeId.toString());
            if (node) {
                let canonId = window._canonNodeMap.get(`${Math.round(node.x)},${Math.round(node.y)}`);
                if (canonId && canonId !== fromNodeId) {
                    let canonEdges = g.get(canonId) || [];
                    let ce = canonEdges.find(ed => ed.trackId === trackId || ed.trackId.toString() === trackId.toString());
                    if (ce && ce.departDir !== undefined) return ce.departDir;
                }
            }
        }
    }
    let t = window.tracks.find(x => x.id === trackId || x.id.toString() === trackId.toString());
    if (!t) return null;
    let dir2 = (t.dir2 !== undefined) ? t.dir2 : t.dir1;
    let sNode = window.nodes.find(n => Math.hypot(n.x - t.start.x, n.y - t.start.y) < 1.0);
    if (sNode && sNode.id.toString() === fromNodeId.toString()) return t.dir1;
    return normalizeAngle(dir2 + Math.PI);
};

// =============================================================================
// GEOMETRY-BASED TURN DETECTION
//
// Forget angle-bookkeeping through the graph. Instead:
//   At a node, each connected track has a PHYSICAL tangent direction pointing
//   AWAY from the node (outward tangent).
//   Tracks on "opposite sides" of a node (tangents ~180° apart) are through-routes.
//   Tracks on the "same side" (tangents < 90° apart) are sharp turns / U-turns.
//
// Algorithm:
//   1. Get outward tangent of incoming track at node (= arrivalDir reversed, i.e. the
//      direction the track continues AWAY from the node back toward where the train came from).
//   2. Get outward tangent of candidate track at node (= departDir, pointing away from node).
//   3. Angle between them: ~180° = straight through (good). ~0° = U-turn (bad). ~90° = junction.
//
// This works regardless of which direction the track was placed by the player,
// because we always use the physical geometry at the node.
// =============================================================================
const SHARP_ANGLE_THRESHOLD = Math.PI * 2 / 3;  // 120°
const UTURN_THRESHOLD = Math.PI * 5 / 6;  // 150°

// =============================================================================
// PURE COORDINATE TANGENT — never uses dir1/dir2 (unreliable, may be flipped)
//
// For STRAIGHT tracks: tangent at start = atan2(end-start), tangent at end = reverse.
// For ARC tracks: tangent = perpendicular to radius at that endpoint.
//   Arc center is track.cx, track.cy. CCW arcs rotate tangent +90°, CW -90°.
//
// "Outward" = pointing AWAY from the node into the track body.
// If the node is at the START of the track, the outward tangent = toward END.
// If at END, outward tangent = toward START.
// =============================================================================
function _trackOutwardTangentAtPos(track, nodePos) {
    const SNAP = 2.0;
    let dStart = Math.hypot(track.start.x - nodePos.x, track.start.y - nodePos.y);
    let dEnd = Math.hypot(track.end.x - nodePos.x, track.end.y - nodePos.y);
    let atStart = dStart <= dEnd;

    if (track.type === 'arc' && track.cx !== undefined && track.cy !== undefined) {
        // Tangent at a point P on circle center C:
        //   radius = P - C
        //   CCW tangent = rotate radius +90° → (-ry, rx)
        //   CW  tangent = rotate radius -90° → (ry, -rx)
        // This gives the direction of travel in the arc's winding direction (start→end).
        let px = atStart ? track.start.x : track.end.x;
        let py = atStart ? track.start.y : track.end.y;
        let rx = px - track.cx;
        let ry = py - track.cy;
        let tx, ty;
        if (track.ccw) { tx = -ry; ty = rx; }
        else { tx = ry; ty = -rx; }
        let forwardAngle = Math.atan2(ty, tx); // direction start→end at this endpoint
        // If at start: outward = forwardAngle (leaving node toward end)
        // If at end:   outward = reverse (leaving node back toward start)
        return atStart ? forwardAngle : normalizeAngle(forwardAngle + Math.PI);
    }

    // Straight (or arc without center): use endpoint coordinates
    let dx = track.end.x - track.start.x;
    let dy = track.end.y - track.start.y;
    let baseAngle = Math.atan2(dy, dx); // direction start→end
    return atStart ? baseAngle : normalizeAngle(baseAngle + Math.PI);
}

// Get node position as {x,y} from any nodeId, using _nodePositions map or nodes array.
function _nodePos(nodeId) {
    if (window._nodePositions) {
        let n = window._nodePositions.get(nodeId.toString());
        if (n) return n;
    }
    if (window.nodes) {
        let n = window.nodes.find(n => n.id.toString() === nodeId.toString());
        if (n) return n;
    }
    return null;
}

// Core turn angle using purely geometric outward tangents.
// incomingTrackId: track the train just came FROM (we arrived along this)
// candidateTrackId: track we're considering going TO
// nodeId: the junction node
//
// Method:
//   Both tracks connect at nodeId. Each track has an outward tangent at that node
//   (pointing AWAY from the node into the track body).
//   If the two outward tangents are ~180° apart → tracks go in opposite directions
//     → straight through → deviation ≈ 0 (allowed).
//   If the two outward tangents are ~0° apart → both leave the node in same direction
//     → U-turn (train would reverse) → deviation ≈ 180° (blocked).
//
// Special case: same track → always U-turn regardless of tangent.
function _getTurnAngle(incomingTrackId, candidateTrackId, nodeId, graph) {
    // Same track = always a U-turn
    if (incomingTrackId.toString() === candidateTrackId.toString()) return Math.PI;

    let inTrack = window.tracks && window.tracks.find(t => t.id === incomingTrackId || t.id.toString() === incomingTrackId.toString());
    let outTrack = window.tracks && window.tracks.find(t => t.id === candidateTrackId || t.id.toString() === candidateTrackId.toString());
    if (!inTrack || !outTrack) return 0;

    let pos = _nodePos(nodeId);
    if (!pos) {
        // Can't resolve node position — fall back to permissive (allow)
        return 0;
    }

    let inOutward = _trackOutwardTangentAtPos(inTrack, pos);
    let outOutward = _trackOutwardTangentAtPos(outTrack, pos);

    // Angle between outward tangents (0–PI)
    let between = Math.abs(normalizeAngle(outOutward - inOutward));

    // deviation: 0 = straight through, PI = U-turn
    return Math.abs(Math.PI - between);
}

function _isUTurn(incomingId, candidateId, nodeId, graph) {
    return _getTurnAngle(incomingId, candidateId, nodeId, graph) > UTURN_THRESHOLD;
}

function _isSharpTurn(incomingId, candidateId, nodeId, graph) {
    return _getTurnAngle(incomingId, candidateId, nodeId, graph) > SHARP_ANGLE_THRESHOLD;
}

// =============================================================================
// TURNAROUND AREA FINDER (player-defined areas only)
//
// A turnaround area is a set of track IDs defined by the player (via selection
// tool). Trains that cannot find a forward path will approach the nearest
// reachable turnaround area, stop fully (like a platform), then reverse.
//
// Returns: { areaId, entryNodeId, entryTrackId, stopTrackIds } describing
//   which area to use and how to approach it. null if none reachable.
// =============================================================================
window.findTurnaroundArea = function (graph, startNodeId, incomingTrackId, trainLength) {
    let areas = window.turnaroundAreas || [];
    if (areas.length === 0) return null;

    // Dijkstra from startNodeId to find the nearest reachable turnaround area
    // without sharp-turn restriction (train needs to get there somehow).
    let distMap = new Map();
    let prev = new Map();
    let stateKey = (nid, tid) => String(nid) + '|' + String(tid || '');
    let startSk = stateKey(startNodeId, incomingTrackId || null);
    let pq = [{ id: startNodeId, cost: 0, lastTrack: incomingTrackId || null, sk: startSk }];
    distMap.set(startSk, 0);

    let bestArea = null, bestCost = Infinity, bestSk = null;

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        let u = pq.shift();
        if ((distMap.get(u.sk) || Infinity) < u.cost) continue;
        if (u.cost > 5000) break; // don't search too far

        // Check if current node has an edge into a turnaround area
        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            let edgeTidStr = String(edge.trackId);
            if (u.lastTrack && String(u.lastTrack) === edgeTidStr) continue; // same track U-turn

            // Reject sharp turns when traveling toward turnaround (we want smooth approach)
            if (u.lastTrack) {
                let angle = _getTurnAngle(u.lastTrack, edge.trackId, u.id, graph);
                if (angle > SHARP_ANGLE_THRESHOLD) continue;
            }

            let alt = u.cost + edge.cost;
            let nextSk = stateKey(edge.to, edge.trackId);
            if (!distMap.has(nextSk) || alt < distMap.get(nextSk)) {
                distMap.set(nextSk, alt);
                prev.set(nextSk, { fromNode: u.id, fromTrack: u.lastTrack, edge });
                pq.push({ id: edge.to, cost: alt, lastTrack: edge.trackId, sk: nextSk });
            }

            // Does this edge's track belong to a turnaround area?
            for (let area of areas) {
                if (area.trackIds.includes(edgeTidStr)) {
                    if (alt < bestCost) {
                        bestCost = alt;
                        bestArea = area;
                        bestSk = nextSk;
                    }
                }
            }
        }
    }

    if (!bestArea) return null;

    // Reconstruct approach path up to the turnaround area entry
    let path = [];
    let cur = bestSk;
    let visited = new Set([cur]);
    let safety = 0;
    while (prev.has(cur) && safety++ < 500) {
        let p = prev.get(cur);
        path.unshift({ trackId: p.edge.trackId, fromNode: p.fromNode, toNode: p.edge.to, cost: p.edge.cost });
        let nextCur = stateKey(p.fromNode, p.fromTrack);
        if (visited.has(nextCur)) break;
        visited.add(nextCur);
        cur = nextCur;
    }

    return {
        areaId: bestArea.id,
        trackIds: bestArea.trackIds,
        approachPath: path
    };
};

// =============================================================================
// FULL PATH PRECOMPUTATION
// Returns an ordered array of {trackId, fromNode, toNode, speed, cost} steps
// from startNodeId to any track in targetTrackIds.
//
// allowSharpTurns=false  → reject sharp angle turns AND U-turns (normal travel)
// allowSharpTurns=true   → allow all turns (used after turnaround)
//
// If no path found with sharp-turn rejection, returns null (caller tries turnaround).
// =============================================================================
window.computeFullPath = function (graph, startNodeId, targetTrackIds, incomingTrackId, allowSharpTurns) {
    let tIds = Array.isArray(targetTrackIds) ? targetTrackIds.map(String) : [targetTrackIds.toString()];
    if (allowSharpTurns === undefined) allowSharpTurns = false;

    // State key: (nodeId, lastTrackId) — Dijkstra explores per-state so turn
    // angles are correctly evaluated at every hop.
    let distMap = new Map();
    let prev = new Map();
    let stateKey = (nid, tid) => String(nid) + '|' + String(tid || '');
    let startSk = stateKey(startNodeId, incomingTrackId || null);
    let pq = [{ id: startNodeId, cost: 0, lastTrack: incomingTrackId || null, sk: startSk, tracksUsed: new Set(incomingTrackId ? [String(incomingTrackId)] : []) }];
    distMap.set(startSk, 0);

    let foundTargetEdge = null;
    let foundAtNode = null;
    let foundLastTrack = null;
    let foundTracksUsed = null;

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        let u = pq.shift();
        if ((distMap.get(u.sk) || Infinity) < u.cost) continue; // stale

        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            let edgeTidStr = String(edge.trackId);

            // Never reverse onto the track we just came from (U-turn on same track)
            if (u.lastTrack && String(u.lastTrack) === edgeTidStr) continue;

            // Never revisit a track already used in this path (prevents loops/zigzags)
            if (u.tracksUsed.has(edgeTidStr)) continue;

            // Reject sharp turns unless caller opts out
            if (!allowSharpTurns && u.lastTrack) {
                let angle = _getTurnAngle(u.lastTrack, edge.trackId, u.id, graph);
                if (angle > SHARP_ANGLE_THRESHOLD) continue;
            }

            let alt = u.cost + edge.cost;
            let nextSk = stateKey(edge.to, edge.trackId);
            if (!distMap.has(nextSk) || alt < distMap.get(nextSk)) {
                distMap.set(nextSk, alt);
                let newTracksUsed = new Set(u.tracksUsed);
                newTracksUsed.add(edgeTidStr);
                prev.set(nextSk, { fromNode: u.id, fromTrack: u.lastTrack, fromSk: u.sk, edge });
                pq.push({ id: edge.to, cost: alt, lastTrack: edge.trackId, sk: nextSk, tracksUsed: newTracksUsed });
            }

            if (tIds.includes(edgeTidStr)) {
                if (foundTargetEdge === null || alt < (foundTargetEdge._cost || Infinity)) {
                    foundTargetEdge = { ...edge, _cost: alt };
                    foundAtNode = u.id;
                    foundLastTrack = u.lastTrack;
                }
            }
        }
    }

    if (!foundTargetEdge) return null;

    // Reconstruct path by backtracking through prev map
    let path = [];
    let cur = stateKey(foundAtNode, foundLastTrack);
    let curNode = foundAtNode;
    let visited = new Set([cur]);
    let safety = 0;
    while (curNode !== startNodeId && prev.has(cur) && safety++ < 500) {
        let p = prev.get(cur);
        path.unshift({ trackId: p.edge.trackId, fromNode: p.fromNode, toNode: curNode, speed: p.edge.speed, cost: p.edge.cost });
        curNode = p.fromNode;
        let nextCur = stateKey(p.fromNode, p.fromTrack);
        if (visited.has(nextCur)) break; // cycle guard
        visited.add(nextCur);
        cur = nextCur;
    }
    path.push({ trackId: foundTargetEdge.trackId, fromNode: foundAtNode, toNode: foundTargetEdge.to, speed: foundTargetEdge.speed, cost: foundTargetEdge.cost });

    return path.length > 0 ? path : null;
};

// =============================================================================
// SHARP-TURN-AWARE PATH: try strict (no sharp turns), return null if impossible.
// Callers that get null should trigger a turnaround, NOT silently allow sharp turns.
// =============================================================================
window.computePathStrict = function (graph, startNodeId, targetTrackIds, incomingTrackId) {
    let strict = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId, false);
    if (strict) return { path: strict, forcedSharpTurn: false };
    let loose = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId, true);
    if (loose) return { path: loose, forcedSharpTurn: true };
    return null;
};


window.findNextTrack = function (graph, startNodeId, targetTrackIds, incomingTrackId, allowSharpTurns) {
    if (allowSharpTurns) {
        // Caller (e.g. just-spawned train or post-turnaround) explicitly allows any route.
        let path = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId, true);
        if (!path || path.length === 0) {
            console.warn(`[PATHFIND] No path at all from node ${startNodeId} (incoming: ${incomingTrackId}) to targets: ${JSON.stringify(targetTrackIds)}`);
            return null;
        }
        let first = path[0];
        let edges = graph.get(startNodeId) || [];
        return edges.find(e => e.trackId === first.trackId && e.to === first.toNode)
            || { trackId: first.trackId, to: first.toNode, cost: first.cost, speed: first.speed };
    }

    let result = window.computePathStrict(graph, startNodeId, targetTrackIds, incomingTrackId);
    if (!result || !result.path || result.path.length === 0) {
        if (!result) {
            console.warn(`[PATHFIND] No path at all from node ${startNodeId} (incoming: ${incomingTrackId}) to targets: ${JSON.stringify(targetTrackIds)}`);
        }
        return null;
    }
    if (result.forcedSharpTurn) {
        // Path only reachable via a sharp turn — return null so caller triggers turnaround.
        console.warn(`[PATHFIND] Path requires sharp turn from node ${startNodeId} (incoming: ${incomingTrackId}) — returning null to trigger turnaround`);
        return null;
    }
    let first = result.path[0];
    let edges = graph.get(startNodeId) || [];
    return edges.find(e => e.trackId === first.trackId && e.to === first.toNode)
        || { trackId: first.trackId, to: first.toNode, cost: first.cost, speed: first.speed };
};

window.calculateLinePathsAndSchedule = function (line) {
    let g = window.buildGraph();
    let bufferMult = 1 / (1 - (line.buffer || 5) / 100);

    for (let dir of ['inbound', 'outbound']) {
        line[dir].stationTimetable = [];
        let st = line[dir].stations;
        let cumulativeTime = 0;

        for (let i = 0; i < st.length; i++) {
            line[dir].stationTimetable.push(cumulativeTime);
            cumulativeTime += st[i].dwell;
            if (i < st.length - 1) {
                let currNode = null;
                for (let [nid, edges] of g.entries()) {
                    if (edges.some(e => st[i].trackIds.includes(e.trackId.toString()))) { currNode = nid; break; }
                }
                if (currNode) {
                    let simTime = 0;
                    let sanity = 0;
                    let prevTrack = null;
                    while (sanity++ < 100) {
                        let step = window.findNextTrack(g, currNode, st[i + 1].trackIds, prevTrack);
                        if (!step) break;
                        simTime += step.cost / ((step.speed * 1000) / 3600);
                        prevTrack = step.trackId;
                        currNode = step.to;
                        if (st[i + 1].trackIds.includes(step.trackId.toString())) break;
                    }
                    cumulativeTime += simTime * bufferMult;
                }
            }
        }
        line[dir].tripDuration = cumulativeTime;
    }
    line.roundTripTime = (line.inbound.tripDuration || 0) + (line.outbound.tripDuration || 0) + 120;
};

// --- BOGIE PHYSICS & TOPOLOGICAL 2D MAPPING ---
window.getExactTrackPointAndDir = function (track, tParam, forward) {
    if (track.type === 'straight') {
        let px = track.start.x + (track.end.x - track.start.x) * tParam;
        let py = track.start.y + (track.end.y - track.start.y) * tParam;
        return { x: px, y: py, dir: forward ? track.dir1 : normalizeAngle(track.dir1 + Math.PI) };
    } else {
        let ang = track.startAngle + track.dTheta * tParam;
        let px = track.cx + track.radius * Math.cos(ang);
        let py = track.cy + track.radius * Math.sin(ang);
        let tDir = normalizeAngle(ang + (track.ccw ? Math.PI / 2 : -Math.PI / 2));
        return { x: px, y: py, dir: forward ? tDir : normalizeAngle(tDir + Math.PI) };
    }
}

// History Array: [ {track, fromNode, toNode, startDist, endDist} ]
// distFromTail is a monotonically increasing journey coordinate.
//
// Boundary rule: use half-open intervals [startDist, endDist) so a point
// sitting exactly on a joint between two segments belongs to the NEXT segment,
// not the previous one.  This prevents all bogies near a joint from snapping
// to tParam=1 of the outgoing segment and clumping visually at track nodes.
window.getPointOnHistory = function (history, distFromTail) {
    if (!history || history.length === 0) return null;

    let seg = null;

    // Walk segments in order; pick the first one whose half-open interval
    // [startDist, endDist) contains distFromTail.  The very last segment uses
    // a closed interval [startDist, endDist] so the head itself is always valid.
    for (let i = 0; i < history.length; i++) {
        let h = history[i];
        let isLast = (i === history.length - 1);
        if (distFromTail >= h.startDist && (isLast ? distFromTail <= h.endDist : distFromTail < h.endDist)) {
            seg = h;
            break;
        }
    }

    // Fallback for positions outside the history range
    if (!seg) {
        seg = distFromTail < history[0].startDist ? history[0] : history[history.length - 1];
    }

    if (!seg || !seg.track) return null;

    // localDist must be clamped to [0, track.length] so tParam stays in [0,1]
    let localDist = Math.max(0, Math.min(seg.track.length, distFromTail - seg.startDist));

    let tStartNodeId = window.nodes.find(
        n => Math.hypot(n.x - seg.track.start.x, n.y - seg.track.start.y) < 0.1
    )?.id;
    let isForward = (seg.fromNode === tStartNodeId);

    let tParam = isForward
        ? (localDist / seg.track.length)
        : (1 - localDist / seg.track.length);

    tParam = Math.max(0, Math.min(1, tParam));
    return window.getExactTrackPointAndDir(seg.track, tParam, isForward);
};

// =============================================================================
// PLATFORM STOP POSITION
// A platform can span multiple consecutive track segments.
//
// Algorithm:
//   1. Sum the physical lengths of all platform tracks (from window.tracks).
//   2. Find the entry point: the smallest startDist among platform segs in history.
//   3. Platform spans [platEntryDist, platEntryDist + platTotalLength] in journey coords.
//   4. Ideal head stop = platCenter + trainLength/2  (body centre == platform centre).
//   5. Clamp: head stays within platform bounds.
// =============================================================================
window.getPlatformStopHeadDist = function (train, targetStation, history) {
    let tIds = targetStation.trackIds.map(String);

    // Total physical length of all platform tracks (known even before train enters)
    let platTotalLength = 0;
    for (let tid of tIds) {
        let t = window.tracks.find(x => x.id.toString() === tid);
        if (t) platTotalLength += t.length;
    }
    if (platTotalLength <= 0) return null;

    // Platform segments already traversed / entered in history
    let platSegs = history
        .filter(h => h.track && tIds.includes(h.track.id.toString()))
        .sort((a, b) => a.startDist - b.startDist);

    if (platSegs.length === 0) return null;

    // Journey-distance at which the train first enters the platform
    let platEntryDist = platSegs[0].startDist;
    let platExitDist = platEntryDist + platTotalLength;

    // Centre of platform in journey coordinates
    let platCenter = platEntryDist + platTotalLength / 2;

    // Head position that centres the train body in the platform
    let stopHeadDist = platCenter + train.trainLength / 2;

    // Clamp: head must be at least 1 m inside platform, no further than exit
    stopHeadDist = Math.max(platEntryDist + 1, Math.min(platExitDist, stopHeadDist));

    return stopHeadDist;
};

// =============================================================================
// LOOK-AHEAD BRAKING
// Returns the braking distance needed to stop from a given speed.
// Also returns the distance to the next station stop point across the
// current history + any already-queued upcoming track segments.
// =============================================================================
window.getDistToStation = function (train, targetStation, history) {
    if (!targetStation) return Infinity;

    // Check if we're already past the start of the platform in history
    let platSegs = history.filter(h => h.track && targetStation.trackIds.includes(h.track.id.toString()));

    if (platSegs.length > 0) {
        let stopHeadDist = window.getPlatformStopHeadDist(train, targetStation, history);
        return stopHeadDist - train.headDist;
    }

    // Platform not yet in history — estimate distance via upcoming tracks in history
    // (tracks queued ahead of headDist)
    let currentSeg = history[history.length - 1];
    if (!currentSeg) return Infinity;

    // Distance remaining on current segment
    let remaining = currentSeg.endDist - train.headDist;

    // Walk earlier-queued segments (there may be none yet; estimation only)
    // Return distance from headDist to the end of last known track + approx
    return remaining + 9999; // Will trigger look-ahead pathfinding to extend history
};

// --- FLEET SCHEDULE HELPERS ---
window.getTargetFleetSize = function (line, time) {
    let sched = line.fleetSchedule || [];
    if (sched.length === 0) return null;
    let count = 0;
    for (let entry of sched) {
        if (time >= entry.time) count = entry.count;
    }
    return count;
};

// =============================================================================
// IMPROVED SPAWN: Pathfind first, pick the correct depot track + direction
// =============================================================================
window.spawnTrainOnLine = function (line, dir, depot) {
    let g = window.buildGraph();
    let depotTrackIds = new Set((depot.tracks || []).map(String));
    let st = line[dir].stations;
    if (!st || st.length === 0) return null;
    let firstStationTrackIds = st[0].trackIds;

    // Build a lookup: depotTrackId -> [{fromNode, toNode, departDir}] from the graph.
    // This is reliable because buildGraph embeds the correct departDir per traversal direction.
    let depotEdgeMap = new Map(); // trackId -> array of {fromNode, toNode, departDir}
    for (let [nid, edges] of g) {
        for (let e of edges) {
            if (!depotTrackIds.has(e.trackId.toString())) continue;
            if (!depotEdgeMap.has(e.trackId)) depotEdgeMap.set(e.trackId, []);
            depotEdgeMap.get(e.trackId).push({ fromNode: nid, toNode: e.to, departDir: e.departDir });
        }
    }

    let bestDepTrack = null, bestFromNode = null, bestToNode = null;
    let bestPathLen = Infinity;

    for (let depTrackId of (depot.tracks || [])) {
        let candidate = window.tracks.find(t => t.id === depTrackId);
        if (!candidate) continue;
        let traversals = depotEdgeMap.get(depTrackId) || depotEdgeMap.get(depTrackId.toString()) || [];

        for (let { fromNode, toNode } of traversals) {
            // toNode is the exit end — must have external edges
            let externalEdges = (g.get(toNode) || []).filter(e => !depotTrackIds.has(e.trackId.toString()));
            if (externalEdges.length === 0) continue;

            // Pathfind from exit node WITHOUT angle restriction for first step
            // (train starts from rest, direction is determined by spawn orientation)
            let path = window.computeFullPath(g, toNode, firstStationTrackIds, null, false);
            if (!path) path = window.computeFullPath(g, toNode, firstStationTrackIds, null, true);
            if (!path) continue;

            let pathLen = path.reduce((s, p) => s + p.cost, 0) + candidate.length;
            if (pathLen < bestPathLen) {
                bestPathLen = pathLen;
                bestDepTrack = candidate;
                bestFromNode = fromNode;
                bestToNode = toNode;
            }
        }
    }

    // Fallback: any depot track whose toNode has any external connection
    if (!bestDepTrack) {
        outer: for (let depTrackId of (depot.tracks || [])) {
            let candidate = window.tracks.find(t => t.id === depTrackId);
            if (!candidate) continue;
            let traversals = depotEdgeMap.get(depTrackId) || depotEdgeMap.get(depTrackId.toString()) || [];
            for (let { fromNode, toNode } of traversals) {
                let ext = (g.get(toNode) || []).filter(e => !depotTrackIds.has(e.trackId.toString()));
                if (ext.length > 0) {
                    bestDepTrack = candidate; bestFromNode = fromNode; bestToNode = toNode;
                    break outer;
                }
            }
        }
    }

    if (!bestDepTrack) return null;

    let tLen = (depot.carriages || 4) * 25 + Math.max(0, (depot.carriages || 4) - 1);
    // Place head inside depot track (not past end), so extendTrainHistory works on tick 1
    let initialHeadDist = Math.min(tLen, bestDepTrack.length);

    let newTrain = {
        id: 'TRN' + Math.floor(Math.random() * 100000),
        lineId: line.id, dirPhase: dir,
        carriages: depot.carriages || 4, trainLength: tLen,
        color: depot.color || '#ff8800', maxSpeed: depot.maxSpeed || 60,
        accel: depot.accel || 1.0, brake: depot.brake || 1.0, ebrake: depot.ebrake || 2.0,
        speed: 0, state: 'DRIVING',
        nextStationIdx: 0, dwellTimer: 0,
        returningToDepot: false,
        plannedRoute: [],
        _justSpawned: true, // suppress angle check on first extendTrainHistory call
        history: [{
            track: bestDepTrack, fromNode: bestFromNode, toNode: bestToNode,
            startDist: 0, endDist: bestDepTrack.length
        }],
        headDist: initialHeadDist
    };
    return newTrain;
};

// Advance a train's position forward along its route for even spreading
window.advanceTrainPosition = function (train, line, dir, g, targetDist) {
    let st = line[dir].stations;
    if (!st || st.length === 0) return;
    let advanced = 0;
    let sanity = 0;

    while (advanced < targetDist && sanity++ < 500) {
        let currentSeg = train.history[train.history.length - 1];
        if (!currentSeg || !currentSeg.track) break;

        let segRemaining = currentSeg.endDist - train.headDist;
        let needed = targetDist - advanced;

        if (needed <= segRemaining) {
            train.headDist += needed;
            advanced = targetDist;
            break;
        } else {
            advanced += segRemaining;
            train.headDist = currentSeg.endDist;

            if (train.nextStationIdx < st.length && st[train.nextStationIdx].trackIds.includes(currentSeg.track.id.toString())) {
                train.nextStationIdx++;
            }

            let targetStation = train.nextStationIdx < st.length ? st[train.nextStationIdx] : null;
            if (!targetStation) break;

            let nextStep = window.findNextTrack(g, currentSeg.toNode, targetStation.trackIds, currentSeg.track.id);
            if (!nextStep) break;
            let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
            if (!nextTrack) break;
            train.history.push({
                track: nextTrack, fromNode: currentSeg.toNode, toNode: nextStep.to,
                startDist: currentSeg.endDist, endDist: currentSeg.endDist + nextTrack.length
            });
        }
    }
};

window.estimateLineTripDistance = function (line, dir) {
    let g = window.buildGraph();
    let st = line[dir].stations;
    if (!st || st.length < 2) return 0;
    let totalDist = 0;
    let currNode = null;
    for (let [nid, edges] of g.entries()) {
        if (edges.some(e => st[0].trackIds.includes(e.trackId.toString()))) { currNode = nid; break; }
    }
    if (!currNode) return 0;
    let stIdx = 0, prevTrack = null, sanity = 0;
    while (stIdx < st.length - 1 && sanity++ < 300) {
        let step = window.findNextTrack(g, currNode, st[stIdx + 1].trackIds, prevTrack);
        if (!step) break;
        totalDist += step.cost;
        prevTrack = step.trackId;
        currNode = step.to;
        if (st[stIdx + 1].trackIds.includes(step.trackId.toString())) stIdx++;
    }
    return totalDist;
};

// =============================================================================
// EXTEND TRAIN HISTORY: look-ahead pathfinding to add upcoming track segments
// Fills history LOOKAHEAD_DIST meters ahead of the head.
// When no forward path exists, sets train._turnaroundTarget if a player-defined
// turnaround area is reachable.
// =============================================================================
const ROUTE_LOOKAHEAD = 800; // meters of track to pre-load into history

window.extendTrainHistory = function (train, g, targetStation) {
    if (!targetStation) return;

    // If we're already committed to approaching a turnaround, extend history
    // toward the turnaround area (treat its tracks like a platform).
    if (train._turnaroundTarget) {
        _extendTowardTurnaround(train, g);
        return;
    }

    let sanity = 0;
    let platIds = targetStation.trackIds.map(String);

    while (sanity++ < 200) {
        let lastSeg = train.history[train.history.length - 1];
        if (!lastSeg || !lastSeg.track) break;

        let lastId = lastSeg.track.id.toString();
        let lastIsOnPlat = platIds.includes(lastId);

        if (lastIsOnPlat) {
            let platInHistory = new Set(
                train.history.filter(h => h.track && platIds.includes(h.track.id.toString()))
                    .map(h => h.track.id.toString())
            );
            if (platInHistory.size >= platIds.length) break;

            let nextPlatStep = window.findNextTrack(g, lastSeg.toNode, platIds, lastSeg.track.id);
            if (!nextPlatStep) break;
            if (train.history.some(h => h.track.id === nextPlatStep.trackId && h.fromNode === lastSeg.toNode)) break;
            let nextPlatTrack = window.tracks.find(x => x.id === nextPlatStep.trackId);
            if (!nextPlatTrack) break;

            train.history.push({
                track: nextPlatTrack,
                fromNode: lastSeg.toNode, toNode: nextPlatStep.to,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nextPlatTrack.length
            });
            continue;
        }

        let lookaheadEnd = lastSeg.endDist;
        if (lookaheadEnd - train.headDist > ROUTE_LOOKAHEAD) break;

        let incomingTidForStep = train._justSpawned ? null : lastSeg.track.id;
        let allowSharp = !!train._justSpawned; // first step from depot: no angle restriction
        let nextStep = window.findNextTrack(g, lastSeg.toNode, platIds, incomingTidForStep, allowSharp);
        if (nextStep && train._justSpawned) train._justSpawned = false;

        if (!nextStep) {
            let isStillInDepot = train.history.length === 1 && train.headDist < lastSeg.endDist + 50;
            let inCooldown = (train._turnaroundCooldown || 0) > 0;
            if (!isStillInDepot && !inCooldown) {
                // No forward path (or path only via sharp turn) — try turnaround area.
                let turnaround = window.findTurnaroundArea(g, lastSeg.toNode, lastSeg.track.id, train.trainLength);
                if (turnaround) {
                    console.log(`[SIM] Train ${train.id} will approach turnaround area ${turnaround.areaId}`);
                    train._turnaroundTarget = turnaround;
                    train._needsTurnaround = false;
                    _extendTowardTurnaround(train, g);
                } else {
                    console.warn(`[SIM] No turnaround area reachable for train ${train.id} at node ${lastSeg.toNode} — stopping`);
                    train._needsTurnaround = true;
                }
            }
            break;
        }

        if (train.history.some(h => h.track && h.track.id.toString() === nextStep.trackId.toString())) break;

        let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
        if (!nextTrack) break;

        train.history.push({
            track: nextTrack,
            fromNode: lastSeg.toNode, toNode: nextStep.to,
            startDist: lastSeg.endDist, endDist: lastSeg.endDist + nextTrack.length
        });
    }
};

// Extend history toward the turnaround area step by step.
// Follows ta.approachPath entries first, then enters the area tracks in order.
// Never skips segments (prevents teleporting) and avoids calling findNextTrack
// at dead-end area nodes (which caused the "no path" stuck bug).
function _extendTowardTurnaround(train, g) {
    let ta = train._turnaroundTarget;
    if (!ta) return;

    let areaIds = ta.trackIds.map(String);
    let sanity = 0;

    while (sanity++ < 200) {
        let lastSeg = train.history[train.history.length - 1];
        if (!lastSeg || !lastSeg.track) break;

        // Stop extending if we have enough look-ahead
        let lookaheadEnd = lastSeg.endDist;
        if (lookaheadEnd - train.headDist > ROUTE_LOOKAHEAD) break;

        let lastId = lastSeg.track.id.toString();
        let alreadyInArea = areaIds.includes(lastId);

        if (alreadyInArea) {
            // Count area tracks already in history
            let areaInHistory = new Set(
                train.history
                    .filter(h => h.track && areaIds.includes(h.track.id.toString()))
                    .map(h => h.track.id.toString())
            );
            if (areaInHistory.size >= areaIds.length) break; // all area tracks loaded — done

            // Find next area track we haven't loaded yet, reachable from lastSeg.toNode
            // Use findNextTrack with allowSharpTurns=true (area may have tight geometry)
            // but guard against dead-end nodes (toNode has no outgoing edge to remaining area tracks)
            let remainingAreaIds = areaIds.filter(id => !areaInHistory.has(id));
            let nextStep = window.findNextTrack(g, lastSeg.toNode, remainingAreaIds, lastSeg.track.id, true);
            if (!nextStep) break; // dead-end inside area — stop here, train will reverse from this point
            if (train.history.some(h => h.track && h.track.id.toString() === nextStep.trackId.toString())) break;
            let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
            if (!nextTrack) break;
            train.history.push({
                track: nextTrack,
                fromNode: lastSeg.toNode, toNode: nextStep.to,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nextTrack.length
            });
            continue;
        }

        // Not yet in area — follow approachPath sequentially to avoid teleporting.
        // Find the next step in the pre-computed approachPath that starts from lastSeg.toNode.
        let approachPath = ta.approachPath || [];
        let nextApproachStep = null;

        // Find the first approachPath entry whose fromNode matches lastSeg.toNode
        // and whose track isn't already in history.
        for (let step of approachPath) {
            if (step.fromNode.toString() === lastSeg.toNode.toString()
                && !train.history.some(h => h.track && h.track.id.toString() === step.trackId.toString())) {
                nextApproachStep = step;
                break;
            }
        }

        if (nextApproachStep) {
            // Follow the pre-computed approach path step
            let nextTrack = window.tracks.find(x => x.id === nextApproachStep.trackId
                || x.id.toString() === nextApproachStep.trackId.toString());
            if (!nextTrack) break;
            train.history.push({
                track: nextTrack,
                fromNode: lastSeg.toNode, toNode: nextApproachStep.toNode,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nextTrack.length
            });
        } else {
            // Approach path exhausted or we've reached a node adjacent to the area —
            // try stepping directly into the area
            let nextStep = window.findNextTrack(g, lastSeg.toNode, areaIds, lastSeg.track.id, true);
            if (!nextStep) {
                console.warn(`[SIM] Train ${train.id} lost approach to turnaround area — aborting`);
                train._turnaroundTarget = null;
                break;
            }
            if (train.history.some(h => h.track && h.track.id.toString() === nextStep.trackId.toString())) break;
            let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
            if (!nextTrack) break;
            train.history.push({
                track: nextTrack,
                fromNode: lastSeg.toNode, toNode: nextStep.to,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nextTrack.length
            });
        }
    }
}
// Returns distance from headDist to the computed stop position.
// Returns Infinity if platform not yet visible in history.
// =============================================================================
window.computeDistToStop = function (train, targetStation, history) {
    if (!targetStation) return Infinity;

    let tIds = targetStation.trackIds.map(String);
    let platSegs = history.filter(h => h.track && tIds.includes(h.track.id.toString()));
    if (platSegs.length === 0) return Infinity; // Platform not yet in history

    // For multi-track platforms, wait until ALL platform tracks are loaded into
    // history before computing a stop distance.  If we compute too early the
    // stop point is clamped to the end of whichever tracks ARE loaded — which
    // for a multi-segment platform is a mid-platform node, causing the train to
    // freeze there and back carriages to pile up behind it.
    let platIdsInHistory = new Set(platSegs.map(h => h.track.id.toString()));
    let allLoaded = tIds.every(id => platIdsInHistory.has(id));

    if (!allLoaded) {
        // Drive forward until all tracks load (extendTrainHistory handles this).
        // Only force a stop if the head is very close to the expected exit to
        // prevent overshooting a short platform.
        let platEntryDist = Math.min(...platSegs.map(h => h.startDist));
        let platTotalLength = 0;
        for (let tid of tIds) {
            let t = window.tracks.find(x => x.id.toString() === tid);
            if (t) platTotalLength += t.length;
        }
        let platExitDist = platEntryDist + platTotalLength;
        if (train.headDist < platExitDist - 5) return Infinity;
    }

    let stopHeadDist = window.getPlatformStopHeadDist(train, targetStation, history);
    return stopHeadDist - train.headDist;
};

// Braking distance needed to stop from current speed
function brakingDist(speed, brakeRate) {
    return (speed * speed) / (2 * brakeRate);
}

// =============================================================================
// TURNAROUND: flip train direction in-place, no teleport.
//
// The train is currently moving forward with its head at headDist.
// After reversal the old tail becomes the new head.
//
// We reverse only the segments the train body currently occupies, re-index
// them from 0, and set headDist = trainLength (the new head is at the far
// end of the reversed segments, which corresponds to the old tail position).
// =============================================================================
// =============================================================================
// TURNAROUND: flip train direction in-place, no teleport.
//
// The train body occupies [headDist - trainLength, headDist] in history coords.
// After reversal, the old tail becomes the new head.
// We rebuild history so occupied segments run in reverse order (each with
// fromNode/toNode swapped), re-indexed from 0.
// New headDist = total length of reversed segments (old tail is now far end).
// =============================================================================
window.performTurnaround = function (train) {
    let tailDist = train.headDist - train.trainLength;

    // Collect segments the train body overlaps, sorted earliest first.
    let occupied = train.history
        .filter(h => h.endDist > tailDist && h.startDist < train.headDist)
        .sort((a, b) => a.startDist - b.startDist);

    if (occupied.length === 0) {
        train.state = 'DESPAWNING';
        return false;
    }

    // Figure out the old tail's position WITHIN the occupied block coordinate space.
    // The occupied block starts at occupied[0].startDist.
    // tailDist may be before that (overhang before first segment, e.g. in depot).
    let blockStart = occupied[0].startDist;
    // Offset of old tail from block start (clamped to 0 if it overhangs before the block)
    let tailOffsetFromBlockStart = Math.max(0, tailDist - blockStart);

    // Rebuild reversed: last segment first, swap fromNode/toNode
    let reversed = [];
    let cum = 0;
    for (let i = occupied.length - 1; i >= 0; i--) {
        let h = occupied[i];
        if (!h || !h.track) continue;
        reversed.push({
            track: h.track,
            fromNode: h.toNode,
            toNode: h.fromNode,
            startDist: cum,
            endDist: cum + h.track.length
        });
        cum += h.track.length;
    }

    if (reversed.length === 0) {
        train.state = 'DESPAWNING';
        return false;
    }

    train.history = reversed;

    // In the reversed block (total length = cum):
    //   - dist=0 corresponds to the old HEAD end
    //   - dist=cum corresponds to the old TAIL end
    //
    // The old tail was at (tailOffsetFromBlockStart) from the block start.
    // In reversed space that maps to: cum - tailOffsetFromBlockStart
    // (because the first segment of the reversed block is the last of the original).
    //
    // New headDist = position of old tail in reversed coordinates.
    let newHeadDist = cum - tailOffsetFromBlockStart;
    // Clamp to valid range [0, cum]
    train.headDist = Math.max(0, Math.min(cum, newHeadDist));

    return true;
};

// --- SIMULATION LOOP ---
window.updateSim = function (dt) {
    window.sim.time += (dt / 1000) * window.sim.speed;
    if (window.sim.time >= 86400) window.sim.time -= 86400;

    let el = document.getElementById('sim-clock');
    if (el) el.innerText = window.formatTime(window.sim.time);

    let g = window.buildGraph();

    // --- FLEET / SPAWN MANAGEMENT ---
    if (window.sim.lines && window.depots.length > 0) {
        window.sim.lines.forEach(l => {
            let fleetSched = l.fleetSchedule || [];

            if (fleetSched.length === 0) {
                // === LEGACY DEPARTURE SYSTEM ===
                ['inbound', 'outbound'].forEach(dir => {
                    let deps = l[dir].departures || [];
                    deps.forEach(dep => {
                        if (window.sim.time >= dep.time - 180 && !dep.spawned) {
                            let depot = window.depots.find(d => !d.line || d.line.includes(l.name) || d.line === '');
                            if (depot && l[dir].stations.length > 0) {
                                let train = window.spawnTrainOnLine(l, dir, depot);
                                if (train) window.trains.push(train);
                            }
                            dep.spawned = true;
                        }
                        if (window.sim.time < 100) dep.spawned = false;
                    });
                });
            } else {
                // === NEW FLEET COUNT SYSTEM ===
                let targetCount = window.getTargetFleetSize(l, window.sim.time);

                let activeDirs = { inbound: 0, outbound: 0 };
                window.trains.forEach(tr => {
                    if (tr.lineId === l.id && !tr.returningToDepot) {
                        activeDirs[tr.dirPhase] = (activeDirs[tr.dirPhase] || 0) + 1;
                    }
                });
                let totalActive = activeDirs.inbound + activeDirs.outbound;

                if (totalActive < targetCount) {
                    let needed = targetCount - totalActive;
                    let depot = window.depots.find(d => !d.line || d.line.includes(l.name) || d.line === '');
                    let hasBothDirs = l.inbound.stations.length > 0 && l.outbound.stations.length > 0;

                    let inTripDist = l.inbound.stations.length > 0 ? window.estimateLineTripDistance(l, 'inbound') : 0;
                    let outTripDist = l.outbound.stations.length > 0 ? window.estimateLineTripDistance(l, 'outbound') : 0;
                    let totalDist = inTripDist + outTripDist;

                    for (let i = 0; i < needed; i++) {
                        if (!depot) break;
                        let dir;
                        if (!hasBothDirs) {
                            dir = l.inbound.stations.length > 0 ? 'inbound' : 'outbound';
                        } else {
                            dir = (totalActive + i) % 2 === 0 ? 'inbound' : 'outbound';
                        }
                        if (l[dir].stations.length === 0) continue;

                        let train = window.spawnTrainOnLine(l, dir, depot);
                        if (!train) continue;

                        // Even spreading
                        if (targetCount > 1 && totalDist > 0) {
                            let slotIndex = totalActive + i;
                            let spreadFraction = (slotIndex / targetCount) % 1.0;
                            let inFrac = inTripDist / totalDist;
                            let advanceDist;
                            if (spreadFraction < inFrac) {
                                if (dir !== 'inbound' && l.inbound.stations.length > 0) train.dirPhase = 'inbound';
                                advanceDist = (spreadFraction / inFrac) * inTripDist;
                            } else {
                                if (dir !== 'outbound' && l.outbound.stations.length > 0) train.dirPhase = 'outbound';
                                advanceDist = ((spreadFraction - inFrac) / (1 - inFrac)) * outTripDist;
                            }
                            if (advanceDist > 10) {
                                window.advanceTrainPosition(train, l, train.dirPhase, g, advanceDist);
                            }
                        }

                        window.trains.push(train);
                    }
                } else if (totalActive > targetCount) {
                    let excess = totalActive - targetCount;
                    let active = window.trains.filter(tr => tr.lineId === l.id && !tr.returningToDepot);
                    for (let i = 0; i < excess && i < active.length; i++) {
                        active[active.length - 1 - i].returningToDepot = true;
                    }
                }
            }
        });
    }

    // --- PHYSICS LOOP ---
    let dtSec = Math.min((dt / 1000) * window.sim.speed, 5.0);

    window.trains.forEach(tr => {
        let lObj = window.sim.lines.find(x => x.id === tr.lineId);
        if (!lObj) { tr.state = 'DESPAWNING'; return; }

        if (!tr.history || tr.history.length === 0 || !tr.history[tr.history.length - 1] || !tr.history[tr.history.length - 1].track) {
            tr.state = 'DESPAWNING'; return;
        }

        if (tr.state === 'DRIVING' || tr.state === 'BRAKING') {
            // Tick turnaround cooldown
            if (tr._turnaroundCooldown > 0) tr._turnaroundCooldown -= dtSec;

            let stations = lObj[tr.dirPhase].stations;
            let targetStation = stations[tr.nextStationIdx];
            let currentSeg = tr.history[tr.history.length - 1];

            if (!currentSeg || !currentSeg.track) { tr.state = 'DESPAWNING'; return; }

            // --- LOOK-AHEAD: extend history toward next station (or turnaround area) ---
            tr._needsTurnaround = false;
            window.extendTrainHistory(tr, g, targetStation);

            // If extendTrainHistory found a turnaround area, switch to approach mode
            if (tr._turnaroundTarget && tr.state !== 'TURNAROUND_APPROACH') {
                tr.state = 'TURNAROUND_APPROACH';
                return; // let TURNAROUND_APPROACH handler take over next tick
            }

            // If no path and no turnaround area available, brake and stop
            if (tr._needsTurnaround) {
                if (tr.speed > 0.05) {
                    tr.speed -= tr.brake * dtSec;
                    if (tr.speed < 0) tr.speed = 0;
                    tr.headDist += tr.speed * dtSec;
                } else {
                    tr.speed = 0;
                    // Stay stopped — cannot proceed without a turnaround area
                }
                if (window.selectedTrain && window.selectedTrain.id === tr.id) {
                    document.getElementById('train-info-speed').innerText = Math.round(tr.speed * 3.6);
                    document.getElementById('train-info-state').innerText = 'NO_PATH' + (tr.returningToDepot ? ' [->Depot]' : '');
                    document.getElementById('train-info-next').innerText = 'Station ' + (tr.nextStationIdx + 1);
                }
                return;
            }

            // --- COMPUTE DISTANCE TO STOP ---
            let distToStop = window.computeDistToStop(tr, targetStation, tr.history);

            // --- SPEED LIMIT ON CURRENT SEGMENT ---
            let trMaxSpeedMs = tr.maxSpeed / 3.6;
            let tLimit = currentSeg.track.speedLimit ? currentSeg.track.speedLimit / 3.6 : trMaxSpeedMs;
            let speedCap = Math.min(trMaxSpeedMs, tLimit);

            // Also check upcoming speed limits in history ahead
            for (let h of tr.history) {
                if (h.startDist > tr.headDist && h.startDist < tr.headDist + 200) {
                    let hLimit = h.track.speedLimit ? h.track.speedLimit / 3.6 : trMaxSpeedMs;
                    if (hLimit < speedCap) {
                        // Need to brake for upcoming speed limit
                        let distToLimit = h.startDist - tr.headDist;
                        let brakeDist = brakingDist(tr.speed, tr.brake);
                        if (brakeDist >= distToLimit) speedCap = Math.min(speedCap, hLimit);
                    }
                }
            }

            // ---------------------------------------------------------------
            // KINEMATIC ADAPTIVE BRAKING
            //
            // At every tick we compute the *exact* deceleration that would
            // bring the train to rest precisely at the stop point, then clamp
            // it to the physical brake limits.  This replaces the old
            // fixed-rate brake and the coarse "ease-zone" heuristic.
            //
            // Physics:  v² = u² + 2·a·s  →  a = (v² - u²) / (2·s)
            // To stop (u=0) from current speed v over distance s:
            //   required decel = v² / (2·s)
            //
            // We also blend in a small velocity-error term so the controller
            // corrects any drift without hunting:
            //   targetSpeed at distance s = sqrt(2 · brake · s)   (ideal curve)
            //   correction   = k · (actualSpeed - targetSpeed)
            //
            // The combined decel is clamped to [0, ebrake] and applied.
            // ---------------------------------------------------------------

            // Required decel to stop from current speed over remaining dist
            let requiredDecel = (distToStop > 0.01 && distToStop !== Infinity)
                ? (tr.speed * tr.speed) / (2 * Math.max(distToStop, 0.1))
                : 0;

            // Ideal speed on the braking curve at this distance
            let idealBrakeSpeed = (distToStop > 0 && distToStop !== Infinity)
                ? Math.sqrt(2 * tr.brake * distToStop)
                : 0;

            // Velocity-error correction (proportional, gain ≈ 1.5)
            let velError = tr.speed - idealBrakeSpeed;
            let correctionDecel = (velError > 0) ? velError * 1.5 : 0;

            // Total demanded decel: kinematic + correction, clamped to physical limits
            let demandedDecel = Math.min(requiredDecel + correctionDecel, tr.ebrake);
            demandedDecel = Math.max(demandedDecel, 0);

            // Decide whether to enter braking mode:
            // Start braking when required decel exceeds a soft threshold above
            // normal brake rate (gives a small margin so we never overshoot).
            let brakeTriggerThreshold = tr.brake * 0.85;
            if (distToStop !== Infinity && distToStop >= 0 && requiredDecel >= brakeTriggerThreshold) {
                tr.state = 'BRAKING';
            } else if (tr.state === 'BRAKING' && distToStop > brakingDist(tr.speed, tr.brake) + 15) {
                // Station moved away or we got a new target — resume driving
                tr.state = 'DRIVING';
            }

            // --- ACCELERATION / BRAKING (realistic with glide + creep) ---
            if (tr.state === 'DRIVING') {
                tr.speed += tr.accel * dtSec;
                if (tr.speed > speedCap) tr.speed = speedCap;
            } else if (tr.state === 'BRAKING') {
                if (distToStop <= 0.15) {
                    // Very close — snap to zero
                    tr.speed = 0;
                } else if (tr.speed === 0 && distToStop > 0.3 && distToStop !== Infinity) {
                    // Overbraked / stopped short — creep forward
                    tr.speed = Math.min(1.5, distToStop * 0.5);
                } else {
                    tr.speed -= demandedDecel * dtSec;
                    if (tr.speed < 0) tr.speed = 0;
                    // Micro-boost if gliding too slowly but not close enough
                    if (tr.speed < 0.2 && distToStop > 1.0 && distToStop !== Infinity) {
                        tr.speed = Math.min(0.5, distToStop * 0.3);
                    }
                }
            }

            // --- STOPPED BUT NOT DWELLING (missed stop correction) ---
            if (tr.speed === 0 && distToStop > 0.5 && distToStop < 50 && distToStop !== Infinity) {
                tr.speed = Math.min(0.8, distToStop * 0.4);
            }

            // --- COLLISION AVOIDANCE ---
            let safetyDist = brakingDist(tr.speed, tr.brake) + 20;
            let fPt = window.getPointOnHistory(tr.history, tr.headDist);
            let obstacleAhead = false;

            if (fPt) {
                window.trains.forEach(other => {
                    if (other.id === tr.id || !other.history || other.history.length === 0) return;
                    for (let i = 0; i < other.carriages; i++) {
                        let cPos = other.headDist - (i * 26) - 12.5;
                        let cPt = window.getPointOnHistory(other.history, cPos);
                        if (cPt && dist(fPt, cPt) < safetyDist) {
                            let toOther = Math.atan2(cPt.y - fPt.y, cPt.x - fPt.x);
                            if (Math.abs(normalizeAngle(fPt.dir - toOther)) < Math.PI / 3) obstacleAhead = true;
                        }
                    }
                });
            }

            if (obstacleAhead) {
                tr.speed -= tr.ebrake * dtSec;
                if (tr.speed < 0) tr.speed = 0;
            }

            // --- ADVANCE POSITION ---
            tr.headDist += tr.speed * dtSec;

            // --- MEMORY CLEANUP ---
            while (tr.history.length > 1 && tr.headDist - tr.trainLength > tr.history[0].endDist) {
                tr.history.shift();
            }

            // --- ARRIVED CHECK ---
            if (targetStation && distToStop <= 0.3 && tr.speed < 0.05) {
                let platSegs = tr.history.filter(h => h.track && targetStation.trackIds.includes(h.track.id.toString()));
                if (platSegs.length > 0) {
                    let stopHeadDist = window.getPlatformStopHeadDist(tr, targetStation, tr.history);
                    if (stopHeadDist !== null) {
                        tr.headDist = stopHeadDist;
                        tr.speed = 0;
                        tr.state = 'DWELLING';
                        tr.dwellTimer = targetStation.dwell || 30;
                        tr.nextStationIdx++;
                    }
                }
            }

        } else if (tr.state === 'DWELLING') {
            tr.dwellTimer -= dtSec;
            if (tr.dwellTimer <= 0) {
                let stations = lObj[tr.dirPhase].stations;
                if (tr.nextStationIdx >= stations.length) {
                    // ── Reached the terminal station ──────────────────────────
                    if (tr.returningToDepot) {
                        tr.state = 'DESPAWNING';
                    } else {
                        let newDir = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';
                        let newStations = lObj[newDir].stations;

                        if (!newStations || newStations.length === 0) {
                            // No return route defined — just flip phase and restart
                            tr.dirPhase = newDir;
                            tr.nextStationIdx = 0;
                            tr.state = 'DRIVING';
                        } else {
                            // ── Determine whether a physical turnaround is needed ──
                            //
                            // A turnaround is NOT needed when the train is already
                            // positioned and oriented to drive directly toward the
                            // first station of the new direction.
                            //
                            // We check this by asking the graph: from the node the
                            // train's head is currently approaching (toNode of the
                            // last history seg), can we reach newStations[0] WITHOUT
                            // reversing?  If yes — no turnaround.
                            //
                            // "Shared terminus" (same track is both last inbound and
                            // first outbound station) is the simplest case, but we
                            // also handle cases where the terminal loop / runround
                            // means the train is already facing the right way.

                            let lastSeg = tr.history[tr.history.length - 1];
                            let newFirstTids = newStations[0].trackIds.map(String);

                            // Collect all platform track ids the train is currently on
                            let curPlatTids = stations[stations.length - 1]
                                ? stations[stations.length - 1].trackIds.map(String)
                                : [];

                            // Is the current terminal platform the same as the new
                            // direction's first platform?  (shared terminus)
                            let sharedTerminus = newFirstTids.some(id => curPlatTids.includes(id));

                            // Can the train reach newStations[0] from its current
                            // exit node WITHOUT a U-turn or sharp turn?
                            let forwardReachable = false;
                            if (lastSeg) {
                                let exitNode = lastSeg.toNode;
                                let incomingTid = lastSeg.track.id;
                                let fwdPath = window.computeFullPath(g, exitNode, newFirstTids, incomingTid, false);
                                forwardReachable = (fwdPath !== null);
                            }

                            if (sharedTerminus || forwardReachable) {
                                // No physical reversal — already pointing the right way.
                                // Just flip the direction phase.
                                // If the terminal is shared, skip station index 0
                                // (we're already there); otherwise start from 0.
                                tr.dirPhase = newDir;
                                tr.nextStationIdx = sharedTerminus ? 1 : 0;
                                // Trim look-ahead history beyond current head so
                                // extendTrainHistory re-paths toward the new target
                                tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                                tr.state = 'DRIVING';
                            } else {
                                // Physical turnaround needed
                                tr.state = 'TURNAROUND';
                            }
                        }
                    }
                } else {
                    tr.state = 'DRIVING';
                }
            }

        } else if (tr.state === 'TURNAROUND_APPROACH') {
            // Train is approaching a player-defined turnaround area.
            // Treated exactly like a platform: brake to stop inside the area,
            // then reverse direction.
            let ta = tr._turnaroundTarget;
            if (!ta) { tr.state = 'DRIVING'; return; }

            // Extend history toward the turnaround area
            window.extendTrainHistory(tr, g, { trackIds: ta.trackIds });

            // Compute stop position inside turnaround area (same as platform)
            let fakeStation = { trackIds: ta.trackIds };
            let distToStop = window.computeDistToStop(tr, fakeStation, tr.history);

            let trMaxSpeedMs = tr.maxSpeed / 3.6;
            let currentSeg = tr.history[tr.history.length - 1];
            let tLimit = currentSeg && currentSeg.track && currentSeg.track.speedLimit
                ? currentSeg.track.speedLimit / 3.6 : trMaxSpeedMs;
            let speedCap = Math.min(trMaxSpeedMs, tLimit);

            let requiredDecel = (distToStop > 0.01 && distToStop !== Infinity)
                ? (tr.speed * tr.speed) / (2 * Math.max(distToStop, 0.1)) : 0;
            let idealBrakeSpeed = (distToStop > 0 && distToStop !== Infinity)
                ? Math.sqrt(2 * tr.brake * distToStop) : 0;
            let velError = tr.speed - idealBrakeSpeed;
            let correctionDecel = (velError > 0) ? velError * 1.5 : 0;
            let demandedDecel = Math.min(requiredDecel + correctionDecel, tr.ebrake);

            if (distToStop !== Infinity && requiredDecel >= tr.brake * 0.85) {
                // Braking
                if (distToStop <= 0.15) {
                    tr.speed = 0;
                } else if (tr.speed === 0 && distToStop > 0.3) {
                    tr.speed = Math.min(1.5, distToStop * 0.5);
                } else {
                    tr.speed -= demandedDecel * dtSec;
                    if (tr.speed < 0) tr.speed = 0;
                    if (tr.speed < 0.2 && distToStop > 1.0) tr.speed = Math.min(0.5, distToStop * 0.3);
                }
            } else {
                tr.speed += tr.accel * dtSec;
                if (tr.speed > speedCap) tr.speed = speedCap;
            }

            // Missed-stop correction
            if (tr.speed === 0 && distToStop > 0.5 && distToStop < 50 && distToStop !== Infinity) {
                tr.speed = Math.min(0.8, distToStop * 0.4);
            }

            tr.headDist += tr.speed * dtSec;

            // Memory cleanup
            while (tr.history.length > 1 && tr.headDist - tr.trainLength > tr.history[0].endDist) {
                tr.history.shift();
            }

            // Arrived inside turnaround area?
            if (distToStop <= 0.3 && tr.speed < 0.05) {
                let areaSegs = tr.history.filter(h => h.track && ta.trackIds.includes(h.track.id.toString()));
                if (areaSegs.length > 0) {
                    let stopHeadDist = window.getPlatformStopHeadDist(tr, fakeStation, tr.history);
                    if (stopHeadDist !== null) tr.headDist = stopHeadDist;
                    tr.speed = 0;
                    tr.state = 'TURNAROUND_REVERSE';
                }
            }
            // Fallback: if fully stopped and the current segment is inside the area,
            // transition even if distToStop didn't resolve (e.g. dead-end single-track area).
            if (tr.speed < 0.05 && tr.state === 'TURNAROUND_APPROACH') {
                let lastSeg = tr.history[tr.history.length - 1];
                if (lastSeg && lastSeg.track && ta.trackIds.includes(lastSeg.track.id.toString())) {
                    tr.speed = 0;
                    tr.state = 'TURNAROUND_REVERSE';
                }
            }

        } else if (tr.state === 'TURNAROUND_REVERSE') {
            // Train is fully stopped inside turnaround area. Perform reversal then resume.
            let ok = window.performTurnaround(tr);
            if (!ok) { tr.state = 'DESPAWNING'; return; }

            tr._turnaroundTarget = null;
            tr._needsTurnaround = false;
            tr._turnaroundCooldown = 3.0;

            // Verify a forward path now exists after reversal
            let stations = lObj[tr.dirPhase].stations;
            let targetStation = stations[tr.nextStationIdx];
            if (targetStation) {
                let lastSeg = tr.history[tr.history.length - 1];
                if (lastSeg) {
                    let testPath = window.computeFullPath(g, lastSeg.toNode, targetStation.trackIds, lastSeg.track.id, false);
                    if (!testPath) {
                        // Try loose path
                        testPath = window.computeFullPath(g, lastSeg.toNode, targetStation.trackIds, lastSeg.track.id, true);
                        if (!testPath) {
                            console.warn('[SIM] TURNAROUND_REVERSE: still no path after reversal', tr.id);
                            tr.state = 'DESPAWNING';
                            return;
                        }
                    }
                }
            }

            tr.speed = 0;
            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
            tr.state = 'DRIVING';

        } else if (tr.state === 'TURNAROUND_PREP') {
            let ok = window.performTurnaround(tr);
            if (!ok) { tr.state = 'DESPAWNING'; return; }

            tr._needsTurnaround = false;
            tr._turnaroundCooldown = 3.0; // seconds before _needsTurnaround can fire again

            let stations = lObj[tr.dirPhase].stations;
            let targetStation = stations[tr.nextStationIdx];
            if (targetStation) {
                let lastSeg = tr.history[tr.history.length - 1];
                if (lastSeg) {
                    let testPath = window.computeFullPath(g, lastSeg.toNode, targetStation.trackIds, lastSeg.track.id, true);
                    if (!testPath) {
                        console.warn('[SIM] TURNAROUND_PREP: still no path after reversal, despawning', tr.id);
                        tr.state = 'DESPAWNING';
                        return;
                    }
                }
            }
            tr.speed = 0;
            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
            tr.state = 'DRIVING';

        } else if (tr.state === 'TURNAROUND') {
            // Terminal turnaround — flip direction phase after physical reversal
            let ok = window.performTurnaround(tr);
            if (!ok) { tr.state = 'DESPAWNING'; return; }

            let newDir = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';
            let newStations = lObj[newDir].stations;
            if (newStations && newStations.length > 0) {
                let lastSeg = tr.history[tr.history.length - 1];
                if (lastSeg) {
                    let testPath = window.computeFullPath(g, lastSeg.toNode, newStations[0].trackIds, lastSeg.track.id, true);
                    if (!testPath) {
                        tr.state = 'DESPAWNING';
                        return;
                    }
                }
            }

            tr.dirPhase = newDir;
            tr.nextStationIdx = 0;
            tr.speed = 0;
            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
            tr.state = 'DRIVING';
        }

        if (window.selectedTrain && window.selectedTrain.id === tr.id) {
            document.getElementById('train-info-speed').innerText = Math.round(tr.speed * 3.6);
            document.getElementById('train-info-state').innerText = tr.state + (tr.returningToDepot ? ' [→Depot]' : '');
            document.getElementById('train-info-next').innerText = `Station ${tr.nextStationIdx + 1}`;
            if (lObj) document.getElementById('train-info-line').innerText = lObj.name;
        }
    });

    window.trains = window.trains.filter(t => t.state !== 'DESPAWNING');
};

// =============================================================================
// DEBUG: Click-to-download train path + nearby track log
// Captures: train state, full history, path ahead, nearby tracks with turn angles
// =============================================================================
window._downloadTrainDebugLog = function (train) {
    let lines = [];
    let now = new Date().toISOString();
    let g = window.buildGraph();

    console.log('%c[TRAIN DEBUG] Generating log...', 'color: #ff8800');

    lines.push('=== TRAIN DEBUG LOG ===');
    lines.push(`Generated: ${now}`);
    lines.push(`Train ID: ${train.id}`);
    lines.push(`State: ${train.state}`);
    lines.push(`Direction Phase: ${train.dirPhase}`);
    lines.push(`Speed: ${(train.speed * 3.6).toFixed(2)} km/h`);
    lines.push(`HeadDist: ${train.headDist.toFixed(2)} m`);
    lines.push(`TrainLength: ${train.trainLength} m`);
    lines.push(`NextStationIdx: ${train.nextStationIdx}`);
    lines.push('');

    // Current head position
    let headPt = window.getPointOnHistory(train.history, train.headDist);
    if (headPt) {
        lines.push(`Head Position: (${headPt.x.toFixed(2)}, ${headPt.y.toFixed(2)}) dir=${(headPt.dir * 180 / Math.PI).toFixed(1)}°`);
    }
    lines.push('');

    // History segments
    lines.push('--- HISTORY SEGMENTS ---');
    train.history.forEach((h, i) => {
        if (!h.track) { lines.push(`  [${i}] INVALID SEGMENT`); return; }
        lines.push(`  [${i}] TrackID=${h.track.id} type=${h.track.type} len=${h.track.length.toFixed(1)}m`);
        lines.push(`       from=${h.fromNode} → to=${h.toNode}`);
        lines.push(`       dist=[${h.startDist.toFixed(1)}, ${h.endDist.toFixed(1)}]`);
        if (h.track.type === 'arc') {
            lines.push(`       arc radius=${h.track.radius.toFixed(1)}m ccw=${h.track.ccw}`);
        }
        lines.push(`       oneWay=${h.track.oneWay || 0} speedLimit=${h.track.speedLimit || 'auto'}`);
    });
    lines.push('');

    // Nearby tracks (within 200m of head)
    lines.push('--- NEARBY TRACKS (within 200m of head) ---');
    if (headPt) {
        window.tracks.forEach(t => {
            let midX = t.start ? (t.start.x + t.end.x) / 2 : 0;
            let midY = t.start ? (t.start.y + t.end.y) / 2 : 0;
            let d = Math.hypot(midX - headPt.x, midY - headPt.y);
            if (d < 200) {
                lines.push(`  TrackID=${t.id} type=${t.type} len=${t.length.toFixed(1)}m oneWay=${t.oneWay || 0}`);
                lines.push(`    dir1=${(t.dir1 * 180 / Math.PI).toFixed(1)}° dir2=${(t.dir2 * 180 / Math.PI).toFixed(1)}°`);
                if (t.type === 'arc') lines.push(`    radius=${t.radius.toFixed(1)}m ccw=${t.ccw}`);
            }
        });
    }
    lines.push('');

    // Turn angles at current node (last seg's toNode)
    lines.push('--- TURN ANGLES AT CURRENT NODE ---');
    let lastSeg = train.history[train.history.length - 1];
    if (lastSeg && lastSeg.track) {
        let curNode = lastSeg.toNode;
        let incomingTid = lastSeg.track.id;
        lines.push(`  At node: ${curNode} (incoming track: ${incomingTid})`);
        let edges = g.get(curNode) || [];
        edges.forEach(edge => {
            let angle = 0;
            try {
                angle = _getTurnAngle(incomingTid, edge.trackId, curNode, g) * 180 / Math.PI;
            } catch (e) { }
            let inTrack = window.tracks && window.tracks.find(t => t.id === incomingTid || t.id.toString() === incomingTid.toString());
            let outTrack = window.tracks && window.tracks.find(t => t.id === edge.trackId || t.id.toString() === edge.trackId.toString());
            let inTangent = '?', outTangent = '?';
            let np = _nodePos(curNode);
            if (np) {
                if (inTrack) inTangent = (_trackOutwardTangentAtPos(inTrack, np) * 180 / Math.PI).toFixed(1);
                if (outTrack) outTangent = (_trackOutwardTangentAtPos(outTrack, np) * 180 / Math.PI).toFixed(1);
            }
            let wouldBlock = angle > 120;
            let isUTurn = angle > 150;
            let flag = isUTurn ? ' *** U-TURN (blocked)' : wouldBlock ? ' *** SHARP TURN (blocked)' : '';
            lines.push(`  -> Edge trackId=${edge.trackId} to=${edge.to} deviation=${angle.toFixed(1)}deg [inTangent=${inTangent} outTangent=${outTangent}]${flag}`);
        });
    }
    lines.push('');

    // Path ahead (extendTrainHistory result)
    lines.push('--- PATH AHEAD (pre-loaded history) ---');
    let lObj = window.sim.lines.find(x => x.id === train.lineId);
    if (lObj) {
        let stations = lObj[train.dirPhase].stations;
        let targetStation = stations[train.nextStationIdx];
        if (targetStation) {
            lines.push(`  Target station trackIds: ${targetStation.trackIds.join(', ')}`);
            // Show history segments beyond headDist
            train.history.filter(h => h.endDist > train.headDist).forEach(h => {
                if (!h.track) return;
                lines.push(`  → Track ${h.track.id} [${h.startDist.toFixed(1)}-${h.endDist.toFixed(1)}]`);
            });
        }
    }
    lines.push('');
    lines.push('=== END OF LOG ===');

    console.group(`%c🚂 Train Debug: ${train.id}`, 'color: #ff8800; font-weight: bold; font-size: 14px');
    console.log(lines.join('\n'));
    console.groupEnd();
};

// --- BOGIE-BASED RENDERING ---
window.drawTrains = function (ctx, camera, w2s) {
    window.trains.forEach(tr => {
        if (!tr.history || tr.history.length === 0) return;
        let isSelected = window.selectedTrain && window.selectedTrain.id === tr.id;

        if (camera.zoom < 0.2) {
            let fPt = window.getPointOnHistory(tr.history, tr.headDist);
            if (fPt) {
                let sC = w2s(fPt.x, fPt.y);
                ctx.save(); ctx.translate(sC.x, sC.y); ctx.rotate(fPt.dir);
                ctx.fillStyle = isSelected ? '#ffffff' : tr.color;
                ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-8, 5); ctx.lineTo(-8, -5); ctx.fill();
                ctx.restore();
            }
            return;
        }

        ctx.fillStyle = isSelected ? '#ffffff' : tr.color;
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5;

        for (let i = 0; i < tr.carriages; i++) {
            let frontBogieDist = tr.headDist - 4 - (i * 26);
            let rearBogieDist = tr.headDist - 21 - (i * 26);

            let fPt = window.getPointOnHistory(tr.history, frontBogieDist);
            let rPt = window.getPointOnHistory(tr.history, rearBogieDist);

            if (!fPt || !rPt) continue;

            let cx = (fPt.x + rPt.x) / 2;
            let cy = (fPt.y + rPt.y) / 2;
            let dir = Math.atan2(fPt.y - rPt.y, fPt.x - rPt.x);
            let sC = w2s(cx, cy);

            ctx.save();
            ctx.translate(sC.x, sC.y);
            ctx.rotate(dir);

            let sw = 3.2 * camera.zoom;
            let sl = 25 * camera.zoom;

            ctx.fillRect(-sl / 2, -sw / 2, sl, sw);
            ctx.strokeRect(-sl / 2, -sw / 2, sl, sw);
            ctx.restore();
        }
    });
};