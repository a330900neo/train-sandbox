// --- SIMULATION & DATA MODELS ---
window.depots = [];
window.selectedDepot = null;
window.trains = [];
window.selectedTrain = null;

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
    window.tracks.forEach(t => {
        let sNode = window.nodes.find(n => Math.hypot(n.x - t.start.x, n.y - t.start.y) < 0.1);
        let eNode = window.nodes.find(n => Math.hypot(n.x - t.end.x, n.y - t.end.y) < 0.1);
        if (!sNode || !eNode) return;
        if (!graph.has(sNode.id)) graph.set(sNode.id, []);
        if (!graph.has(eNode.id)) graph.set(eNode.id, []);
        let spd = t.speedLimit || (t.type === 'arc' ? Math.min(160, 4.5 * Math.sqrt(t.radius)) : 160);
        if (t.oneWay !== -1) graph.get(sNode.id).push({ trackId: t.id, to: eNode.id, cost: t.length, speed: spd });
        if (t.oneWay !== 1) graph.get(eNode.id).push({ trackId: t.id, to: sNode.id, cost: t.length, speed: spd });
    });
    return graph;
};

// Returns the departure direction angle from a node along a given track
window._getEdgeDir = function (trackId, fromNodeId) {
    let t = window.tracks.find(x => x.id === trackId || x.id.toString() === trackId.toString());
    if (!t) return null;
    let sNode = window.nodes.find(n => Math.hypot(n.x - t.start.x, n.y - t.start.y) < 0.1);
    if (sNode && sNode.id === fromNodeId) return t.dir1;
    let dir2 = t.dir2 !== undefined ? t.dir2 : t.dir1;
    return normalizeAngle(dir2 + Math.PI);
};

function _isUTurn(incomingId, candidateId, nodeId) {
    let inDir = window._getEdgeDir(incomingId, nodeId);
    let outDir = window._getEdgeDir(candidateId, nodeId);
    if (inDir === null || outDir === null) return false;
    return Math.abs(normalizeAngle(outDir - inDir)) < (Math.PI / 6);
}

// =============================================================================
// FULL PATH PRECOMPUTATION
// Returns an ordered array of {trackId, fromNode, toNode, speed, cost} steps
// from startNodeId to any track in targetTrackIds, avoiding U-turns at start.
// =============================================================================
window.computeFullPath = function (graph, startNodeId, targetTrackIds, incomingTrackId) {
    let tIds = Array.isArray(targetTrackIds) ? targetTrackIds.map(String) : [targetTrackIds.toString()];

    // Dijkstra with full backtrack support
    let dist = new Map();
    let prev = new Map(); // nodeId -> { fromNode, edge }
    let pq = [{ id: startNodeId, cost: 0 }];
    dist.set(startNodeId, 0);
    let foundTargetEdge = null;
    let foundAtNode = null;

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        let u = pq.shift();
        let uCost = dist.get(u.id);

        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            // Prevent U-turn only at the very first node
            if (u.id === startNodeId && incomingTrackId && _isUTurn(incomingTrackId, edge.trackId, startNodeId)) continue;

            let alt = uCost + edge.cost;
            if (!dist.has(edge.to) || alt < dist.get(edge.to)) {
                dist.set(edge.to, alt);
                prev.set(edge.to, { fromNode: u.id, edge });
                pq.push({ id: edge.to, cost: alt });
            }

            // Check if this edge itself is the target
            if (tIds.includes(edge.trackId.toString())) {
                if (foundTargetEdge === null || alt < (foundTargetEdge._cost || Infinity)) {
                    foundTargetEdge = { ...edge, _cost: alt };
                    foundAtNode = u.id;
                }
            }
        }
    }

    if (!foundTargetEdge && incomingTrackId) {
        // Retry without U-turn restriction (terminus or forced reversal)
        return window.computeFullPath(graph, startNodeId, targetTrackIds, null);
    }
    if (!foundTargetEdge) return null;

    // Reconstruct path from startNodeId to foundAtNode, then add the target edge
    let path = [];
    let cur = foundAtNode;
    while (cur !== startNodeId && prev.has(cur)) {
        let p = prev.get(cur);
        path.unshift({ trackId: p.edge.trackId, fromNode: p.fromNode, toNode: cur, speed: p.edge.speed, cost: p.edge.cost });
        cur = p.fromNode;
    }
    // Add the final target edge
    path.push({ trackId: foundTargetEdge.trackId, fromNode: foundAtNode, toNode: foundTargetEdge.to, speed: foundTargetEdge.speed, cost: foundTargetEdge.cost });

    return path.length > 0 ? path : null;
};

// Legacy: returns only the FIRST step (kept for calculateLinePathsAndSchedule usage)
window.findNextTrack = function (graph, startNodeId, targetTrackIds, incomingTrackId) {
    let fullPath = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId);
    if (!fullPath || fullPath.length === 0) return null;
    let first = fullPath[0];
    // Reconstruct in the format callers expect
    let edges = graph.get(startNodeId) || [];
    return edges.find(e => e.trackId === first.trackId && e.to === first.toNode) || { trackId: first.trackId, to: first.toNode, cost: first.cost, speed: first.speed };
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

    // Try each depot track and each direction (from->to and to->from)
    // Pick the one that can actually reach the first station
    let bestDepTrack = null, bestFromNode = null, bestToNode = null;
    let bestPathLen = Infinity;

    for (let depTrackId of (depot.tracks || [])) {
        let candidate = window.tracks.find(t => t.id === depTrackId);
        if (!candidate) continue;

        let sNodeId = window.nodes.find(n => Math.hypot(n.x - candidate.start.x, n.y - candidate.start.y) < 0.1)?.id;
        let eNodeId = window.nodes.find(n => Math.hypot(n.x - candidate.end.x, n.y - candidate.end.y) < 0.1)?.id;
        if (!sNodeId || !eNodeId) continue;

        // Try both exit ends (start-exit and end-exit)
        for (let [fromNode, toNode] of [[sNodeId, eNodeId], [eNodeId, sNodeId]]) {
            // Check if the exit end connects to external network
            let externalEdges = (g.get(toNode) || []).filter(e => !depotTrackIds.has(e.trackId.toString()));
            if (externalEdges.length === 0) continue;

            // Pathfind from exit node to first station
            let path = window.computeFullPath(g, toNode, firstStationTrackIds, candidate.id);
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

    // Fallback: find any depot track with external connection
    if (!bestDepTrack) {
        for (let depTrackId of (depot.tracks || [])) {
            let candidate = window.tracks.find(t => t.id === depTrackId);
            if (!candidate) continue;
            let sNodeId = window.nodes.find(n => Math.hypot(n.x - candidate.start.x, n.y - candidate.start.y) < 0.1)?.id;
            let eNodeId = window.nodes.find(n => Math.hypot(n.x - candidate.end.x, n.y - candidate.end.y) < 0.1)?.id;
            if (!sNodeId || !eNodeId) continue;

            for (let [fromNode, toNode] of [[sNodeId, eNodeId], [eNodeId, sNodeId]]) {
                let ext = (g.get(toNode) || []).filter(e => !depotTrackIds.has(e.trackId.toString()));
                if (ext.length > 0) {
                    bestDepTrack = candidate; bestFromNode = fromNode; bestToNode = toNode;
                    break;
                }
            }
            if (bestDepTrack) break;
        }
    }

    // Final fallback
    if (!bestDepTrack) {
        bestDepTrack = window.tracks.find(t => t.id === depot.tracks[0]);
        if (!bestDepTrack) return null;
        bestFromNode = window.nodes.find(n => Math.hypot(n.x - bestDepTrack.start.x, n.y - bestDepTrack.start.y) < 0.1)?.id;
        bestToNode = window.nodes.find(n => Math.hypot(n.x - bestDepTrack.end.x, n.y - bestDepTrack.end.y) < 0.1)?.id;
    }

    let tLen = (depot.carriages || 4) * 25 + Math.max(0, (depot.carriages || 4) - 1);

    // Place train tail at start of depot track, head inside depot
    let initialHeadDist = Math.max(tLen, bestDepTrack.length);

    let newTrain = {
        id: 'TRN' + Math.floor(Math.random() * 100000),
        lineId: line.id, dirPhase: dir,
        carriages: depot.carriages || 4, trainLength: tLen,
        color: depot.color || '#ff8800', maxSpeed: depot.maxSpeed || 60,
        accel: depot.accel || 1.0, brake: depot.brake || 1.0, ebrake: depot.ebrake || 2.0,
        speed: 0, state: 'DRIVING',
        nextStationIdx: 0, dwellTimer: 0,
        returningToDepot: false,
        // Pre-computed route: list of {trackId, fromNode, toNode} steps to next station
        plannedRoute: [],
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
// =============================================================================
const ROUTE_LOOKAHEAD = 800; // meters of track to pre-load into history

window.extendTrainHistory = function (train, g, targetStation) {
    if (!targetStation) return;
    let sanity = 0;
    let platIds = targetStation.trackIds.map(String);

    while (sanity++ < 200) {
        let lastSeg = train.history[train.history.length - 1];
        if (!lastSeg || !lastSeg.track) break;

        let lastId = lastSeg.track.id.toString();
        let lastIsOnPlat = platIds.includes(lastId);

        if (lastIsOnPlat) {
            // We're already inside the platform. Keep extending through the
            // remaining platform tracks so the full platform is in history
            // (needed for correct multi-track stop-position calculation).
            // Count how many platform tracks are already at the tail of history.
            let platInHistory = new Set(
                train.history.filter(h => h.track && platIds.includes(h.track.id.toString()))
                    .map(h => h.track.id.toString())
            );
            if (platInHistory.size >= platIds.length) break; // all loaded

            // Find the next platform track continuing from the last segment
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

        // Not yet on platform — stop extending once we're far enough ahead
        let lookaheadEnd = lastSeg.endDist;
        if (lookaheadEnd - train.headDist > ROUTE_LOOKAHEAD) break;

        // Find next track toward the station
        let nextStep = window.findNextTrack(g, lastSeg.toNode, platIds, lastSeg.track.id);
        if (!nextStep) break;

        // Don't add duplicates
        if (train.history.some(h => h.track.id === nextStep.trackId && h.fromNode === lastSeg.toNode)) break;

        let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
        if (!nextTrack) break;

        train.history.push({
            track: nextTrack,
            fromNode: lastSeg.toNode, toNode: nextStep.to,
            startDist: lastSeg.endDist, endDist: lastSeg.endDist + nextTrack.length
        });
    }
};

// =============================================================================
// COMPUTE STOP DISTANCE WITH LOOK-AHEAD
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
window.performTurnaround = function (train) {
    let tailDist = train.headDist - train.trainLength;

    // Collect only the segments the train body overlaps
    let occupied = train.history
        .filter(h => h.endDist > tailDist && h.startDist < train.headDist)
        .sort((a, b) => a.startDist - b.startDist); // ensure forward order

    if (occupied.length === 0) {
        train.state = 'DESPAWNING';
        return false;
    }

    // Reverse and re-index
    let reversed = [];
    let cum = 0;
    for (let i = occupied.length - 1; i >= 0; i--) {
        let h = occupied[i];
        if (!h || !h.track) continue;
        reversed.push({
            track: h.track,
            fromNode: h.toNode,   // direction is now backwards
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

    // The new head = old tail, which is now at the far end of the reversed
    // segment array.  That distance is `cum` (total reversed length), but
    // the train body only occupies trainLength metres, so the head sits at
    // exactly trainLength from the new origin — provided cum >= trainLength.
    train.headDist = Math.min(cum, train.trainLength);

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
            let stations = lObj[tr.dirPhase].stations;
            let targetStation = stations[tr.nextStationIdx];
            let currentSeg = tr.history[tr.history.length - 1];

            if (!currentSeg || !currentSeg.track) { tr.state = 'DESPAWNING'; return; }

            // --- LOOK-AHEAD: extend history toward next station ---
            window.extendTrainHistory(tr, g, targetStation);

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

            // --- ACCELERATION / BRAKING ---
            if (tr.state === 'DRIVING') {
                tr.speed += tr.accel * dtSec;
                if (tr.speed > speedCap) tr.speed = speedCap;
            } else if (tr.state === 'BRAKING') {
                if (distToStop <= 0.2 || tr.speed < 0.05) {
                    // Within snap-to-stop threshold
                    tr.speed = 0;
                } else {
                    // Apply the kinematically-correct decel this tick
                    tr.speed -= demandedDecel * dtSec;
                    if (tr.speed < 0) tr.speed = 0;
                }
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

            // --- TRANSITION TO NEXT SEGMENT if head crosses into new track ---
            // (History is pre-extended; just keep tail clean)

            // --- MEMORY CLEANUP ---
            while (tr.history.length > 1 && tr.headDist - tr.trainLength > tr.history[0].endDist) {
                tr.history.shift();
                // Re-index startDist/endDist
                if (tr.history.length > 0) {
                    let offset = tr.history[0].startDist;
                    if (offset > 0) {
                        // Already absolute; no re-index needed
                    }
                }
            }

            // --- ARRIVED CHECK ---
            if (targetStation && distToStop <= 0.3 && tr.speed === 0) {
                // Snap head to exact stop position
                let platSegs = tr.history.filter(h => h.track && targetStation.trackIds.includes(h.track.id.toString()));
                if (platSegs.length > 0) {
                    let stopHeadDist = window.getPlatformStopHeadDist(tr, targetStation, tr.history);
                    tr.headDist = stopHeadDist;
                    tr.state = 'DWELLING';
                    tr.dwellTimer = targetStation.dwell || 30;
                    tr.nextStationIdx++;
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
                            // exit node WITHOUT a U-turn? (forward connectivity test)
                            let forwardReachable = false;
                            if (lastSeg) {
                                let exitNode = lastSeg.toNode;
                                let incomingTid = lastSeg.track.id;
                                let fwdPath = window.computeFullPath(g, exitNode, newFirstTids, incomingTid);
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

        } else if (tr.state === 'TURNAROUND') {
            // Physically reverse the train in its current position
            let ok = window.performTurnaround(tr);
            if (!ok) return;

            let newDir = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';

            // After reversal, verify the new head is actually pointing toward
            // the first station of the new direction.  If not (can happen with
            // complex track geometry), despawn rather than rubber-band.
            let newStations = lObj[newDir].stations;
            if (newStations && newStations.length > 0) {
                let lastSeg = tr.history[tr.history.length - 1];
                if (lastSeg) {
                    let testPath = window.computeFullPath(g, lastSeg.toNode, newStations[0].trackIds, lastSeg.track.id);
                    if (!testPath) {
                        // Can't reach first station from reversed position — despawn
                        tr.state = 'DESPAWNING';
                        return;
                    }
                }
            }

            tr.dirPhase = newDir;
            tr.nextStationIdx = 0;
            tr.speed = 0;
            // Trim any stale look-ahead so re-pathing starts fresh
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