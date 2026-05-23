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
        // Build display name: prefer platformNumber + stationName from any matching boundary
        let displayName = '';
        if (window.platformBoundaries && st.trackIds) {
            let sortedIds = [...st.trackIds].sort().join(',');
            let bnd = window.platformBoundaries.find(b => b.pathId === sortedIds);
            if (bnd && (bnd.platformNumber || bnd.stationName)) {
                let parts = [];
                if (bnd.platformNumber) parts.push('Plat ' + bnd.platformNumber);
                if (bnd.stationName) parts.push(bnd.stationName);
                displayName = parts.join(' – ');
            }
        }
        if (!displayName) displayName = st.sec ? 'Main+Sec' : 'Platform (' + count + 't)';
        li.innerHTML = `
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${displayName}</span>
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




// =============================================================================
// PHYSICS-ACCURATE GHOST TRAIN SIMULATION
//
// Simulates a train running the full line at a fixed timestep using the same
// acceleration / braking physics as real trains, including:
//   - Acceleration to speed limit
//   - Look-ahead braking for stations (exact kinematic braking curve)
//   - Dwell time at each station
//
// Returns total elapsed seconds for one full one-way trip.
// Used by calculateLinePathsAndSchedule to get accurate roundTripTime.
// =============================================================================
window.simulateLineTripTime = function (line, dir, depotRef) {
    let g = window.buildGraph();
    let st = line[dir].stations;
    if (!st || st.length < 1) return 0;

    // Gather train physics from depot (or use defaults)
    let depot = depotRef || window.depots.find(d => !d.line || d.line.includes(line.name) || d.line === '');
    let maxSpeedMs = ((depot && depot.maxSpeed) || 80) / 3.6;
    let accel = (depot && depot.accel) || 1.0;
    let brake = (depot && depot.brake) || 1.0;
    let carriages = (depot && depot.carriages) || 4;
    let trainLen = carriages * 25 + Math.max(0, carriages - 1);

    // Build a flat list of track segments for the whole trip (like a real train history)
    // Walk the graph from station 0 → station 1 → ... → station N-1
    let segments = []; // [{track, speedLimitMs}]
    let currNode = null;
    // Find a starting node adjacent to station 0
    for (let [nid, edges] of g.entries()) {
        if (edges.some(e => st[0].trackIds.includes(e.trackId.toString()))) { currNode = nid; break; }
    }
    if (!currNode) return 0;

    let prevTrack = null;
    for (let i = 0; i < st.length - 1; i++) {
        let sanity = 0;
        while (sanity++ < 300) {
            let step = window.findNextTrack(g, currNode, st[i + 1].trackIds, prevTrack);
            if (!step) break;
            let t = window.tracks.find(x => x.id === step.trackId);
            if (!t) break;
            let spd = t.speedLimit ? t.speedLimit / 3.6 : maxSpeedMs;
            segments.push({ track: t, speedLimitMs: Math.min(spd, maxSpeedMs) });
            prevTrack = step.trackId;
            currNode = step.to;
            if (st[i + 1].trackIds.includes(step.trackId.toString())) break;
        }
    }

    if (segments.length === 0) return 0;

    // Build cumulative distance markers so we can locate stations
    let cumDist = 0;
    let segRanges = segments.map(s => {
        let start = cumDist;
        cumDist += s.track.length;
        return { start, end: cumDist };
    });
    let totalDist = cumDist;

    // Locate stop positions (centre of each station track in journey coords)
    // For each station (except the first which we start at), find where it appears in segments
    let stopPositions = []; // journey-distance of each stop point
    for (let i = 1; i < st.length; i++) {
        let tIds = st[i].trackIds.map(String);
        let platSegs = segments
            .map((s, idx) => ({ s, idx, r: segRanges[idx] }))
            .filter(x => tIds.includes(x.s.track.id.toString()));
        if (platSegs.length === 0) continue;
        let entryDist = platSegs[0].r.start;
        let platLen = tIds.reduce((acc, tid) => {
            let t = window.tracks.find(x => x.id.toString() === tid);
            return acc + (t ? t.length : 0);
        }, 0);
        // Stop head at centre + half trainLen, clamped
        let stopHd = entryDist + platLen / 2 + trainLen / 2;
        stopHd = Math.max(entryDist + 1, Math.min(entryDist + platLen, stopHd));
        stopPositions.push({ dist: stopHd, dwell: st[i].dwell || 30 });
    }

    // --- Physics simulation ---
    // DT chosen small enough for accuracy but large enough to run fast
    const DT = 0.5; // seconds per step
    let pos = 0;    // headDist
    let speed = 0;
    let time = 0;
    let stopIdx = 0;
    let dwelling = 0; // dwell countdown

    const brakeDist = (v, b) => (v * v) / (2 * b);

    let maxSteps = Math.ceil(totalDist / (maxSpeedMs * DT)) * 4 + 10000;
    for (let step = 0; step < maxSteps; step++) {
        // Handle dwell
        if (dwelling > 0) {
            dwelling -= DT;
            time += DT;
            if (dwelling <= 0) {
                dwelling = 0;
                stopIdx++;
            }
            continue;
        }

        // Done when past last stop or end of track
        if (pos >= totalDist || stopIdx >= stopPositions.length) {
            // Advance remaining distance at current speed (tail of last segment)
            break;
        }

        // Find current segment speed limit
        let segIdx = segRanges.findIndex(r => pos >= r.start && pos < r.end);
        if (segIdx < 0) segIdx = segments.length - 1;
        let segLimitMs = segments[segIdx] ? segments[segIdx].speedLimitMs : maxSpeedMs;

        // Look-ahead speed limit: find the tightest limit we must reach at upcoming segment boundaries
        let effectiveCap = segLimitMs;
        for (let si = segIdx + 1; si < segments.length; si++) {
            let distToSeg = segRanges[si].start - pos;
            let lim = segments[si].speedLimitMs;
            if (lim >= effectiveCap) continue;
            let maxNow = Math.sqrt(lim * lim + 2 * brake * distToSeg);
            if (maxNow < effectiveCap) effectiveCap = maxNow;
        }

        // Braking curve for next station stop
        let nextStop = stopPositions[stopIdx];
        let distToStop = nextStop.dist - pos;
        let idealStopSpeed = distToStop > 0 ? Math.sqrt(2 * brake * distToStop) : 0;
        effectiveCap = Math.min(effectiveCap, idealStopSpeed);

        // Accelerate or brake
        if (speed < effectiveCap - 0.05) {
            speed += accel * DT;
            if (speed > effectiveCap) speed = effectiveCap;
        } else if (speed > effectiveCap + 0.05) {
            speed -= brake * DT;
            if (speed < 0) speed = 0;
        } else {
            speed = effectiveCap;
        }

        let move = speed * DT;
        // Don't overshoot stop point
        if (distToStop <= move && distToStop >= 0) {
            time += distToStop / Math.max(speed, 0.01);
            pos = nextStop.dist;
            speed = 0;
            dwelling = nextStop.dwell;
            continue;
        }

        pos += move;
        time += DT;
    }

    return time;
};

window.calculateLinePathsAndSchedule = function (line) {
    // Reset pre-sim calibration so the fast ghost run re-fires on next spawn cycle
    line._tripTimeCalibrated = false;
    let g = window.buildGraph();
    let bufferMult = 1 / (1 - (line.buffer || 5) / 100);

    // Find a depot that serves this line for physics parameters
    let depot = window.depots.find(d => !d.line || d.line.includes(line.name) || d.line === '');

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

    // Override tripDuration with physics-accurate ghost train simulation.
    // This replaces the naive distance/speed_limit estimate with actual
    // accel/brake time, speed limit transitions, and dwell time included.
    for (let dir of ['inbound', 'outbound']) {
        if ((line[dir].stations || []).length > 0) {
            let physTime = window.simulateLineTripTime(line, dir, depot);
            if (physTime > 0) {
                // Apply the user's buffer on top of physics sim time
                line[dir].tripDuration = physTime * bufferMult;
            }
        }
    }

    // Round trip = both legs + a small turnaround buffer at each terminal (30s each)
    line.roundTripTime = (line.inbound.tripDuration || 0) + (line.outbound.tripDuration || 0) + 60;
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
    for (let i = 0; i < history.length; i++) {
        let h = history[i];
        let isLast = (i === history.length - 1);
        if (distFromTail >= h.startDist && (isLast ? distFromTail <= h.endDist : distFromTail < h.endDist)) {
            seg = h; break;
        }
    }
    if (!seg) {
        seg = distFromTail < history[0].startDist ? history[0] : history[history.length - 1];
    }
    if (!seg || !seg.track) return null;

    let localDist = Math.max(0, Math.min(seg.track.length, distFromTail - seg.startDist));

    // Determine direction using fromNode stored in history, matched against the track's
    // physical start endpoint via the nodePositions map (built every graph rebuild).
    // Use 2m tolerance (same as POS_SNAP) to handle floating-point drift.
    let isForward = true; // safe default
    if (seg.fromNode !== undefined && seg.track.start) {
        let fromPos = (window._nodePositions && window._nodePositions.get(String(seg.fromNode)))
            || (window.nodes && window.nodes.find(n => n.id.toString() === String(seg.fromNode)));
        if (fromPos) {
            let dFromStart = Math.hypot(fromPos.x - seg.track.start.x, fromPos.y - seg.track.start.y);
            let dFromEnd = Math.hypot(fromPos.x - seg.track.end.x, fromPos.y - seg.track.end.y);
            isForward = dFromStart <= dFromEnd;
        } else {
            // fromNode not in nodePositions — scan window.nodes with 2m snap
            let found = window.nodes && window.nodes.find(
                n => Math.hypot(n.x - seg.track.start.x, n.y - seg.track.start.y) < 2.0
            );
            if (found) isForward = (String(seg.fromNode) === String(found.id));
        }
    }

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
// SECONDARY PLATFORM SELECTION
// When a station has a secondary platform (st.sec) and the main platform
// tracks are occupied by a stopped/dwelling train, the arriving train should
// route to the secondary instead.
//
// "Occupied" here means: a DWELLING or REVERSING_TO_STOP train whose history
// overlaps one of the main platform tracks.  Moving trains on the same track
// are fine — we only divert to avoid stopping behind a standing train.
// =============================================================================
window.selectActiveStation = function (station) {
    // No secondary defined — always use main
    if (!station || !station.sec || station.sec.length === 0) return station;

    let mainIds = station.trackIds.map(String);
    let secIds = station.sec.map(String);

    // Check if any train is currently DWELLING or REVERSING on the main platform
    let mainBlocked = window.trains.some(tr => {
        if (tr.state !== 'DWELLING' && tr.state !== 'REVERSING_TO_STOP') return false;
        return tr.history && tr.history.some(h =>
            h.track && mainIds.includes(h.track.id.toString()) &&
            h.endDist > (tr.headDist - tr.trainLength) && h.startDist < tr.headDist
        );
    });

    if (!mainBlocked) return station; // main free — use it

    // Main is blocked; return a synthetic station pointing to secondary tracks
    return { trackIds: secIds, dwell: station.dwell, sec: null };
};

window.isDepotTrackOccupied = function (depTrack) {
    let tid = depTrack.id.toString();
    return window.trains.some(tr => {
        if (!tr.history) return false;
        let tailDist = tr.headDist - tr.trainLength;
        return tr.history.some(h =>
            h.track && h.track.id.toString() === tid &&
            h.endDist > tailDist && h.startDist < tr.headDist
        );
    });
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
    // Clamp tailDist so it never goes before what history covers
    let tailDist = train.headDist - train.trainLength;
    if (train.history.length > 0) {
        tailDist = Math.max(tailDist, train.history[0].startDist);
    }

    // Collect ALL segments the train body touches (head..tail), sorted earliest first.
    // Use a slightly wider window (±1m) to avoid off-by-one at segment boundaries.
    let occupied = train.history
        .filter(h => h.track && h.endDist > tailDist - 1 && h.startDist < train.headDist + 1)
        .sort((a, b) => a.startDist - b.startDist);

    // Need at least one valid segment
    occupied = occupied.filter(h => h && h.track);
    if (occupied.length === 0) {
        // Try to salvage: use the current segment
        let cur = train.history[train.history.length - 1];
        if (cur && cur.track) {
            occupied = [cur];
        } else {
            train.state = 'DESPAWNING';
            return false;
        }
    }

    let blockStart = occupied[0].startDist;
    // How far the old tail was from the block start (clamped ≥ 0)
    let tailOffsetFromBlockStart = Math.max(0, tailDist - blockStart);

    // Rebuild reversed: last occupied segment first, swap fromNode/toNode
    let reversed = [];
    let cum = 0;
    for (let i = occupied.length - 1; i >= 0; i--) {
        let h = occupied[i];
        reversed.push({
            track: h.track,
            fromNode: h.toNode,
            toNode: h.fromNode,
            startDist: cum,
            endDist: cum + h.track.length
        });
        cum += h.track.length;
    }

    if (reversed.length === 0 || cum < 0.1) {
        // Safety: just reverse the last segment
        let last = train.history[train.history.length - 1];
        if (!last || !last.track) { train.state = 'DESPAWNING'; return false; }
        reversed = [{ track: last.track, fromNode: last.toNode, toNode: last.fromNode, startDist: 0, endDist: last.track.length }];
        cum = last.track.length;
        tailOffsetFromBlockStart = 0;
    }

    train.history = reversed;

    // New headDist: in reversed coords, old tail position = cum - tailOffsetFromBlockStart
    let newHeadDist = cum - tailOffsetFromBlockStart;
    // Ensure head is inside history range and has at least trainLength behind it
    newHeadDist = Math.max(train.trainLength * 0.1, Math.min(cum, newHeadDist));
    train.headDist = newHeadDist;

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
                            // Use all depots that serve this line
                            let lineDepots = window.depots.filter(d => d.line && d.line.includes(l.name));
                            if (lineDepots.length > 0 && l[dir].stations.length > 0) {
                                let spawned = false;
                                for (let depot of lineDepots) {
                                    let train = window.spawnTrainOnLine(l, dir, depot, g);
                                    if (train) { window.trains.push(train); spawned = true; break; }
                                }
                            }
                            dep.spawned = true;
                        }
                        if (window.sim.time < 100) dep.spawned = false;
                    });
                });
            } else {
                // === NEW FLEET COUNT SYSTEM ===
                let targetCount = window.getTargetFleetSize(l, window.sim.time);

                // ── FAST PRE-SIMULATION (runs once before first train spawns) ──
                // When going from 0 → 1+ trains, run a physics-accurate ghost
                // simulation at maximum speed to get the real round-trip time
                // (including accel, brake, dwell, speed limits) BEFORE any trains
                // appear. This means trains spawn already knowing accurate trip
                // times, so they start at full speed and only regulate by actual
                // time-gap to the train ahead — not by slot-position guesswork.
                if (targetCount > 0 && !l._tripTimeCalibrated) {
                    let lineDepots = window.depots.filter(d => !d.line || d.line.includes(l.name) || d.line === '');
                    let depot = lineDepots[0] || null;
                    let inPhys = 0, outPhys = 0;
                    if ((l.inbound.stations || []).length > 0) {
                        inPhys = window.simulateLineTripTime(l, 'inbound', depot);
                    }
                    if ((l.outbound.stations || []).length > 0) {
                        outPhys = window.simulateLineTripTime(l, 'outbound', depot);
                    }
                    let bufferMult = 1 / (1 - (l.buffer || 5) / 100);
                    if (inPhys > 0) l.inbound.tripDuration = inPhys * bufferMult;
                    if (outPhys > 0) l.outbound.tripDuration = outPhys * bufferMult;
                    l.roundTripTime = (l.inbound.tripDuration || 0) + (l.outbound.tripDuration || 0) + 60;
                    l._tripTimeCalibrated = true;
                }

                // Count active trains (not returning to depot) on this line
                let totalActive = window.trains.filter(tr => tr.lineId === l.id && !tr.returningToDepot).length;

                // Collect all depots that serve this line
                let lineDepots = window.depots.filter(d => !d.line || d.line.includes(l.name) || d.line === '');

                if (totalActive < targetCount) {
                    let needed = targetCount - totalActive;
                    let hasBothDirs = l.inbound.stations.length > 0 && l.outbound.stations.length > 0;

                    let inDuration = l.inbound.tripDuration || 0;
                    let outDuration = l.outbound.tripDuration || 0;
                    let roundTrip = (l.roundTripTime > 0 ? l.roundTripTime : inDuration + outDuration) || 1;

                    // Distance estimates for advancing trains to their slot position
                    let inTripDist = l.inbound.stations.length > 0 ? window.estimateLineTripDistance(l, 'inbound') : 0;
                    let outTripDist = l.outbound.stations.length > 0 ? window.estimateLineTripDistance(l, 'outbound') : 0;

                    // Build the full ideal slot list for targetCount trains so we can
                    // assign directions properly via interleaving.
                    // For a line with both directions, alternate inbound/outbound slots
                    // evenly: slot 0 = in, slot 1 = out, slot 2 = in, etc.
                    // Each direction's trains are spread evenly within that direction's
                    // share of the round trip.
                    // For one-direction lines, all slots go to that direction.
                    function slotDir(idx, total) {
                        if (!hasBothDirs) return l.inbound.stations.length > 0 ? 'inbound' : 'outbound';
                        return idx % 2 === 0 ? 'inbound' : 'outbound';
                    }
                    function slotTimeOffset(idx, total) {
                        // Each direction gets ceil(total/2) or floor(total/2) slots.
                        // Within a direction, spread evenly across roundTrip.
                        if (!hasBothDirs) return (idx / total) * roundTrip;
                        let dir = slotDir(idx, total);
                        // Rank of this slot within its direction (0, 1, 2...)
                        let rank = Math.floor(idx / 2);
                        let totalInDir = dir === 'inbound' ? Math.ceil(total / 2) : Math.floor(total / 2);
                        if (totalInDir === 0) totalInDir = 1;
                        let fracInDir = rank / totalInDir; // 0..1 position within that direction
                        if (dir === 'inbound') return fracInDir * inDuration;
                        else return inDuration + fracInDir * outDuration;
                    }

                    let spawnedCount = 0;
                    for (let i = 0; i < needed; i++) {
                        let slotIndex = totalActive + i;
                        let dir = slotDir(slotIndex, targetCount);
                        let timeOffset = slotTimeOffset(slotIndex, targetCount);

                        if (l[dir].stations.length === 0) continue;

                        // Time-into-direction for advance positioning
                        let timeIntoDir = dir === 'inbound' ? timeOffset : timeOffset - inDuration;
                        let dirDuration = dir === 'inbound' ? inDuration : outDuration;
                        let dirDist = dir === 'inbound' ? inTripDist : outTripDist;
                        let advanceDist = (dirDuration > 0 && dirDist > 0)
                            ? (timeIntoDir / dirDuration) * dirDist
                            : 0;

                        // ── SPAWN DELAY ────────────────────────────────────────────────
                        // Check real time-gap between this slot's intended offset and every
                        // existing train's current journey position on the round trip.
                        // We estimate each existing train's position in round-trip-seconds
                        // by combining its dirPhase, estimated distance into that leg, and
                        // the leg durations — so this works even on freshly spawned trains
                        // whose _journeyTime may be seeded from a different reference.
                        {
                            let activeSameLine = window.trains.filter(t => t.lineId === l.id && !t.returningToDepot);
                            if (activeSameLine.length > 0) {
                                let idealGap = roundTrip / targetCount;
                                // Clamp newPos into [0, roundTrip)
                                let newPos = ((timeOffset % roundTrip) + roundTrip) % roundTrip;

                                let tooClose = activeSameLine.some(other => {
                                    // Estimate other train's position in round-trip-seconds.
                                    // Use _journeyTime if available (accumulated since spawn),
                                    // but seed it relative to the slot offset at spawn time.
                                    let otherPos = ((other._journeyTime || 0) % roundTrip + roundTrip) % roundTrip;
                                    let gap = Math.min(
                                        (otherPos - newPos + roundTrip) % roundTrip,
                                        (newPos - otherPos + roundTrip) % roundTrip
                                    );
                                    return gap < idealGap * 0.5;
                                });
                                if (tooClose) continue; // retry next tick
                            }
                        }

                        // Try each depot in turn
                        let train = null;
                        for (let depot of lineDepots) {
                            train = window.spawnTrainOnLine(l, dir, depot);
                            if (train) break;
                        }
                        if (!train) continue; // depot tracks all occupied

                        // Record which slot this train occupies so it can regulate speed
                        train._slotIndex = slotIndex;
                        train._slotTotal = targetCount;
                        train._roundTripTime = roundTrip;
                        // Seed journey time to match the slot's ideal time offset
                        // so headway regulation is correct from the very first tick
                        train._journeyTime = timeOffset;

                        // Advance train along the line to the pre-computed slot position
                        if (advanceDist > 10 && dirDist > 0) {
                            window.advanceTrainPosition(train, l, train.dirPhase, g, advanceDist);
                        }

                        // Physical proximity check: if advance failed (train still at depot)
                        // and another train is also near the depot, defer spawn.
                        {
                            let headPt = window.getPointOnHistory(train.history, train.headDist);
                            if (headPt) {
                                let physTooClose = window.trains.some(other => {
                                    if (other.lineId !== l.id || other.returningToDepot) return false;
                                    let otherPt = window.getPointOnHistory(other.history, other.headDist);
                                    if (!otherPt) return false;
                                    let d = Math.hypot(headPt.x - otherPt.x, headPt.y - otherPt.y);
                                    return d < train.trainLength * 1.5;
                                });
                                if (physTooClose) continue; // defer to next tick
                            }
                        }

                        window.trains.push(train);
                        spawnedCount++;
                    }

                } else if (totalActive > targetCount) {
                    // Mark excess trains to return to depot
                    let excess = totalActive - targetCount;
                    let active = window.trains.filter(tr => tr.lineId === l.id && !tr.returningToDepot);
                    for (let i = 0; i < excess && i < active.length; i++) {
                        active[active.length - 1 - i].returningToDepot = true;
                    }
                }

                // Keep slot metadata up to date whenever fleet size changes
                let allActive = window.trains.filter(tr => tr.lineId === l.id && !tr.returningToDepot);
                allActive.forEach((tr, idx) => {
                    tr._slotIndex = idx;
                    tr._slotTotal = allActive.length;
                    tr._roundTripTime = l.roundTripTime || 1;
                });
            }
        });
    }

    // --- PHYSICS LOOP ---
    // Use fixed sub-steps to avoid huge single-tick jumps at high sim speeds.
    // Each sub-step is at most MAX_SUBSTEP_SEC of sim-time, so physics stays accurate.
    // This also prevents the requestAnimationFrame [Violation] by keeping each frame's
    // total sim work bounded regardless of sim speed.
    const MAX_SUBSTEP_SEC = 0.25; // max sim-time per physics sub-step
    // Cap total sim-time per frame to avoid [Violation] warnings.
    // At 300x speed, a 16ms frame = 4.8 sim-seconds. With 0.25s sub-steps that's 19 iterations.
    // Cap wall-clock work to ~33ms equivalent: real_dt=33ms → max 33ms * speed of sim work.
    // This means at 300x, we do at most ~10 sub-steps of 0.25s = 2.5 sim-seconds per frame.
    // Trains will run slightly slower than real 300x but won't freeze the browser.
    let totalSimDt = Math.min((dt / 1000) * window.sim.speed, MAX_SUBSTEP_SEC * 10); // at most 10 sub-steps per frame
    let remainingSim = totalSimDt;

    // Run physics in sub-steps; build graph once per frame (not per sub-step)
    while (remainingSim > 0) {
        let dtSec = Math.min(remainingSim, MAX_SUBSTEP_SEC);
        remainingSim -= dtSec;

        window.trains.forEach(tr => {
            let lObj = window.sim.lines.find(x => x.id === tr.lineId);
            if (!lObj) { tr.state = 'DESPAWNING'; return; }

            if (!tr.history || tr.history.length === 0) {
                // Don't immediately despawn - could be transient during cleanup. Log and skip.
                console.warn('[SIM] Train', tr.id, 'has empty history, skipping tick');
                return;
            }
            // Remove null/trackless segments from history tail (can appear after filter operations)
            while (tr.history.length > 1 && (!tr.history[tr.history.length - 1] || !tr.history[tr.history.length - 1].track)) {
                tr.history.pop();
            }
            if (!tr.history[tr.history.length - 1] || !tr.history[tr.history.length - 1].track) {
                tr.state = 'DESPAWNING'; return;
            }

            if (tr.state === 'DRIVING' || tr.state === 'BRAKING') {
                // Tick turnaround cooldown (time-based so it works correctly at all sim speeds)
                if (tr._turnaroundCooldown > 0) tr._turnaroundCooldown -= dtSec;
                // Accumulate journey time for headway regulation (driving portion)
                if (tr._slotTotal > 1) tr._journeyTime = (tr._journeyTime || 0) + dtSec;

                // Clear post-reversal flag once the train head moves onto a track that
                // is not part of any turnaround area, meaning it has successfully departed.
                if (tr._justReversed) {
                    let headSeg0 = tr.history.find(h => h.startDist <= tr.headDist && h.endDist >= tr.headDist);
                    if (!headSeg0) headSeg0 = tr.history[tr.history.length - 1];
                    let taIds = new Set((window.turnaroundAreas || []).flatMap(a => a.trackIds.map(String)));
                    if (headSeg0 && headSeg0.track && !taIds.has(String(headSeg0.track.id))) {
                        tr._justReversed = false;
                    }
                }

                let stations = lObj[tr.dirPhase].stations;
                let targetStation = window.getTargetStation(tr, lObj);
                let currentSeg = tr.history[tr.history.length - 1];

                if (!currentSeg || !currentSeg.track) { tr.state = 'DESPAWNING'; return; }

                // --- LOOK-AHEAD: extend history toward next station (or turnaround area) ---
                // Loop to handle high simulation speeds where the head can outrun a single
                // extension call. Keep extending until lookahead is satisfied or no progress.
                tr._needsTurnaround = false;
                let _extLoops = 0;
                let _prevHistLen = -1;
                while (_extLoops++ < 20 && !tr._turnaroundTarget && !tr._needsTurnaround) {
                    let _beforeLen = tr.history.length;
                    let _lastH = tr.history[tr.history.length - 1];
                    let _lookaheadOk = _lastH && (_lastH.endDist - tr.headDist > ROUTE_LOOKAHEAD);
                    if (_lookaheadOk) break;
                    window.extendTrainHistory(tr, g, targetStation);
                    // Stop if no new segments were added (prevents infinite loop on dead-end)
                    if (tr.history.length === _beforeLen) break;
                }

                // If extendTrainHistory found a turnaround area, switch to approach mode.
                // Exception: if the TA tracks overlap with the current target platform,
                // the train should brake to stop at the platform normally and do the
                // reversal during dwell — not bypass the dwell to approach the TA.
                if (tr._turnaroundTarget && tr.state !== 'TURNAROUND_APPROACH') {
                    let taIds = tr._turnaroundTarget.trackIds.map(String);
                    let platOverlap = targetStation && targetStation.trackIds.some(id => taIds.includes(String(id)));
                    if (platOverlap) {
                        // Platform IS the TA — clear the TA flag, let the train dwell normally.
                        // The DWELLING exit block will detect the overlap and perform turnaround there.
                        tr._turnaroundTarget = null;
                        tr._needsTurnaround = false;
                    } else {
                        // For in-place turnarounds (approachPath empty), trim lookahead history
                        // so _extendTowardTurnaround sees the area track as the last segment.
                        if (tr._turnaroundTarget.approachPath && tr._turnaroundTarget.approachPath.length === 0) {
                            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                        }
                        tr.state = 'TURNAROUND_APPROACH';
                        return;
                    }
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
                    // Clean up history tail so train doesn't despawn
                    while (tr.history.length > 2 && tr.headDist - tr.trainLength > tr.history[1].endDist) {
                        tr.history.shift();
                    }
                    return;
                }

                // --- COMPUTE DISTANCE TO STOP ---
                let distToStop = window.computeDistToStop(tr, targetStation, tr.history);

                // --- SPEED LIMIT ON CURRENT SEGMENT (segment the HEAD is actually on) ---
                let trMaxSpeedMs = tr.maxSpeed / 3.6;

                // Find the history segment that contains headDist (not the look-ahead tail)
                let headSeg = null;
                for (let i = 0; i < tr.history.length; i++) {
                    let h = tr.history[i];
                    let isLast = (i === tr.history.length - 1);
                    if (tr.headDist >= h.startDist && (isLast ? tr.headDist <= h.endDist : tr.headDist < h.endDist)) {
                        headSeg = h;
                        break;
                    }
                }
                if (!headSeg) headSeg = currentSeg; // fallback

                let headSegLimitMs = headSeg.track.speedLimit ? headSeg.track.speedLimit / 3.6 : trMaxSpeedMs;
                let speedCap = Math.min(trMaxSpeedMs, headSegLimitMs);

                // ---------------------------------------------------------------
                // HEADWAY REGULATION (time-gap based)
                //
                // Look at the train AHEAD of us on the line. Measure the real-time
                // gap between this train's departure time and the preceding train's.
                // If we are running AHEAD of our target gap → slow down.
                // We only do this when well clear of a station braking zone.
                //
                // Gap is measured in sim-time seconds, not position.
                // This means trains that are all early/all late don't affect each other —
                // only bunching (one train catching another) is corrected.
                // ---------------------------------------------------------------
                let withinBrakingZone = distToStop !== Infinity &&
                    distToStop < (tr.speed * tr.speed) / (2 * tr.brake) * 2.5 + 50;

                if (!withinBrakingZone && tr._slotTotal > 1 && tr._roundTripTime > 0) {
                    // Find the train immediately AHEAD of us on this line
                    // "Ahead" = the train with the closest _journeyTime that is greater than ours
                    // (wrapping around the round trip cycle).
                    let myTime = tr._journeyTime || 0;
                    let targetGap = tr._roundTripTime / tr._slotTotal; // ideal gap between trains

                    let minGapAhead = Infinity;
                    window.trains.forEach(other => {
                        if (other.id === tr.id || other.lineId !== tr.lineId || other.returningToDepot) return;
                        let otherTime = other._journeyTime || 0;
                        // Gap from us to train ahead (modular arithmetic)
                        let gap = ((otherTime - myTime) % tr._roundTripTime + tr._roundTripTime) % tr._roundTripTime;
                        if (gap > 0 && gap < minGapAhead) minGapAhead = gap;
                    });

                    if (minGapAhead < Infinity) {
                        // How much are we closing in? (gap < targetGap means we're too close)
                        let excessCloseness = targetGap - minGapAhead; // positive = we're too close
                        if (excessCloseness > 0 && targetGap > 0) {
                            let aheadFraction = Math.min(excessCloseness / targetGap, 1.0);
                            const REGULATION_STRENGTH = 0.55;
                            const MIN_FACTOR = 0.35;
                            let factor = 1.0 - aheadFraction * REGULATION_STRENGTH;
                            factor = Math.max(factor, MIN_FACTOR);
                            speedCap *= factor;
                        }
                    }
                }

                // ---------------------------------------------------------------
                // LOOK-AHEAD SPEED LIMIT ENFORCEMENT
                //
                // For each upcoming segment with a lower speed limit, compute the
                // maximum speed we can be travelling RIGHT NOW and still brake to
                // that limit exactly at the segment boundary.
                //
                // Kinematic: v_now_max = sqrt(v_limit² + 2 * brake * dist_to_boundary)
                //
                // This ensures we start braking at exactly the right moment —
                // not too early, not too late.
                // ---------------------------------------------------------------
                for (let h of tr.history) {
                    if (h.startDist <= tr.headDist) continue; // behind or at head
                    let distToSegStart = h.startDist - tr.headDist;
                    let hLimitMs = h.track.speedLimit ? h.track.speedLimit / 3.6 : trMaxSpeedMs;
                    if (hLimitMs >= speedCap) continue; // not a restriction
                    // Max speed now so we can reach hLimitMs exactly at segment entry
                    let maxNow = Math.sqrt(hLimitMs * hLimitMs + 2 * tr.brake * distToSegStart);
                    if (maxNow < speedCap) speedCap = maxNow;
                }

                // ---------------------------------------------------------------
                // KINEMATIC ADAPTIVE BRAKING FOR STATION STOP
                //
                // Target speed on the ideal braking curve at distance distToStop:
                //   v_ideal = sqrt(2 * brake * distToStop)
                //
                // If the train is faster than v_ideal → decelerate.
                // If the train is slower than v_ideal AND distToStop is still large
                //   → accelerate back toward v_ideal (capped by speedCap).
                //
                // This eliminates snapping and creeping: the train naturally glides
                // to a stop exactly at the platform using physics alone.
                // ---------------------------------------------------------------

                // distToStop > 0: still approaching; < 0: overshot; Inf: no stop yet
                let hasStop = distToStop !== Infinity;

                // Ideal speed on the braking curve at current distance.
                // Overshot (negative distToStop) => ideal = 0, train must stop then reverse.
                let idealStopSpeed = hasStop
                    ? Math.sqrt(2 * tr.brake * Math.max(distToStop, 0))
                    : Infinity;

                // Effective speed target: lower of track speed cap and braking curve
                let effectiveTarget = Math.min(speedCap, idealStopSpeed);

                // Required decel to reach stop from current speed
                let requiredDecel = hasStop && distToStop > 0.1
                    ? (tr.speed * tr.speed) / (2 * Math.max(distToStop, 0.1))
                    : 0;

                // Decide braking state
                let brakeTriggerThreshold = tr.brake * 0.85;
                if (hasStop && distToStop >= 0 && requiredDecel >= brakeTriggerThreshold) {
                    tr.state = 'BRAKING';
                } else if (tr.state === 'BRAKING' && distToStop > brakingDist(tr.speed, tr.brake) + 15) {
                    tr.state = 'DRIVING';
                }

                // --- UNIFIED SPEED CONTROL (no snapping, no force-stops) ---
                if (tr.speed < effectiveTarget - 0.05) {
                    tr.speed += tr.accel * dtSec;
                    if (tr.speed > effectiveTarget) tr.speed = effectiveTarget;
                } else if (tr.speed > effectiveTarget + 0.05) {
                    let velError = tr.speed - effectiveTarget;
                    let demandedDecel = requiredDecel + velError * 1.5;
                    demandedDecel = Math.min(demandedDecel, tr.ebrake);
                    demandedDecel = Math.max(demandedDecel, tr.brake * 0.1);
                    tr.speed -= demandedDecel * dtSec;
                    if (tr.speed < 0) tr.speed = 0;
                } else {
                    tr.speed = Math.max(0, effectiveTarget);
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

                // --- ADVANCE POSITION (no cap — physics handles overshoot) ---
                tr.headDist += tr.speed * dtSec;

                // --- MEMORY CLEANUP ---
                // Keep at least one segment before the tail so getPointOnHistory always works
                while (tr.history.length > 2 && tr.headDist - tr.trainLength > tr.history[1].endDist) {
                    tr.history.shift();
                }

                // --- ARRIVED / OVERSHOT CHECK ---
                // No position teleport. Dwell when stopped within ±1 m of stop point.
                // If overshot by more than 1 m, switch to REVERSING_TO_STOP.
                if (targetStation) {
                    let stopHd = window.getPlatformStopHeadDist(tr, targetStation, tr.history);
                    if (stopHd !== null && tr.speed < 0.05) {
                        let err = tr.headDist - stopHd; // positive = overshot
                        if (Math.abs(err) <= 1.0) {
                            let platSegs = tr.history.filter(h => h.track && targetStation.trackIds.includes(h.track.id.toString()));
                            if (platSegs.length > 0) {
                                tr.speed = 0;
                                tr.state = 'DWELLING';
                                tr.dwellTimer = targetStation.dwell || 30;
                                // Arrival guard: only advance nextStationIdx once per stop
                                if (!tr._stationArrived) {
                                    tr._stationArrived = true;
                                    tr.nextStationIdx++;
                                }
                                tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                                tr._route = null; tr._routeKey = null; tr._pathCache = null;
                            }
                        } else if (err > 1.0) {
                            // Overshot — reverse back to stop point
                            tr._reverseToStop = { stopHd, targetStation };
                            tr.state = 'REVERSING_TO_STOP';
                        }
                        // Stopped short outside tolerance: braking curve re-accelerates next tick
                    }
                }

            } else if (tr.state === 'REVERSING_TO_STOP') {
                // Train overshot the platform stop point by > 1 m.
                // Reverse at low speed until within 1 m, then dwell.
                let rv = tr._reverseToStop;
                if (!rv) { tr.state = 'DRIVING'; }
                else {
                    let stopHd = window.getPlatformStopHeadDist(tr, rv.targetStation, tr.history);
                    if (stopHd === null) { tr.state = 'DRIVING'; }
                    else {
                        let err = tr.headDist - stopHd; // positive = still overshot
                        if (err <= 1.0) {
                            // Close enough — accept position as-is and dwell
                            tr._reverseToStop = null;
                            tr.speed = 0;
                            tr.state = 'DWELLING';
                            tr.dwellTimer = rv.targetStation.dwell || 30;
                            if (!tr._stationArrived) {
                                tr._stationArrived = true;
                                tr.nextStationIdx++;
                            }
                            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                            tr._route = null; tr._routeKey = null; tr._pathCache = null;
                        } else {
                            // Reverse speed: proportional up to a cap (~10 km/h), minimum creep
                            let reverseSpeed = Math.min(err * 0.5, 3.0); // m/s
                            reverseSpeed = Math.max(reverseSpeed, 0.3);
                            // Move backward (decrease headDist), never below history start
                            let _minHead = tr.history.length > 0 ? tr.history[0].startDist + tr.trainLength : 0;
                            tr.headDist = Math.max(tr.headDist - reverseSpeed * dtSec, _minHead);
                            tr.speed = 0; // reported speed shown as 0 while reversing
                        }
                    }
                }

            } else if (tr.state === 'DWELLING') {
                tr.dwellTimer -= dtSec;
                // Count dwell time toward journey time for headway regulation
                if (tr._slotTotal > 1) tr._journeyTime = (tr._journeyTime || 0) + dtSec;
                if (tr.dwellTimer <= 0) {
                    tr._stationArrived = false; // reset arrival guard for next stop
                    let stations = lObj[tr.dirPhase].stations;
                    if (tr.nextStationIdx >= stations.length) {
                        // ── Reached the terminal station ──────────────────────────
                        if (tr.returningToDepot) {
                            // Plan the return to depot from the train's CURRENT position
                            // (where it stopped at the last platform), NOT from any
                            // look-ahead segments pre-loaded by extendTrainHistory.
                            // Always trim look-ahead first so path planning starts clean.
                            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                            tr._route = null; tr._routeKey = null; tr._pathCache = null;

                            // Find the segment the head is actually on right now.
                            let _hdSeg = null;
                            for (let i = tr.history.length - 1; i >= 0; i--) {
                                if (tr.history[i].startDist <= tr.headDist) { _hdSeg = tr.history[i]; break; }
                            }
                            let _lastSeg = _hdSeg || tr.history[tr.history.length - 1];

                            // Find home depot tracks to check reachability.
                            let _homeDepot = window.depots.find(d => d.id === tr.depotId)
                                || window.depots.find(d => !d.line || (lObj && (d.line.includes(lObj.name) || d.line === '')));
                            let _depotIds = _homeDepot ? (_homeDepot.tracks || []).map(String) : [];

                            // ── Step 1: Can we reach the depot directly from here? ──
                            // Try with the incoming-track filter first (no U-turn on same track),
                            // then without (allow sharp turns). If either succeeds, no reversal needed.
                            let _depotReachable = false;
                            if (_lastSeg && _depotIds.length > 0) {
                                _depotReachable = !!(
                                    window.computeFullPath(g, _lastSeg.toNode, _depotIds, _lastSeg.track.id, false) ||
                                    window.computeFullPath(g, _lastSeg.toNode, _depotIds, _lastSeg.track.id, true) ||
                                    window.computeFullPath(g, _lastSeg.toNode, _depotIds, null, false) ||
                                    window.computeFullPath(g, _lastSeg.toNode, _depotIds, null, true)
                                );
                            }

                            if (_depotReachable) {
                                // Depot reachable from current heading — go directly, no turnaround.
                                tr.state = 'RETURNING_TO_DEPOT';
                                tr._depotReturnAttempts = 0;
                            } else {
                                // Depot NOT reachable from current heading — need to reverse first.
                                // Check if currently sitting on a turnaround area (reverse in-place).
                                let _curTids = tr.history
                                    .filter(h => h.track && h.startDist < tr.headDist && h.endDist > tr.headDist - tr.trainLength)
                                    .map(h => h.track.id.toString());
                                let _inPlaceTA = (window.turnaroundAreas || []).find(a =>
                                    a.trackIds.some(tid => _curTids.includes(String(tid)))
                                );
                                if (_inPlaceTA) {
                                    // Already on the turnaround area — reverse in-place during dwell.
                                    tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                                    let _okTA = window.performTurnaround(tr);
                                    if (!_okTA) { tr.state = 'DESPAWNING'; return; }
                                    tr._turnaroundTarget = null;
                                    tr._terminalTurnaround = false;
                                    tr._resumeDepotReturn = false;
                                    tr._route = null; tr._routeKey = null; tr._pathCache = null;
                                    tr._noPathLogged = false; tr._needsTurnaround = false;
                                    tr._justReversed = true;
                                    tr._turnaroundCooldown = 3.0;
                                    tr.speed = 0;
                                    tr.state = 'RETURNING_TO_DEPOT';
                                    tr._depotReturnAttempts = 0;
                                } else {
                                    // Drive forward into a turnaround area, then reverse.
                                    let _fwdTA = _lastSeg
                                        ? window.findTurnaroundArea(g, _lastSeg.toNode, _lastSeg.track.id, tr.trainLength)
                                        : null;
                                    if (_fwdTA) {
                                        tr._turnaroundTarget = _fwdTA;
                                        tr._terminalTurnaround = false;
                                        tr._resumeDepotReturn = true;
                                        tr.state = 'TURNAROUND_APPROACH';
                                    } else {
                                        // No turnaround area found — go to RETURNING_TO_DEPOT anyway;
                                        // _extendTowardDepot will handle re-traversal or get stuck.
                                        tr.state = 'RETURNING_TO_DEPOT';
                                        tr._depotReturnAttempts = 0;
                                    }
                                }
                            }
                        } else {
                            let newDir = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';
                            let newStations = lObj[newDir].stations;

                            if (!newStations || newStations.length === 0) {
                                // No return route defined — just flip phase and restart
                                tr.dirPhase = newDir;
                                tr.nextStationIdx = 0;
                                tr._route = null; tr._routeKey = null; tr._pathCache = null;
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

                                // Find the history segment that actually contains the head
                                // (not the last look-ahead seg, which may be far ahead).
                                let headContainingSeg = null;
                                for (let i = tr.history.length - 1; i >= 0; i--) {
                                    let h = tr.history[i];
                                    if (h.startDist <= tr.headDist) { headContainingSeg = h; break; }
                                }
                                let lastSeg = headContainingSeg || tr.history[tr.history.length - 1];
                                let newFirstTids = newStations[0].trackIds.map(String);

                                // Collect all platform track ids the train is currently on
                                let curPlatTids = stations[stations.length - 1]
                                    ? stations[stations.length - 1].trackIds.map(String)
                                    : [];

                                // Is the current terminal platform the same as the new
                                // direction's first platform?  (shared terminus)
                                let sharedTerminus = newFirstTids.some(id => curPlatTids.includes(id));

                                // Can the train reach newStations[0] from its current
                                // exit node WITHOUT a U-turn, sharp turn, OR traversal
                                // through a player-defined turnaround area?
                                let forwardReachable = false;
                                let tAreaIds = new Set(
                                    (window.turnaroundAreas || []).flatMap(a => a.trackIds.map(String))
                                );

                                if (lastSeg) {
                                    let exitNode = lastSeg.toNode;
                                    let incomingTid = lastSeg.track.id;
                                    let fwdPath = window.computeFullPath(g, exitNode, newFirstTids, incomingTid, false);
                                    if (fwdPath) {
                                        let usesTA = fwdPath.some(step => tAreaIds.has(String(step.trackId)));
                                        if (!usesTA) forwardReachable = true;
                                    }
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
                                    // Short cooldown so the departure node isn't treated as a same-track U-turn.
                                    // We do NOT set allowSharpTurns via cooldown here — that causes impossible
                                    // sharp turns.  Instead we only suppress the incoming-track check.
                                    tr._turnaroundCooldown = 3.0;
                                    tr.state = 'DRIVING';
                                } else {
                                    // Physical reversal needed at terminal.
                                    //
                                    // Case 1 — IN-PLATFORM TURNAROUND:
                                    // The train may already be sitting on a turnaround area
                                    // (e.g. the terminal platform track IS a designated
                                    // turnaround stub).  In that case there is nothing to
                                    // approach — skip straight to TURNAROUND_WAIT so the
                                    // train reverses in place without trying to drive into
                                    // an area it is already occupying.
                                    let currentTrackIds = tr.history
                                        .filter(h => h.track && h.startDist < tr.headDist && h.endDist > tr.headDist - tr.trainLength)
                                        .map(h => h.track.id.toString());
                                    let inPlaceTA = (window.turnaroundAreas || []).find(a =>
                                        a.trackIds.some(tid => currentTrackIds.includes(String(tid)))
                                    );

                                    if (inPlaceTA) {
                                        // Already on the turnaround area — reverse in-place during dwell.
                                        // The outbound terminal dwell is done; now perform the physical reversal.
                                        tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                                        let ok = window.performTurnaround(tr);
                                        if (!ok) { tr.state = 'DESPAWNING'; return; }
                                        tr.dirPhase = newDir;
                                        tr._turnaroundTarget = null;
                                        tr._terminalTurnaround = false;
                                        tr._pendingNewDir = null;
                                        tr._pendingNextStationIdx = undefined;
                                        tr._route = null; tr._routeKey = null; tr._pathCache = null;
                                        tr._noPathLogged = false; tr._needsTurnaround = false;
                                        tr._justReversed = true;
                                        tr._turnaroundCooldown = 3.0;
                                        tr.speed = 0;
                                        tr._stationArrived = false;

                                        // Check if station[0] of the new direction is the same
                                        // platform we just reversed on. If so, dwell there now
                                        // (the train is already stopped here, serving passengers
                                        // in the new direction before departing).
                                        // This ensures the first stop of the new direction is
                                        // never skipped, even when it coincides with the terminal.
                                        let newStsCheck = lObj[newDir] && lObj[newDir].stations;
                                        let dwellHere = false;
                                        if (newStsCheck && newStsCheck.length > 0) {
                                            let firstTids = newStsCheck[0].trackIds.map(String);
                                            let bodyTidsNow = tr.history
                                                .filter(h => h.track && h.endDist > tr.headDist - tr.trainLength && h.startDist <= tr.headDist)
                                                .map(h => h.track.id.toString());
                                            if (firstTids.some(id => bodyTidsNow.includes(id))) {
                                                dwellHere = true;
                                            }
                                        }
                                        if (dwellHere) {
                                            // Dwell at station[0] of new direction before departing.
                                            tr._stationArrived = true;
                                            tr.nextStationIdx = 1; // will be advanced past station[0]
                                            tr.state = 'DWELLING';
                                            tr.dwellTimer = newStsCheck[0].dwell || 30;
                                        } else {
                                            tr.nextStationIdx = 0;
                                            tr.state = 'DRIVING';
                                        }
                                    } else {
                                        // Case 2 — FORWARD TURNAROUND AREA:
                                        // Only drive into a forward turnaround area if that area
                                        // is actually necessary to reach the new direction's first
                                        // station — i.e. after reversing inside the area the train
                                        // can reach newStations[0], but a simple in-place flip
                                        // from the current position cannot reach it.
                                        //
                                        // Without this guard, findTurnaroundArea returns ANY
                                        // reachable TA on the map (including ones belonging to
                                        // other lines), causing the train to drive kilometres in
                                        // the wrong direction instead of just flipping in place.
                                        let forwardTA = null;
                                        if (lastSeg) {
                                            let candidateTA = window.findTurnaroundArea(
                                                g, lastSeg.toNode, lastSeg.track.id, tr.trainLength);
                                            if (candidateTA) {
                                                // Verify: after reversing inside this TA, can the
                                                // train actually reach newStations[0]?
                                                // Simulate the exit node of the TA (last area track's
                                                // far end) and check reachability to newFirstTids.
                                                let taTrackIds = candidateTA.trackIds.map(String);
                                                let taReachesNewDir = false;
                                                for (let taTid of taTrackIds) {
                                                    let taTrk = (window.tracks || []).find(t => t.id.toString() === taTid);
                                                    if (!taTrk) continue;
                                                    // After reversing: both endpoints become candidate exit nodes
                                                    for (let exitNode of [taTrk.start.id || taTrk.start, taTrk.end.id || taTrk.end]) {
                                                        let exitNodeId = exitNode && exitNode.id !== undefined ? exitNode.id : exitNode;
                                                        if (!exitNodeId) continue;
                                                        let pathAfterRev = window.computeFullPath(g, exitNodeId, newFirstTids, taTid, false)
                                                            || window.computeFullPath(g, exitNodeId, newFirstTids, taTid, true);
                                                        if (pathAfterRev) { taReachesNewDir = true; break; }
                                                    }
                                                    if (taReachesNewDir) break;
                                                }
                                                if (taReachesNewDir) forwardTA = candidateTA;
                                            }
                                        }
                                        if (forwardTA) {
                                            // Drive forward into the turnaround area, THEN reverse.
                                            // Keep dirPhase as-is; TURNAROUND_REVERSE will flip it.
                                            tr._turnaroundTarget = forwardTA;
                                            tr._terminalTurnaround = true; // TURNAROUND_REVERSE must flip dirPhase
                                            tr._pendingNewDir = newDir;
                                            tr._pendingNextStationIdx = 0;
                                            tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                                            tr.state = 'TURNAROUND_APPROACH';
                                        } else {
                                            // Case 3 — No applicable turnaround area found.
                                            // Immediate in-place flip; extendTrainHistory will then
                                            // route toward newStations[0] from the reversed heading.
                                            tr.state = 'TURNAROUND';
                                        }
                                    }
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

                // Missed-stop correction — only when platform IS visible in history
                // and train is stopped short. Never apply when distToStop=Infinity
                // (platform not yet loaded): that would cause forward creep that
                // fights the Case-B/C transition check below and causes oscillation.
                if (tr.speed === 0 && distToStop !== Infinity && distToStop > 0.5 && distToStop < 50) {
                    tr.speed = Math.min(0.8, distToStop * 0.4);
                }

                // Cap movement to avoid overshooting the stop point at high sim speeds.
                // When already stopped (speed=0) never bump headDist.
                let maxStep = (distToStop !== Infinity && distToStop > 0)
                    ? Math.min(tr.speed * dtSec, Math.max(distToStop, 0))
                    : tr.speed * dtSec;
                if (tr.speed <= 0) maxStep = 0;
                tr.headDist += maxStep;

                // Memory cleanup
                // Keep at least one segment before the tail so getPointOnHistory always works
                while (tr.history.length > 2 && tr.headDist - tr.trainLength > tr.history[1].endDist) {
                    tr.history.shift();
                }

                // ── Turnaround arrival detection ────────────────────────────────
                // We need to catch three cases:
                //   A) Normal: distToStop reached ≤0.3 and speed ~0
                //   B) Dead-end: head reached the end of the last segment inside area
                //   C) High-speed overshoot: dtSec so large head jumped past stop;
                //      distToStop may now be Infinity (area cleaned from history) but
                //      lastSeg is still an area track at its very end.
                //
                // Unify: if the last history segment is an area track AND head is
                // at/past its endDist, snap to endDist and transition.
                // Also keep the normal distToStop ≤0.3 path.
                let _taTransition = false;
                let _lastSeg = tr.history[tr.history.length - 1];

                // Case A – normal arrival
                if (!_taTransition && distToStop <= 0.3) {
                    let areaSegs = tr.history.filter(h => h.track && ta.trackIds.includes(h.track.id.toString()));
                    if (areaSegs.length > 0) {
                        let stopHeadDist = window.getPlatformStopHeadDist(tr, fakeStation, tr.history);
                        if (stopHeadDist !== null) tr.headDist = stopHeadDist;
                        tr.speed = 0;
                        _taTransition = true;
                    }
                }

                // Case B/C – last seg is area track and head is at/past its end
                // (covers dead-ends AND high-speed overshoot where distToStop=Infinity)
                if (!_taTransition && _lastSeg && _lastSeg.track
                    && ta.trackIds.includes(_lastSeg.track.id.toString())
                    && tr.headDist >= _lastSeg.endDist - 0.5) {
                    tr.headDist = _lastSeg.endDist; // snap to end of area
                    tr.speed = 0;
                    _taTransition = true;
                }

                // Case B/C fallback – speed already ~0 on any area seg
                if (!_taTransition && tr.speed < 0.05 && _lastSeg && _lastSeg.track
                    && ta.trackIds.includes(_lastSeg.track.id.toString())) {
                    tr.speed = 0;
                    _taTransition = true;
                }

                if (_taTransition) {
                    tr.speed = 0;

                    // Check if the turnaround area track is also a station platform.
                    // If so, dwell for the proper station dwell time and advance
                    // nextStationIdx, then reverse — no separate TURNAROUND_WAIT.
                    let stations = lObj[tr.dirPhase].stations;
                    let taIds = ta.trackIds.map(String);
                    let matchingStation = stations && stations[tr.nextStationIdx];
                    let taIsStation = matchingStation &&
                        matchingStation.trackIds.some(id => taIds.includes(String(id)));

                    if (taIsStation) {
                        // Arrived at a platform that is also a TA.
                        // Dwell for station time, then reverse inside DWELLING exit.
                        tr.state = 'DWELLING';
                        tr.dwellTimer = matchingStation.dwell || 30;
                        if (!tr._stationArrived) {
                            tr._stationArrived = true;
                            tr.nextStationIdx++;
                        }
                        tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                        tr._route = null; tr._routeKey = null; tr._pathCache = null;
                        // Mark that upon dwell completion a turnaround is needed in-place.
                        // The DWELLING exit will detect this via the inPlaceTA check.
                    } else {
                        // Pure turnaround area (not a station) — brief realistic wait then reverse.
                        tr.state = 'TURNAROUND_WAIT';
                        tr._turnaroundWaitTimer = 5.0 + Math.random() * 3.0;
                    }
                }

            } else if (tr.state === 'TURNAROUND_WAIT') {
                // Waiting at turnaround area before reversing (realism pause)
                tr._turnaroundWaitTimer = (tr._turnaroundWaitTimer || 0) - dtSec;
                if (tr._turnaroundWaitTimer <= 0) {
                    tr.state = 'TURNAROUND_REVERSE';
                }

            } else if (tr.state === 'TURNAROUND_REVERSE') {
                // Train is fully stopped inside a player-defined turnaround area.
                // Perform reversal then resume driving toward the next station.
                let ok = window.performTurnaround(tr);
                if (!ok) { tr.state = 'DESPAWNING'; return; }

                tr.speed = 0;
                tr._turnaroundTarget = null;
                tr._needsTurnaround = false;
                tr._turnaroundCooldown = 3.0; // short cooldown: suppress same-track U-turn check only
                tr._route = null; tr._routeKey = null; // force re-path in new direction

                // If this reversal was initiated from a terminal dwell (DWELLING → TURNAROUND_APPROACH),
                // flip dirPhase now that the physical reversal is done.
                if (tr._terminalTurnaround) {
                    tr.dirPhase = tr._pendingNewDir || (tr.dirPhase === 'inbound' ? 'outbound' : 'inbound');
                    let pendingIdx = tr._pendingNextStationIdx !== undefined ? tr._pendingNextStationIdx : 0;

                    // If station[0] of the new direction is the turnaround area the
                    // train is currently sitting on, dwell there (serving passengers
                    // in the new direction) rather than silently skipping it.
                    let dwellAtFirst = false;
                    let firstStDwell = 30;
                    if (pendingIdx === 0) {
                        let newSts = lObj[tr.dirPhase] && lObj[tr.dirPhase].stations;
                        if (newSts && newSts.length > 0) {
                            let firstTids = newSts[0].trackIds.map(String);
                            let bodyTids = tr.history
                                .filter(h => h.track && h.endDist > tr.headDist - tr.trainLength && h.startDist <= tr.headDist)
                                .map(h => h.track.id.toString());
                            if (firstTids.some(id => bodyTids.includes(id))) {
                                dwellAtFirst = true;
                                firstStDwell = newSts[0].dwell || 30;
                                pendingIdx = 1; // advance past station[0] after this dwell
                            }
                        }
                    }

                    tr.nextStationIdx = pendingIdx;
                    tr._terminalTurnaround = false;
                    tr._pendingNewDir = null;
                    tr._pendingNextStationIdx = undefined;

                    if (dwellAtFirst) {
                        // Dwell at the first station of new direction (same as the TA we reversed on).
                        tr._stationArrived = true; // already counted above (pendingIdx = 1)
                        tr.state = 'DWELLING';
                        tr.dwellTimer = firstStDwell;
                        return; // skip the DRIVING transition below
                    }
                }

                // After reversal, clear the route cache so extendTrainHistory
                // recomputes the path from the new direction on the next DRIVING tick.
                // Do NOT path-check here: after performTurnaround, lastSeg.toNode is
                // the old head end (dead-end node) -- the train hasn't moved yet.
                // extendTrainHistory will route correctly once physics advance one step.
                tr._route = null; tr._routeKey = null; tr._pathCache = null;
                tr._noPathLogged = false; tr._needsTurnaround = false;
                // Prevent extendTrainHistory from re-triggering turnaround on the same
                // area track the train just reversed on. Cleared once the train routes
                // onto a track that is NOT part of any turnaround area.
                tr._justReversed = true;
                // Turnaround cooldown suppresses incoming-track U-turn check so the
                // train can depart from the terminal node cleanly.
                tr._turnaroundCooldown = 3.0;

                tr.speed = 0;
                tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);

                // If this turnaround was needed while returning to depot, go back to that state.
                if (tr._resumeDepotReturn) {
                    tr._resumeDepotReturn = false;
                    tr.state = 'RETURNING_TO_DEPOT';
                } else {
                    tr.state = 'DRIVING';
                }

            } else if (tr.state === 'TURNAROUND_PREP') {
                let ok = window.performTurnaround(tr);
                if (!ok) { tr.state = 'DESPAWNING'; return; }

                tr._needsTurnaround = false;
                tr._turnaroundCooldown = 3.0; // short cooldown: suppress same-track check only

                tr._route = null; tr._routeKey = null; tr._pathCache = null;
                tr._noPathLogged = false; tr._needsTurnaround = false;
                tr.speed = 0;
                tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                tr.state = 'DRIVING';

            } else if (tr.state === 'TURNAROUND') {
                // Terminal direction flip when no forward turnaround area was found.
                // Flip dirPhase and set a short cooldown so extendTrainHistory doesn't
                // reject the first step as a same-track U-turn.
                // On the next tick, extendTrainHistory may hit a dead-end, cancel the
                // cooldown, find a behind-terminal turnaround area, and drive into it.

                let newDir = tr.dirPhase === 'inbound' ? 'outbound' : 'inbound';
                let newStations = lObj[newDir].stations;
                if (!newStations || newStations.length === 0) {
                    if (tr.returningToDepot) {
                        tr.state = 'RETURNING_TO_DEPOT';
                        tr._depotReturnAttempts = 0;
                    } else {
                        tr.state = 'DESPAWNING';
                    }
                    return;
                }

                tr.dirPhase = newDir;
                tr.nextStationIdx = 0;
                tr.speed = 0;
                // Short cooldown: only suppresses the same-track incoming check so the train
                // can depart from the terminal node without a false U-turn rejection.
                // Do NOT use a long cooldown with allowSharpTurns — that causes impossible sharp turns.
                tr._turnaroundCooldown = 3.0;
                // Clear look-ahead so extendTrainHistory re-paths from current position
                tr.history = tr.history.filter(h => h.startDist <= tr.headDist + 1);
                tr.state = 'DRIVING';
            }

            // Extend train history toward depot tracks.
            // Like extendTrainHistory but WITHOUT the loop-prevention guard, because a
            // returning train must re-traverse tracks it already covered going the other way.
            // Still respects sharp-turn rejection and routes through turnaround areas.
            // =============================================================================
            // RETURNING_TO_DEPOT: depot tracks treated exactly like a platform.
            // Uses extendTrainHistory + computeDistToStop + the same physics as DRIVING.
            // Despawns instead of dwelling when stopped at the depot stop point.
            // The train can stop on ANY of the depot's tracks (whichever is reachable first).
            // =============================================================================
            if (tr.state === 'RETURNING_TO_DEPOT') {
                // Find home depot or any depot serving this line
                let homeDepot = window.depots.find(d => d.id === tr.depotId);
                if (!homeDepot) homeDepot = window.depots.find(d => !d.line || (lObj && (d.line.includes(lObj.name) || d.line === '')));
                if (!homeDepot || !homeDepot.tracks || homeDepot.tracks.length === 0) { tr.state = 'DESPAWNING'; return; }

                // Accept any depot track as the stop target — just like a multi-track platform.
                // Prefer a free (unoccupied) track, fall back to any if all busy.
                // IMPORTANT: once a depot track is already in history (train committed to it),
                // never switch target — switching causes computeDistToStop to flip to Infinity
                // on the tick the track enters history (isDepotTrackOccupied sees the train itself),
                // which makes effectiveTarget jump to Infinity and the train re-accelerates.
                let allDepotIds = homeDepot.tracks.map(String);
                let alreadyCommitted = allDepotIds.filter(tid =>
                    tr.history.some(h => h.track && h.track.id.toString() === tid)
                );
                let targetDepotIds;
                if (alreadyCommitted.length > 0) {
                    targetDepotIds = alreadyCommitted; // locked — don't change mid-approach
                } else {
                    let freeDepotIds = allDepotIds.filter(tid => {
                        let t = window.tracks.find(x => x.id.toString() === tid);
                        return t && !window.isDepotTrackOccupied(t);
                    });
                    targetDepotIds = freeDepotIds.length > 0 ? freeDepotIds : allDepotIds;
                }
                let depotStation = { trackIds: targetDepotIds };

                // Extend history toward depot using the depot-specific path extension.
                // Unlike extendTrainHistory, _extendTowardDepot allows re-traversal of
                // tracks already in history (returning trains must go back the way they came).
                _extendTowardDepot(tr, g, depotStation);

                // If _extendTowardDepot found a turnaround area en route, only hand off
                // if the depot is genuinely unreachable without reversing. A returning
                // train has already re-oriented; a spurious turnaround would flip it 180°
                // and send it back toward the terminal.
                if (tr._turnaroundTarget && tr.state !== 'TURNAROUND_APPROACH') {
                    let _lastTA = tr.history[tr.history.length - 1];
                    let _depotReachable = _lastTA && (
                        window.computeFullPath(g, _lastTA.toNode, targetDepotIds, _lastTA.track && _lastTA.track.id, true) ||
                        window.computeFullPath(g, _lastTA.toNode, targetDepotIds, null, true)
                    );
                    if (_depotReachable) {
                        // Depot reachable — turnaround was spurious; discard it.
                        tr._turnaroundTarget = null;
                        tr._needsTurnaround = false;
                        tr._turnaroundCooldown = 0;
                    } else {
                        tr._pendingNewDir = null;
                        tr._terminalTurnaround = false;
                        tr._resumeDepotReturn = true;
                        tr.state = 'TURNAROUND_APPROACH';
                        return;
                    }
                }

                // --- Physics: same as the DRIVING block ---
                // computeDistToStop returns Infinity until the head is inside a depot track.
                // Before entry, scan look-ahead history for the first upcoming depot seg and
                // compute the kinematic stop point from outside so braking starts in time.
                let distToDepot = window.computeDistToStop(tr, depotStation, tr.history);
                if (distToDepot === Infinity) {
                    // Find the first depot seg that's ahead of the current head
                    for (let h of tr.history) {
                        if (h.startDist <= tr.headDist) continue;
                        if (!targetDepotIds.includes(h.track.id.toString())) continue;
                        // Use only this specific depot track's length for the stop estimate
                        let trackLen = h.track.length;
                        let stopHd = h.startDist + trackLen / 2 + tr.trainLength / 2;
                        stopHd = Math.max(h.startDist + 1, Math.min(h.startDist + trackLen, stopHd));
                        distToDepot = stopHd - tr.headDist;
                        break;
                    }
                }
                let trMaxSpeedMs = tr.maxSpeed / 3.6;
                let headSeg = null;
                for (let i = 0; i < tr.history.length; i++) {
                    let h = tr.history[i];
                    let isLast = i === tr.history.length - 1;
                    if (tr.headDist >= h.startDist && (isLast ? tr.headDist <= h.endDist : tr.headDist < h.endDist)) {
                        headSeg = h; break;
                    }
                }
                let speedCap = headSeg && headSeg.track.speedLimit
                    ? Math.min(trMaxSpeedMs, headSeg.track.speedLimit / 3.6)
                    : trMaxSpeedMs;

                // Look-ahead speed limit enforcement
                for (let h of tr.history) {
                    if (h.startDist <= tr.headDist) continue;
                    let hLim = h.track.speedLimit ? h.track.speedLimit / 3.6 : trMaxSpeedMs;
                    if (hLim >= speedCap) continue;
                    let maxNow = Math.sqrt(hLim * hLim + 2 * tr.brake * (h.startDist - tr.headDist));
                    if (maxNow < speedCap) speedCap = maxNow;
                }

                // Kinematic braking curve toward depot stop (identical to station approach)
                let hasStop = distToDepot !== Infinity;
                let idealStopSpeed = hasStop
                    ? Math.sqrt(2 * tr.brake * Math.max(distToDepot, 0))
                    : Infinity;
                let effectiveTarget = Math.min(speedCap, idealStopSpeed);

                let requiredDecel = hasStop && distToDepot > 0.1
                    ? (tr.speed * tr.speed) / (2 * Math.max(distToDepot, 0.1)) : 0;

                if (tr.speed < effectiveTarget - 0.05) {
                    tr.speed += tr.accel * dtSec;
                    if (tr.speed > effectiveTarget) tr.speed = effectiveTarget;
                } else if (tr.speed > effectiveTarget + 0.05) {
                    let decel = Math.min(requiredDecel + (tr.speed - effectiveTarget) * 1.5, tr.ebrake);
                    decel = Math.max(decel, tr.brake * 0.1);
                    tr.speed -= decel * dtSec;
                    if (tr.speed < 0) tr.speed = 0;
                } else {
                    tr.speed = Math.max(0, effectiveTarget);
                }

                tr.headDist += tr.speed * dtSec;
                while (tr.history.length > 2 && tr.headDist - tr.trainLength > tr.history[1].endDist) tr.history.shift();

                // Arrived: stopped within 1 m of the computed depot stop point → despawn
                if (hasStop && tr.speed < 0.05) {
                    let stopHd = window.getPlatformStopHeadDist(tr, depotStation, tr.history);
                    if (stopHd !== null && Math.abs(tr.headDist - stopHd) <= 1.0) {
                        tr.speed = 0; tr.state = 'DESPAWNING'; return;
                    }
                }
                // Fallback: head physically on a depot track and stopped → despawn
                if (tr.speed < 0.05) {
                    let onDepot = tr.history.some(h =>
                        h.track && targetDepotIds.includes(h.track.id.toString()) &&
                        h.startDist <= tr.headDist && tr.headDist <= h.endDist + 1
                    );
                    if (onDepot) { tr.speed = 0; tr.state = 'DESPAWNING'; return; }
                }

                // Failsafe: stuck with no path for too long → despawn
                if (!hasStop && tr.speed < 0.01) {
                    tr._depotReturnAttempts = (tr._depotReturnAttempts || 0) + 1;
                    if (tr._depotReturnAttempts > 600) {
                        console.warn('[SIM] Train', tr.id, 'cannot reach depot — despawning');
                        tr.state = 'DESPAWNING'; return;
                    }
                } else { tr._depotReturnAttempts = 0; }

                if (window.selectedTrain && window.selectedTrain.id === tr.id) {
                    document.getElementById('train-info-speed').innerText = Math.round(tr.speed * 3.6);
                    document.getElementById('train-info-state').innerText = 'RETURNING_TO_DEPOT';
                    document.getElementById('train-info-next').innerText = 'Depot';
                    if (lObj) document.getElementById('train-info-line').innerText = lObj.name;
                }
                return;
            }


            if (window.selectedTrain && window.selectedTrain.id === tr.id) {
                document.getElementById('train-info-speed').innerText = Math.round(tr.speed * 3.6);
                document.getElementById('train-info-state').innerText = tr.state + (tr.returningToDepot ? ' [→Depot]' : '');
                (function () {
                    let _stations2 = lObj[tr.dirPhase].stations;
                    let _st2 = _stations2 && _stations2[tr.nextStationIdx];
                    let _stName = 'Station ' + (tr.nextStationIdx + 1);
                    if (_st2 && _st2.trackIds && window.platformBoundaries) {
                        let _sids = [..._st2.trackIds].sort().join(',');
                        let _bnd = window.platformBoundaries.find(b => b.pathId === _sids);
                        if (_bnd && _bnd.stationName) _stName = _bnd.stationName;
                        else if (_bnd && _bnd.platformNumber) _stName = 'Plat ' + _bnd.platformNumber;
                    }
                    document.getElementById('train-info-next').innerText = _stName;
                })()
                if (lObj) document.getElementById('train-info-line').innerText = lObj.name;
            }
        });

    } // end while (remainingSim > 0)

    // Despawn at end of frame (not per sub-step) to avoid double-processing
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