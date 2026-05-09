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

// Dijkstra respecting one-way and rejecting sharp turns (>90° geometric angle)
// Uses real geometric tangent angles at each node to determine if a turn is physically possible.
// A turn is rejected if the angle between arrival tangent and departure tangent exceeds 90°.
// Phase 1: strict (reject sharp) → Phase 2: with turnaround → Phase 3: allow sharp (last resort)
window.findNextTrack = function (graph, startNodeId, targetTrackIds, incomingTrackId, _skipSharp) {
    let tIds = Array.isArray(targetTrackIds) ? targetTrackIds.map(String) : [targetTrackIds.toString()];
    let skipSharp = _skipSharp || false;

    // Compute the geometric turn angle at a node between incoming and candidate tracks.
    // Returns the absolute angle between arrival tangent and departure tangent in [0, π].
    // Arrival tangent = direction the train was heading when it arrived at the node.
    //   This is the OPPOSITE of _getEdgeDir(incomingId, nodeId) which gives the "depart back" direction.
    // Departure tangent = direction the train will head on the candidate track.
    function computeTurnAngle(incomingId, candidateId, nodeId) {
        let departBackDir = window._getEdgeDir(incomingId, nodeId);
        let departFwdDir = window._getEdgeDir(candidateId, nodeId);
        if (departBackDir === null || departFwdDir === null) return 0;
        let arrivalDir = normalizeAngle(departBackDir + Math.PI);
        return Math.abs(normalizeAngle(departFwdDir - arrivalDir));
    }

    // A sharp turn is one where the geometric angle between arrival and departure
    // exceeds 90°. This is physically impossible for a train regardless of direction
    // the track was placed (handles "opposite direction looks the same" for player).
    function isSharpTurn(incomingId, candidateId, nodeId) {
        return computeTurnAngle(incomingId, candidateId, nodeId) > (Math.PI / 2);
    }

    // Check immediate adjacency first
    let immediates = (graph.get(startNodeId) || []).filter(e => tIds.includes(e.trackId.toString()));
    if (immediates.length > 0) {
        if (incomingTrackId && !skipSharp) {
            let nonSharp = immediates.find(e => !isSharpTurn(incomingTrackId, e.trackId, startNodeId));
            if (nonSharp) return nonSharp;
        }
        return immediates[0];
    }

    // Dijkstra with sharp turn rejection at ALL nodes (not just the start).
    // State: (nodeId, incomingTrackId) so we can check the turn angle at every node.
    let stateKey = (nId, incId) => nId + ':' + (incId || '');

    let q = [], distMap = new Map(), prev = new Map();
    let startIncId = incomingTrackId || null;
    let startKeyStr = stateKey(startNodeId, startIncId);
    q.push({ id: startNodeId, incId: startIncId, cost: 0 });
    distMap.set(startKeyStr, 0);

    while (q.length > 0) {
        q.sort((a, b) => a.cost - b.cost);
        let u = q.shift();
        let uKeyStr = stateKey(u.id, u.incId);

        // Skip stale entries
        if (u.cost > (distMap.get(uKeyStr) ?? Infinity)) continue;

        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            // Check sharp turn at this node (skip check if in fallback mode)
            if (!skipSharp && u.incId && isSharpTurn(u.incId, edge.trackId, u.id)) continue;

            if (tIds.includes(edge.trackId.toString())) {
                // Found target — trace back to get the first edge from start
                let curr = u.id, currInc = u.incId, firstEdge = edge;
                let traceKey = stateKey(curr, currInc);
                while (prev.has(traceKey)) {
                    let p = prev.get(traceKey);
                    firstEdge = p.edge;
                    curr = p.node;
                    currInc = p.incId;
                    traceKey = stateKey(curr, currInc);
                }
                return firstEdge;
            }

            let alt = u.cost + edge.cost;
            let vKeyStr = stateKey(edge.to, edge.trackId);
            if (!distMap.has(vKeyStr) || alt < distMap.get(vKeyStr)) {
                distMap.set(vKeyStr, alt);
                prev.set(vKeyStr, { node: u.id, incId: u.incId, edge: edge });
                q.push({ id: edge.to, incId: edge.trackId, cost: alt });
            }
        }
    }

    // Fallback: retry without sharp turn restriction (last resort for terminus etc.)
    if (!skipSharp) {
        return window.findNextTrack(graph, startNodeId, targetTrackIds, incomingTrackId, true);
    }
    return null;
};

// Find a path with turnaround: when no direct path exists (all require sharp turns),
// find a nearby turnaround area (bidirectional track long enough for the train),
// navigate there, stop, change cab/direction, then continue to target.
// Returns the first edge toward the turnaround area, or null.
window.findPathWithTurnaround = function (graph, startNodeId, targetTrackIds, incomingTrackId, trainLength) {
    let tIds = Array.isArray(targetTrackIds) ? targetTrackIds.map(String) : [targetTrackIds.toString()];

    // BFS from start node to find a suitable turnaround area
    let visited = new Set();
    let q = [{ id: startNodeId, dist: 0, firstEdge: null }];
    visited.add(startNodeId);

    while (q.length > 0) {
        let u = q.shift();
        let edges = graph.get(u.id) || [];

        // Check if this node has a turnaround area (bidirectional track >= trainLength)
        for (let edge of edges) {
            let track = window.tracks.find(t => t.id === edge.trackId || t.id.toString() === edge.trackId.toString());
            if (!track || track.oneWay !== 0) continue; // Must be bidirectional

            // Check if this single track is long enough, or if connected bidirectional
            // tracks form a long enough area
            let totalLen = track.length;
            if (totalLen >= trainLength) {
                // Check if we can reach the target after turnaround from the OTHER end of this track
                // After turnaround, we'd be at edge.to facing back toward u.id
                // Incoming track after turnaround = edge.trackId (but traversed in reverse)
                let testResult = window.findNextTrack(graph, edge.to, tIds, edge.trackId);
                if (testResult) {
                    // We can reach the target after turnaround!
                    return u.firstEdge || edge; // First step toward turnaround
                }
            }

            // Try extending with adjacent bidirectional tracks at the other end
            let otherEdges = graph.get(edge.to) || [];
            for (let oe of otherEdges) {
                let otherTrack = window.tracks.find(t => t.id === oe.trackId || t.id.toString() === oe.trackId.toString());
                if (!otherTrack || otherTrack.oneWay !== 0) continue;
                if (totalLen + otherTrack.length >= trainLength) {
                    let testResult = window.findNextTrack(graph, edge.to, tIds, edge.trackId);
                    if (testResult) {
                        return u.firstEdge || edge;
                    }
                }
            }
        }

        // Continue BFS (limited range to avoid expensive search)
        for (let edge of edges) {
            if (!visited.has(edge.to) && u.dist + edge.cost < 5000) {
                visited.add(edge.to);
                q.push({
                    id: edge.to,
                    dist: u.dist + edge.cost,
                    firstEdge: u.firstEdge || edge
                });
            }
        }
    }

    return null; // No turnaround path found
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

    let newTrain = {
        id: 'TRN' + Math.floor(Math.random() * 100000),
        lineId: line.id, dirPhase: dir,
        carriages: depot.carriages || 4, trainLength: tLen,
        color: depot.color || '#ff8800', maxSpeed: depot.maxSpeed || 60,
        accel: depot.accel || 1.0, brake: depot.brake || 1.0, ebrake: depot.ebrake || 2.0,
        speed: 0, state: 'DRIVING',
        nextStationIdx: 0, dwellTimer: 0,
        returningToDepot: false, stuckTimer: 0,
        history: [{
            track: depTrack, fromNode: fromNode, toNode: toNode,
            startDist: 0, endDist: depTrack.length
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

            // ── PROACTIVE LOOK-AHEAD ──────────────────────────────────────────────
            // Extend history far enough ahead to know where the platform is before
            // we reach it, and walk ALL platform tracks (not just the first one).
            // history is always in travel order, so platEnd = the departure end.
            if (targetStation) {
                let platIds = targetStation.trackIds.map(String);
                let lookAhead = (tr.speed * tr.speed) / (2 * tr.brake) + tr.trainLength + 300;
                let sanity = 0;
                while (sanity++ < 50) {
                    let last = tr.history[tr.history.length - 1];
                    if (!last || !last.track) break;
                    let coveredPlat = new Set(
                        tr.history.filter(h => h.track && platIds.includes(h.track.id.toString()))
                            .map(h => h.track.id.toString())
                    );
                    let allCovered = platIds.every(id => coveredPlat.has(id));
                    if (allCovered && last.endDist >= tr.headDist + lookAhead) break;
                    if (platIds.includes(last.track.id.toString())) {
                        // Already on platform — walk remaining platform tracks via neighbours
                        if (allCovered) break;
                        let edges = g.get(last.toNode) || [];
                        let nextPlatEdge = edges.find(e =>
                            platIds.includes(e.trackId.toString()) && !coveredPlat.has(e.trackId.toString())
                        );
                        if (!nextPlatEdge) break;
                        let nxtT = window.tracks.find(x => x.id === nextPlatEdge.trackId);
                        if (!nxtT || last.track.id === nxtT.id) break;
                        tr.history.push({
                            track: nxtT, fromNode: last.toNode, toNode: nextPlatEdge.to,
                            startDist: last.endDist, endDist: last.endDist + nxtT.length
                        });
                    } else {
                        // Navigate toward platform
                        let nxt = window.findNextTrack(g, last.toNode, targetStation.trackIds, last.track.id);
                        // If normal pathfinding fails, try turnaround as fallback
                        if (!nxt) {
                            nxt = window.findPathWithTurnaround(g, last.toNode, targetStation.trackIds, last.track.id, tr.trainLength);
                        }
                        if (!nxt) break;
                        let nxtT = window.tracks.find(x => x.id === nxt.trackId);
                        if (!nxtT || last.track.id === nxtT.id) break;
                        tr.history.push({
                            track: nxtT, fromNode: last.toNode, toNode: nxt.to,
                            startDist: last.endDist, endDist: last.endDist + nxtT.length
                        });
                    }
                }
            }

            currentSeg = tr.history[tr.history.length - 1];

            // ── PLATFORM STOP TARGET ──────────────────────────────────────────────
            // history is always in travel order, so platEnd (max endDist of platform
            // segments) is the far/exit end in the direction of travel — regardless of
            // which direction the track was physically laid.
            // We stop the head FAR_END_BUFFER metres before that exit end so the body
            // fills the platform toward the entry end.
            let headStopDist = null;
            if (targetStation) {
                let platIds = targetStation.trackIds.map(String);
                let platSegs = tr.history.filter(h => h.track && platIds.includes(h.track.id.toString()));
                if (platSegs.length > 0) {
                    let platStart = Math.min(...platSegs.map(h => h.startDist));
                    let platEnd = Math.max(...platSegs.map(h => h.endDist));
                    let platLen = platEnd - platStart;
                    // Head stops this far from the far (exit) end of the platform.
                    // 1 m gives a visually tight stop right at the end.
                    const FAR_END_BUFFER = 1;
                    headStopDist = platEnd - FAR_END_BUFFER;
                    // If the train body would overshoot the entry end, pull head back
                    // just enough so the tail doesn't stick out.
                    let minHead = platStart + tr.trainLength;
                    if (headStopDist < minHead) headStopDist = minHead;
                    // Hard clamp: never past the exit edge
                    headStopDist = Math.min(headStopDist, platEnd - FAR_END_BUFFER);
                }
            }

            let distToStop = headStopDist !== null ? headStopDist - tr.headDist : Infinity;

            // ── BRAKING TRIGGER ───────────────────────────────────────────────────
            // Start braking when kinematic stop distance + generous margin is reached.
            // A larger margin (50 m) means the controller starts feathering the brakes
            // early, producing a smooth glide rather than a last-second slam.
            if (headStopDist !== null && tr.state === 'DRIVING') {
                let brakeDist = (tr.speed * tr.speed) / (2 * tr.brake);
                if (distToStop <= brakeDist + 50) tr.state = 'BRAKING';
            }

            // ── MEMORY CLEANUP ────────────────────────────────────────────────────
            while (tr.history.length > 1 && tr.headDist - tr.trainLength > tr.history[0].endDist)
                tr.history.shift();

            // ── SPEED LIMIT LOOK-AHEAD ────────────────────────────────────────────
            let trMaxSpeedMs = tr.maxSpeed / 3.6;
            let demandedSpeedMs = trMaxSpeedMs;
            for (let h of tr.history) {
                if (h.startDist > tr.headDist + 600) break;
                let segLimitMs = h.track.speedLimit ? h.track.speedLimit / 3.6 : trMaxSpeedMs;
                if (segLimitMs < demandedSpeedMs) {
                    let distToSeg = Math.max(0, h.startDist - tr.headDist);
                    let neededBrake = (tr.speed * tr.speed - segLimitMs * segLimitMs) / (2 * tr.brake);
                    if (distToSeg <= neededBrake + 5) demandedSpeedMs = segLimitMs;
                }
            }
            let curLimitMs = currentSeg.track.speedLimit ? currentSeg.track.speedLimit / 3.6 : trMaxSpeedMs;
            demandedSpeedMs = Math.min(demandedSpeedMs, curLimitMs, trMaxSpeedMs);

            // ── CLOSED-LOOP SPEED CONTROLLER ──────────────────────────────────────
            // Target speed = sqrt(2 * brake * distToStop) — the kinematically correct
            // speed to arrive at zero exactly at headStopDist.
            // A 50 m head-start in the braking trigger means the train eases into this
            // curve gently, producing a realistic glide rather than a hard stop.
            // No teleporting; the train always decelerates naturally.
            let targetSpeedMs;
            if (tr.state === 'BRAKING' && headStopDist !== null) {
                if (distToStop <= 0) {
                    // At or past target — coast to a full stop
                    targetSpeedMs = 0;
                } else {
                    let idealSpeed = Math.sqrt(2 * tr.brake * distToStop);
                    targetSpeedMs = Math.min(idealSpeed, demandedSpeedMs);
                }
            } else {
                targetSpeedMs = demandedSpeedMs;
            }

            if (tr.speed > 0 || (targetSpeedMs !== undefined && targetSpeedMs > 0)) {
                if (targetSpeedMs !== undefined) {
                    if (tr.speed < targetSpeedMs - 0.01) {
                        tr.speed += tr.accel * dtSec;
                        if (tr.speed > targetSpeedMs) tr.speed = targetSpeedMs;
                    } else if (tr.speed > targetSpeedMs + 0.01) {
                        tr.speed -= tr.brake * dtSec;
                        if (tr.speed < targetSpeedMs) tr.speed = targetSpeedMs;
                    }
                }
                if (tr.speed < 0) tr.speed = 0;
            }

            // ── COLLISION AVOIDANCE ───────────────────────────────────────────────
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
            if (obstacleAhead) { tr.speed -= tr.ebrake * dtSec; if (tr.speed < 0) tr.speed = 0; }

            tr.headDist += tr.speed * dtSec;

            // ── STUCK / END-OF-PATH HANDLING ──────────────────────────────────────
            // If the train has moved past the end of its known history, clamp it and
            // stop. This prevents teleporting or moving into void. The look-ahead will
            // retry extending the path on the next tick. If stuck too long, try turnaround.
            let lastKnownSeg = tr.history[tr.history.length - 1];
            if (lastKnownSeg && tr.headDist > lastKnownSeg.endDist) {
                tr.headDist = lastKnownSeg.endDist;
                tr.speed = 0;
                tr.stuckTimer = (tr.stuckTimer || 0) + dtSec;

                // After being stuck for a while, try turnaround as a last resort
                if (tr.stuckTimer > 10 && targetStation) {
                    let last = tr.history[tr.history.length - 1];
                    if (last && last.track) {
                        let turnaroundStep = window.findPathWithTurnaround(g, last.toNode, targetStation.trackIds, last.track.id, tr.trainLength);
                        if (turnaroundStep) {
                            let nxtT = window.tracks.find(x => x.id === turnaroundStep.trackId);
                            if (nxtT && nxtT.id !== last.track.id) {
                                tr.history.push({
                                    track: nxtT, fromNode: last.toNode, toNode: turnaroundStep.to,
                                    startDist: last.endDist, endDist: last.endDist + nxtT.length
                                });
                                tr.stuckTimer = 0;
                            }
                        }
                    }
                }
                // Despawn if stuck for way too long (2 minutes)
                if (tr.stuckTimer > 120) {
                    tr.state = 'DESPAWNING';
                }
            } else {
                tr.stuckTimer = 0;
            }

            // ── ARRIVAL DETECTION ─────────────────────────────────────────────────
            // No teleport: only dwell when the train has physically stopped near target.
            if (tr.state === 'BRAKING' && headStopDist !== null) {
                let arrivedNaturally = tr.speed < 0.15 && distToStop < 3;
                let overran = tr.headDist >= headStopDist; // passed the target
                if (arrivedNaturally || overran) {
                    tr.speed = 0;
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
                    if (tr.returningToDepot) {
                        tr.state = 'DESPAWNING';
                    } else {
                        tr.state = 'TURNAROUND';
                    }
                } else {
                    tr.state = 'DRIVING';
                }
            }
        } else if (tr.state === 'TURNAROUND') {
            // Change direction WITHOUT teleporting — like a driver changing cabs at a terminus.
            // The train stays at its current physical position on the track but now faces the opposite way.
            // Find the segment the train's head is currently on
            let headSegIdx = -1;
            for (let i = 0; i < tr.history.length; i++) {
                let h = tr.history[i];
                if (tr.headDist >= h.startDist && tr.headDist <= h.endDist) {
                    headSegIdx = i;
                    break;
                }
            }
            if (headSegIdx < 0) headSegIdx = tr.history.length - 1;
            let headSeg = tr.history[headSegIdx];
            if (!headSeg || !headSeg.track) { tr.state = 'DESPAWNING'; return; }

            let track = headSeg.track;
            let sNodeId = window.nodes.find(n => Math.hypot(n.x - track.start.x, n.y - track.start.y) < 0.1)?.id;
            let wasForward = (headSeg.fromNode === sNodeId);

            // Check one-way restriction: can we travel in the reverse direction?
            if (wasForward && track.oneWay === 1) { tr.state = 'DESPAWNING'; return; }
            if (!wasForward && track.oneWay === -1) { tr.state = 'DESPAWNING'; return; }

            // Compute position on track in reverse direction
            let localDist = tr.headDist - headSeg.startDist;
            let reverseLocalDist = track.length - localDist;

            // Build new minimal history: current segment reversed
            tr.history = [{
                track: track,
                fromNode: headSeg.toNode,
                toNode: headSeg.fromNode,
                startDist: 0,
                endDist: track.length
            }];

            // Train stays at same physical position, now facing opposite direction
            tr.headDist = reverseLocalDist;

            // Switch direction phase and reset station index
            tr.dirPhase = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';
            tr.nextStationIdx = 0;
            tr.state = 'DRIVING';
            tr.speed = 0;
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