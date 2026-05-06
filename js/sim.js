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
        li.innerHTML = `<span>\u23F0 ${window.formatTime(entry.time)} \u2192 <b>${entry.count}</b> trains</span><button onclick="window.removeFleetEntry(${idx})" class="danger" style="padding:2px 6px;font-size:10px;">X</button>`;
        list.appendChild(li);
    });

    // Show legacy departure times if present
    let deps = window.sim.editingLine[window.sim.editingDir].departures || [];
    deps.forEach((dep, idx) => {
        let li = document.createElement('li');
        li.style.cssText = 'display:flex; justify-content:space-between; padding:2px 4px; border-bottom:1px solid #eee;';
        li.innerHTML = `<span>\uD83D\uDE82 ${window.formatTime(dep.time)}</span><button onclick="window.removeDeparture(${idx})" class="danger" style="padding:2px 6px;font-size:10px;">X</button>`;
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


// --- DYNAMIC GRAPH & PATHFINDING (TOPOLOGICAL 2D) ---
window.buildGraph = function () {
    let graph = new Map();
    if (!window.tracks || !window.nodes) return graph;
    window.tracks.forEach(t => {
        let sNode = window.nodes.find(n => Math.hypot(n.x - t.start.x, n.y - t.start.y) < 0.1);
        let eNode = window.nodes.find(n => Math.hypot(n.x - t.end.x, n.y - t.end.y) < 0.1);
        if (!sNode || !eNode) return;
        if (!graph.has(sNode.id)) graph.set(sNode.id, []);
        if (!graph.has(eNode.id)) graph.set(eNode.id, []);
        // FIX: oneWay=1 means start->end only (forward), oneWay=-1 means end->start only (backward)
        if (t.oneWay !== -1) graph.get(sNode.id).push({ trackId: t.id, to: eNode.id, cost: t.length, speed: t.speedLimit || (t.type === 'arc' ? Math.min(160, 4.5 * Math.sqrt(t.radius)) : 160) });
        if (t.oneWay !== 1) graph.get(eNode.id).push({ trackId: t.id, to: sNode.id, cost: t.length, speed: t.speedLimit || (t.type === 'arc' ? Math.min(160, 4.5 * Math.sqrt(t.radius)) : 160) });
    });
    return graph;
};

// Get outgoing direction angle from a node for a given track
window._getEdgeDir = function (trackId, fromNodeId) {
    let t = window.tracks.find(x => x.id === trackId || x.id.toString() === trackId.toString());
    if (!t) return null;
    let sNode = window.nodes.find(n => Math.hypot(n.x - t.start.x, n.y - t.start.y) < 0.1);
    if (sNode && sNode.id === fromNodeId) return t.dir1; // going forward
    // going backward: direction is opposite of dir2
    let dir2 = t.dir2 !== undefined ? t.dir2 : t.dir1;
    return normalizeAngle(dir2 + Math.PI);
};

// Dijkstra respecting one-way and avoiding sharp U-turns
window.findNextTrack = function (graph, startNodeId, targetTrackIds, incomingTrackId) {
    let tIds = Array.isArray(targetTrackIds) ? targetTrackIds.map(String) : [targetTrackIds.toString()];

    // _getEdgeDir returns the direction you'd DEPART from a node along a track.
    // inDir = direction departing BACK along the incoming track (opposite of how we arrived).
    // outDir = direction departing along the candidate next track.
    // A true U-turn means outDir ≈ inDir (diff ≈ 0) — going back the exact way we came.
    // Going straight means outDir ≈ inDir + π (diff ≈ π) — which is FINE.
    // So block when diff < π/6 (within 30° of reversing).
    function isUTurn(incomingId, candidateId, nodeId) {
        let inDir = window._getEdgeDir(incomingId, nodeId);
        let outDir = window._getEdgeDir(candidateId, nodeId);
        if (inDir === null || outDir === null) return false;
        return Math.abs(normalizeAngle(outDir - inDir)) < (Math.PI / 2);
    }

    // Check if we are already adjacent to the target
    let immediates = (graph.get(startNodeId) || []).filter(e => tIds.includes(e.trackId.toString()));
    if (immediates.length > 0) {
        if (incomingTrackId) {
            let nonUTurn = immediates.find(e => !isUTurn(incomingTrackId, e.trackId, startNodeId));
            if (nonUTurn) return nonUTurn;
        }
        return immediates[0];
    }

    let q = [], distMap = new Map(), prev = new Map();
    q.push({ id: startNodeId, cost: 0 }); distMap.set(startNodeId, 0);

    while (q.length > 0) {
        q.sort((a, b) => a.cost - b.cost); let u = q.shift();

        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            // Skip U-turns only at the start node
            if (u.id === startNodeId && incomingTrackId && isUTurn(incomingTrackId, edge.trackId, startNodeId)) continue;

            if (tIds.includes(edge.trackId.toString())) {
                let curr = u.id;
                let firstEdge = edge;
                while (prev.has(curr)) {
                    firstEdge = prev.get(curr).edge;
                    curr = prev.get(curr).node;
                }
                return firstEdge;
            }

            let alt = u.cost + edge.cost;
            if (!distMap.has(edge.to) || alt < distMap.get(edge.to)) {
                distMap.set(edge.to, alt); prev.set(edge.to, { node: u.id, edge: edge });
                q.push({ id: edge.to, cost: alt });
            }
        }
    }

    // Retry without U-turn restriction (terminus or forced reversal)
    if (incomingTrackId) {
        return window.findNextTrack(graph, startNodeId, targetTrackIds, null);
    }
    return null;
};

window.calculateLinePathsAndSchedule = function (line) {
    let g = window.buildGraph();
    let bufferMult = 1 / (1 - (line.buffer || 5) / 100);

    for (let dir of ['inbound', 'outbound']) {
        line[dir].stationTimetable = []; // relative times in seconds from start
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
    // Estimate round trip for fleet spreading
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

// History Array: [ {track: obj, fromNode: id, toNode: id, startDist: num, endDist: num} ]
window.getPointOnHistory = function (history, distFromTail) {
    if (!history || history.length === 0) return null;
    let seg = history.find(h => distFromTail >= h.startDist && distFromTail <= h.endDist);
    if (!seg) seg = distFromTail < 0 ? history[0] : history[history.length - 1];
    if (!seg || !seg.track) return null; // FIX: guard against undefined track

    let localDist = distFromTail - seg.startDist;
    let tStartNodeId = window.nodes.find(n => Math.hypot(n.x - seg.track.start.x, n.y - seg.track.start.y) < 0.1)?.id;
    let isForward = (seg.fromNode === tStartNodeId);

    let tParam = isForward ? (localDist / seg.track.length) : (1 - localDist / seg.track.length);
    tParam = Math.max(0, Math.min(1, tParam));
    return window.getExactTrackPointAndDir(seg.track, tParam, isForward);
};

// --- FLEET SCHEDULE HELPERS ---
window.getTargetFleetSize = function (line, time) {
    let sched = line.fleetSchedule || [];
    if (sched.length === 0) return null; // null = use legacy departure system
    let count = 0;
    for (let entry of sched) {
        if (time >= entry.time) count = entry.count;
    }
    return count;
};

window.spawnTrainOnLine = function (line, dir, depot) {
    // Build graph once to determine connectivity
    let g = window.buildGraph();
    let depotTrackIds = new Set((depot.tracks || []).map(String));

    // Find which depot track has an external (non-depot) track connected, and which end
    let depTrack = null;
    let fromNode = null;
    let toNode = null;

    for (let depTrackId of (depot.tracks || [])) {
        let candidate = window.tracks.find(t => t.id === depTrackId);
        if (!candidate) continue;

        let sNodeId = window.nodes.find(n => Math.hypot(n.x - candidate.start.x, n.y - candidate.start.y) < 0.1)?.id;
        let eNodeId = window.nodes.find(n => Math.hypot(n.x - candidate.end.x, n.y - candidate.end.y) < 0.1)?.id;

        let endExternal = (g.get(eNodeId) || []).some(e => !depotTrackIds.has(e.trackId.toString()));
        let startExternal = (g.get(sNodeId) || []).some(e => !depotTrackIds.has(e.trackId.toString()));

        if (endExternal || startExternal) {
            depTrack = candidate;
            // Exit from whichever end connects externally; tail at the other end
            if (endExternal) {
                fromNode = sNodeId;
                toNode = eNodeId;
            } else {
                fromNode = eNodeId;
                toNode = sNodeId;
            }
            break;
        }
    }

    // Fallback: use first depot track with default direction if none has external connections
    if (!depTrack) {
        depTrack = window.tracks.find(t => t.id === depot.tracks[0]);
        if (!depTrack) return null;
        fromNode = window.nodes.find(n => Math.hypot(n.x - depTrack.start.x, n.y - depTrack.start.y) < 0.1)?.id;
        toNode = window.nodes.find(n => Math.hypot(n.x - depTrack.end.x, n.y - depTrack.end.y) < 0.1)?.id;
    }

    if (!depTrack) return null;

    let tLen = (depot.carriages || 4) * 25 + Math.max(0, (depot.carriages || 4) - 1);
    let initialHeadDist = Math.max(tLen, depTrack.length);

    // history  = segments the train has already traversed (for rear-carriage rendering)
    // route    = planned future segments not yet reached by the head (for braking lookahead)
    // The head always sits inside history[history.length-1].
    let newTrain = {
        id: 'TRN' + Math.floor(Math.random() * 100000),
        lineId: line.id, dirPhase: dir,
        carriages: depot.carriages || 4, trainLength: tLen,
        color: depot.color || '#ff8800', maxSpeed: depot.maxSpeed || 60,
        accel: depot.accel || 1.0, brake: depot.brake || 1.0, ebrake: depot.ebrake || 2.0,
        speed: 0, state: 'DRIVING',
        nextStationIdx: 0, dwellTimer: 0,
        returningToDepot: false,
        history: [{
            track: depTrack, fromNode: fromNode, toNode: toNode,
            startDist: 0, endDist: depTrack.length
        }],
        route: [],   // future planned segments [{track, fromNode, toNode}]
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

            // Check if we just passed through a station
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

                // Count active (non-returning) trains
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

                    // Estimate trip distances for even spreading
                    let inTripDist = l.inbound.stations.length > 0 ? window.estimateLineTripDistance(l, 'inbound') : 0;
                    let outTripDist = l.outbound.stations.length > 0 ? window.estimateLineTripDistance(l, 'outbound') : 0;
                    let totalDist = inTripDist + outTripDist;

                    for (let i = 0; i < needed; i++) {
                        if (!depot) break;
                        // Alternate directions for even spread
                        let dir;
                        if (!hasBothDirs) {
                            dir = l.inbound.stations.length > 0 ? 'inbound' : 'outbound';
                        } else {
                            dir = (totalActive + i) % 2 === 0 ? 'inbound' : 'outbound';
                        }
                        if (l[dir].stations.length === 0) continue;

                        let train = window.spawnTrainOnLine(l, dir, depot);
                        if (!train) continue;

                        // Even spreading: offset each new train along the line
                        // Space trains evenly across total round-trip distance
                        if (targetCount > 1 && totalDist > 0) {
                            let slotIndex = totalActive + i;
                            let spreadFraction = (slotIndex / targetCount) % 1.0;
                            // Map fraction to position along inbound or outbound
                            let inFrac = inTripDist / totalDist;
                            let advanceDist;
                            if (spreadFraction < inFrac) {
                                // Place in inbound
                                if (dir !== 'inbound' && l.inbound.stations.length > 0) {
                                    train.dirPhase = 'inbound';
                                }
                                advanceDist = (spreadFraction / inFrac) * inTripDist;
                            } else {
                                // Place in outbound
                                if (dir !== 'outbound' && l.outbound.stations.length > 0) {
                                    train.dirPhase = 'outbound';
                                }
                                advanceDist = ((spreadFraction - inFrac) / (1 - inFrac)) * outTripDist;
                            }
                            if (advanceDist > 10) {
                                window.advanceTrainPosition(train, l, train.dirPhase, g, advanceDist);
                            }
                        }

                        window.trains.push(train);
                    }
                } else if (totalActive > targetCount) {
                    // Mark excess trains to return to depot after finishing their current bound
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
    // FIX: cap dtSec to prevent massive teleport jumps at high sim speed
    let dtSec = Math.min((dt / 1000) * window.sim.speed, 5.0);

    window.trains.forEach(tr => {
        let lObj = window.sim.lines.find(x => x.id === tr.lineId);
        if (!lObj) { tr.state = 'DESPAWNING'; return; }

        // FIX: guard against empty or invalid history
        if (!tr.history || tr.history.length === 0 || !tr.history[tr.history.length - 1] || !tr.history[tr.history.length - 1].track) {
            tr.state = 'DESPAWNING'; return;
        }

        if (tr.state === 'DRIVING' || tr.state === 'BRAKING') {

            let targetStation = lObj[tr.dirPhase].stations[tr.nextStationIdx];
            let currentSeg = tr.history[tr.history.length - 1];

            if (!currentSeg || !currentSeg.track) { tr.state = 'DESPAWNING'; return; }

            let trMaxSpeedMs = tr.maxSpeed / 3.6;

            // ---------------------------------------------------------------
            // STEP 1: PRE-EMPTIVE LOOK-AHEAD PATHFINDING
            // Extend history far enough ahead to always have the full platform
            // in history before the train reaches it, so stop distance is exact.
            // We keep extending until we've captured ALL platform tracks or
            // we've looked far enough ahead.
            // ---------------------------------------------------------------
            if (targetStation) {
                let brakingLookahead = Math.max(
                    (tr.speed * tr.speed) / (2 * tr.brake) + tr.trainLength + 300,
                    500
                );
                let safetyCount = 0;
                // Count how many of the target platform tracks are already in history
                let platTracksInHistory = () => tr.history.filter(h => h.track && targetStation.trackIds.includes(h.track.id.toString())).length;
                let lastHistSeg = () => tr.history[tr.history.length - 1];

                while (safetyCount++ < 40) {
                    let last = lastHistSeg();
                    if (!last) break;
                    let lookaheadEnd = last.endDist;
                    let allPlatInHistory = platTracksInHistory() >= targetStation.trackIds.length;

                    // Stop extending if we have all platform tracks AND enough lookahead distance
                    if (allPlatInHistory && lookaheadEnd >= tr.headDist + brakingLookahead) break;
                    // Also stop if we've gone far enough with partial platform captured (avoid infinite loop on broken maps)
                    if (allPlatInHistory && lookaheadEnd >= tr.headDist + tr.trainLength * 2) break;

                    // Use lastTrackId on the very first extension after a turnaround so we
                    // don't U-turn back into the platform we just left.
                    let incomingForLookahead = last.track.id;
                    if (tr.lastTrackId && last.track.id === tr.lastTrackId) {
                        incomingForLookahead = tr.lastTrackId;
                    }
                    let nextStep = window.findNextTrack(g, last.toNode, targetStation.trackIds, incomingForLookahead);
                    if (!nextStep) break;
                    let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
                    if (!nextTrack) break;
                    // Avoid duplicate entries
                    if (tr.history.some(h => h.track && h.track.id === nextTrack.id && Math.abs(h.startDist - last.endDist) < 0.1)) break;
                    tr.history.push({
                        track: nextTrack, fromNode: last.toNode, toNode: nextStep.to,
                        startDist: last.endDist, endDist: last.endDist + nextTrack.length
                    });
                    // Once we've made the first extension away from the turnaround, clear lastTrackId
                    tr.lastTrackId = null;
                }
            }

            // ---------------------------------------------------------------
            // STEP 2: COMPUTE EXACT STOP POSITION
            // The stop target is where headDist should end up.
            // Carriage bogie geometry (per carriage i):
            //   front bogie: headDist - 4  - i*26
            //   rear  bogie: headDist - 21 - i*26
            // Last carriage (i = N-1) rear bogie: headDist - 21 - (N-1)*26
            // Physical train rear: headDist - trainLength
            //
            // Goal: fit the whole train inside the platform.
            //   stopHeadDist = platEnd - 4   (front bogie just inside far end)
            //   verify rear  = stopHeadDist - trainLength >= platStart
            // If train is longer than platform, centre the train on the platform.
            // ---------------------------------------------------------------
            let stopHeadDist = null; // will be set if platform is in history

            if (targetStation) {
                let platSegs = tr.history.filter(h => h.track && targetStation.trackIds.includes(h.track.id.toString()));

                if (platSegs.length > 0) {
                    let platStart = Math.min(...platSegs.map(h => h.startDist));
                    let platEnd = Math.max(...platSegs.map(h => h.endDist));
                    let platLen = platEnd - platStart;

                    if (tr.trainLength <= platLen) {
                        // Align: front bogie 4 m before far end → head at platEnd - 4
                        stopHeadDist = platEnd - 4;
                        // Safety: ensure rear fits inside
                        let rear = stopHeadDist - tr.trainLength;
                        if (rear < platStart) {
                            // Push forward so rear is at platStart
                            stopHeadDist = platStart + tr.trainLength;
                        }
                    } else {
                        // Train longer than platform – centre it
                        stopHeadDist = platStart + (platLen + tr.trainLength) / 2;
                    }
                }
            }

            // ---------------------------------------------------------------
            // STEP 3: NORMAL END-OF-SEGMENT PATHFINDING
            // (Only if look-ahead hasn't already queued the next seg)
            // ---------------------------------------------------------------
            if (tr.headDist + (tr.speed * dtSec) + 2 > currentSeg.endDist) {
                let alreadyQueued = tr.history.some(h => h.startDist >= currentSeg.endDist - 0.1);
                if (!alreadyQueued && targetStation && !targetStation.trackIds.includes(currentSeg.track.id.toString())) {
                    // After turnaround, use lastTrackId so we don't reverse back into the platform
                    let incomingId = tr.lastTrackId || currentSeg.track.id;
                    let nextStep = window.findNextTrack(g, currentSeg.toNode, targetStation.trackIds, incomingId);
                    if (nextStep) {
                        let nextTrack = window.tracks.find(x => x.id === nextStep.trackId);
                        if (nextTrack) {
                            tr.history.push({
                                track: nextTrack, fromNode: currentSeg.toNode, toNode: nextStep.to,
                                startDist: currentSeg.endDist, endDist: currentSeg.endDist + nextTrack.length
                            });
                            tr.lastTrackId = null; // consumed — clear it
                        }
                    } else {
                        tr.speed = 0;
                    }
                }
            }

            // Memory cleanup — keep enough tail for rear carriages
            while (tr.history.length > 1 && tr.headDist - tr.trainLength - 10 > tr.history[0].endDist) {
                tr.history.shift();
            }

            // ---------------------------------------------------------------
            // STEP 4: SPEED CONTROL — single unified PD-style controller
            //
            // Every frame we compute the "ideal speed" at the current distance
            // from the stop point, using v_ideal = sqrt(2 * brake * dist).
            // This is a real-time self-correcting brake curve: if the train is
            // too fast it brakes harder; if it overshot it still converges.
            // Speed limits use the same curve for the nearest limit drop ahead.
            // ---------------------------------------------------------------
            let currentLimitMs = currentSeg.track.speedLimit ? currentSeg.track.speedLimit / 3.6 : trMaxSpeedMs;

            // Find the most restrictive upcoming constraint:
            //   a) station stop
            //   b) speed limit reduction ahead
            let targetSpeedMs = Math.min(trMaxSpeedMs, currentLimitMs);
            let mustBrake = false;

            // (a) Station braking constraint
            if (stopHeadDist !== null) {
                let distToStop = stopHeadDist - tr.headDist;

                // Only enter BRAKING when we are still approaching (distToStop > 0)
                // and we need to start decelerating. Never flip back to BRAKING after
                // DRIVING resumes for the next station.
                if (tr.state === 'DRIVING' && distToStop > 0 &&
                    distToStop <= (tr.speed * tr.speed) / (2 * tr.brake) + 15) {
                    tr.state = 'BRAKING';
                }

                if (tr.state === 'BRAKING') {
                    // Ideal speed curve — recalculated every frame for real-time correction.
                    // If distToStop <= 0 we've reached the stop point; target speed = 0.
                    let idealSpeedForStop = distToStop > 0
                        ? Math.sqrt(Math.max(0, 2 * tr.brake * distToStop))
                        : 0;
                    targetSpeedMs = Math.min(targetSpeedMs, idealSpeedForStop);
                    mustBrake = true;
                }
            }

            // (b) Speed limit look-ahead (applies even while DRIVING)
            for (let hi = 0; hi < tr.history.length; hi++) {
                let h = tr.history[hi];
                if (!h || !h.track || h.endDist <= tr.headDist) continue;
                let segLimit = h.track.speedLimit ? h.track.speedLimit / 3.6 : trMaxSpeedMs;
                if (segLimit < tr.speed - 0.5) {
                    let distToZone = Math.max(0, h.startDist - tr.headDist);
                    let neededDist = (tr.speed * tr.speed - segLimit * segLimit) / (2 * tr.brake);
                    if (distToZone <= neededDist + 5) {
                        let idealForLimit = distToZone > 0
                            ? Math.sqrt(Math.max(segLimit * segLimit, segLimit * segLimit + 2 * tr.brake * distToZone))
                            : segLimit;
                        targetSpeedMs = Math.min(targetSpeedMs, idealForLimit);
                        mustBrake = true;
                    }
                    break;
                }
            }

            // Apply speed: accelerate toward target, or clamp down to it
            if (!mustBrake || targetSpeedMs > tr.speed) {
                tr.speed += tr.accel * dtSec;
            } else {
                tr.speed -= tr.brake * dtSec;
            }
            // Hard clamp to the target every frame — this is the real-time correction
            tr.speed = Math.min(tr.speed, targetSpeedMs);
            if (tr.speed < 0) tr.speed = 0;

            // Collision Avoidance
            let safetyDist = (tr.speed * tr.speed) / (2 * tr.brake) + 20;
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

            if (obstacleAhead) tr.speed -= tr.ebrake * dtSec;
            if (tr.speed < 0) tr.speed = 0;

            tr.headDist += tr.speed * dtSec;

            // ---------------------------------------------------------------
            // STEP 5: ARRIVAL — hard-snap headDist to stop point, no overshoot
            // ---------------------------------------------------------------
            if (tr.state === 'BRAKING' && stopHeadDist !== null) {
                // Clamp: never overshoot the stop point
                if (tr.headDist >= stopHeadDist) {
                    tr.headDist = stopHeadDist;
                    tr.speed = 0;
                }
                if (tr.speed === 0 && tr.headDist >= stopHeadDist - 1.0) {
                    tr.headDist = stopHeadDist; // snap exactly
                    tr.state = 'DWELLING';
                    tr.dwellTimer = targetStation ? (targetStation.dwell || 30) : 30;
                    tr.nextStationIdx++;
                }
            }

        } else if (tr.state === 'DWELLING') {
            tr.dwellTimer -= dtSec;
            if (tr.dwellTimer <= 0) {
                let stations = lObj[tr.dirPhase].stations;
                if (tr.nextStationIdx >= stations.length) {
                    if (tr.returningToDepot) {
                        tr.state = 'DESPAWNING';
                    } else {
                        tr.state = 'TURNAROUND';
                    }
                } else {
                    // Record the current (platform) track so pathfinding won't
                    // route us straight back into it when we resume DRIVING
                    let dwellSeg = tr.history[tr.history.length - 1];
                    if (dwellSeg && dwellSeg.track) tr.lastTrackId = dwellSeg.track.id;
                    tr.state = 'DRIVING';
                }
            }
        } else if (tr.state === 'TURNAROUND') {
            // Reverse direction: the physical rear of the train becomes the new head.
            // Flip traversal direction of each occupied segment and recalculate distances
            // so the new headDist is exactly where the old physical tail was.

            let oldHeadDist = tr.headDist;
            let oldTailDist = tr.headDist - tr.trainLength;

            // Find which old segment contained the tail, to compute the new head offset
            let tailSeg = null, tailOffsetInSeg = 0;
            for (let i = 0; i < tr.history.length; i++) {
                let h = tr.history[i];
                if (!h || !h.track) continue;
                if (h.startDist <= oldTailDist && h.endDist >= oldTailDist) {
                    tailSeg = h;
                    tailOffsetInSeg = oldTailDist - h.startDist;
                    break;
                }
            }

            // Collect and flip only the segments the body occupies (reversed order)
            let newHistory = [];
            for (let i = tr.history.length - 1; i >= 0; i--) {
                let h = tr.history[i];
                if (!h || !h.track) continue;
                if (h.endDist < oldTailDist - 0.1 || h.startDist > oldHeadDist + 0.1) continue;
                newHistory.push({
                    track: h.track,
                    fromNode: h.toNode,
                    toNode: h.fromNode,
                    startDist: 0, endDist: h.track.length
                });
            }

            if (newHistory.length === 0) { tr.state = 'DESPAWNING'; return; }

            // Recompute cumulative distances
            let cumulative = 0;
            newHistory.forEach(h => {
                h.startDist = cumulative;
                cumulative += h.track.length;
                h.endDist = cumulative;
            });

            // Compute new headDist: in the reversed frame, the old tail becomes the head.
            // The old tail was (tailOffsetInSeg) into tailSeg from its old start.
            // In the reversed frame, tailSeg is now traversed backwards, so the same
            // physical point is at (tailSeg.track.length - tailOffsetInSeg) from its new start.
            let newHeadDist = cumulative; // fallback: use physical end of reversed history
            if (tailSeg) {
                let newSeg = newHistory.find(h => h.track.id === tailSeg.track.id);
                if (newSeg) {
                    newHeadDist = newSeg.startDist + (tailSeg.track.length - tailOffsetInSeg);
                }
            }

            tr.history = newHistory;
            tr.headDist = newHeadDist;
            tr.dirPhase = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';
            tr.nextStationIdx = 0;
            // Remember the current tail segment so look-ahead pathfinding won't
            // immediately U-turn back into the platform we just left
            tr.lastTrackId = newHistory[newHistory.length - 1] ? newHistory[newHistory.length - 1].track.id : null;
            tr.state = 'DRIVING';
        }

        if (window.selectedTrain && window.selectedTrain.id === tr.id) {
            document.getElementById('train-info-speed').innerText = Math.round(tr.speed * 3.6);
            document.getElementById('train-info-state').innerText = tr.state + (tr.returningToDepot ? ' [\u2192Depot]' : '');
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
