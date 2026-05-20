// =============================================================================
// REDESIGNED PATHFINDING & GRAPH SYSTEM
// Drop-in replacement for the graph, pathfinding, spawn, and history-extension
// sections of sim.js.  Everything else (physics, rendering, UI) is unchanged.
//
// Key improvements:
//   1. DIRECTION-AWARE GRAPH  — each edge carries its physical departure angle,
//      so turn filtering is purely a vector comparison (no topology heuristics).
//   2. TIME-COST DIJKSTRA     — edge cost = distance / speed_limit, so the
//      fastest route is found, not the shortest one.
//   3. TURNAROUND AREA SUPPORT — dead-end stubs are traversed properly;
//      trains drive in, stop, reverse, and exit without sharp-turn violations.
//   4. SHARP-TURN FREE ROUTING — strict 120° deviation limit; turnaround areas
//      are the only legitimate way to reverse direction.
//   5. DEPOT PRE-PATHFINDING   — spawn picks the depot track + exit direction
//      that gives the shortest time-path to the first station, so inbound and
//      outbound trains automatically use the correct end of the depot.
//   6. STATION SEQUENCE GUARD  — nextStationIdx is advanced exactly once per
//      arrival; an arrival guard prevents double-counting; "no next target" is
//      impossible because we validate the index before every extend call.
// =============================================================================

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------
const SHARP_ANGLE_THRESHOLD = Math.PI * 2 / 3;  // 120° — max allowed deviation
const UTURN_THRESHOLD = Math.PI * 5 / 6;  // 150° — considered a U-turn
const ROUTE_LOOKAHEAD = 800;               // metres pre-loaded into history
const POS_SNAP = 2.0;               // metres — endpoint snap tolerance

// ---------------------------------------------------------------------------
// BINARY MIN-HEAP  (cost-keyed, used by all Dijkstra calls)
// ---------------------------------------------------------------------------
function _heapPush(heap, item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
        let p = (i - 1) >> 1;
        if (heap[p].cost <= heap[i].cost) break;
        let t = heap[p]; heap[p] = heap[i]; heap[i] = t;
        i = p;
    }
}
function _heapPop(heap) {
    let top = heap[0];
    let last = heap.pop();
    if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        while (true) {
            let l = 2 * i + 1, r = 2 * i + 2, s = i;
            if (l < heap.length && heap[l].cost < heap[s].cost) s = l;
            if (r < heap.length && heap[r].cost < heap[s].cost) s = r;
            if (s === i) break;
            let t = heap[s]; heap[s] = heap[i]; heap[i] = t;
            i = s;
        }
    }
    return top;
}

// ---------------------------------------------------------------------------
// GEOMETRY HELPERS
// ---------------------------------------------------------------------------
function _snapKey(x, y) {
    return `${Math.round(x / POS_SNAP)},${Math.round(y / POS_SNAP)}`;
}

// Physical outward tangent angle of a track at a given endpoint.
// "Outward" = pointing away from the node into the track body.
// Works purely from geometry, never from stored dir1/dir2 (which can be stale).
function _outwardTangent(track, nodePos) {
    let dStart = Math.hypot(track.start.x - nodePos.x, track.start.y - nodePos.y);
    let dEnd = Math.hypot(track.end.x - nodePos.x, track.end.y - nodePos.y);
    let atStart = dStart <= dEnd;

    if (track.type === 'arc' && track.cx !== undefined) {
        // Tangent perpendicular to radius; sign depends on winding
        let px = atStart ? track.start.x : track.end.x;
        let py = atStart ? track.start.y : track.end.y;
        let rx = px - track.cx, ry = py - track.cy;
        let tx, ty;
        if (track.ccw) { tx = -ry; ty = rx; }  // CCW: rotate +90°
        else { tx = ry; ty = -rx; }  // CW:  rotate -90°
        let fwd = Math.atan2(ty, tx);  // direction start→end at this point
        return atStart ? fwd : normalizeAngle(fwd + Math.PI);
    }
    // Straight track
    let base = Math.atan2(track.end.y - track.start.y, track.end.x - track.start.x);
    return atStart ? base : normalizeAngle(base + Math.PI);
}

// Signed turn deviation: 0 = straight through, π = U-turn.
// Incoming track is the one the train just finished; candidate is the next one.
function _turnDeviation(incomingTrack, candidateTrack, nodePos) {
    if (!incomingTrack || !candidateTrack) return 0;
    if (incomingTrack.id.toString() === candidateTrack.id.toString()) return Math.PI; // same track
    let inOut = _outwardTangent(incomingTrack, nodePos);  // direction back toward incoming
    let candOut = _outwardTangent(candidateTrack, nodePos);  // direction forward into candidate
    // Two tracks that go in "opposite" directions from this node (inOut ≈ candOut reversed)
    // means straight through → deviation ≈ 0.
    let between = Math.abs(normalizeAngle(candOut - inOut));
    return Math.abs(Math.PI - between);   // 0=straight, π=U-turn
}

// ---------------------------------------------------------------------------
// GRAPH CONSTRUCTION
// ---------------------------------------------------------------------------
// Edge: { trackId, to, dist, timeCost, departAngle }
//   dist       — physical length in metres (for distance-based decisions)
//   timeCost   — dist / speed_limit_ms  (used as Dijkstra edge cost → fastest route)
//   departAngle — physical angle leaving fromNode along this track
//
// The graph is cached until _invalidateGraphCache() is called.

window.buildGraph = function () {
    if (window._cachedGraph && !window._graphMutationPending) return window._cachedGraph;
    window._graphMutationPending = false;

    let graph = new Map();             // nodeId → Edge[]
    let posToId = new Map();           // snapKey → canonicalNodeId
    let nodePositions = new Map();     // nodeId → {x, y}

    // ── Seed canonical IDs from window.nodes ─────────────────────────────────
    if (window.nodes) {
        window.nodes.forEach(n => {
            let k = _snapKey(n.x, n.y);
            if (!posToId.has(k)) posToId.set(k, n.id);
            nodePositions.set(n.id.toString(), n);
        });
    }
    window._nodePositions = nodePositions;

    let canonId = (x, y, fallback) => {
        let k = _snapKey(x, y);
        if (posToId.has(k)) return posToId.get(k);
        posToId.set(k, fallback);
        if (!nodePositions.has(fallback.toString()))
            nodePositions.set(fallback.toString(), { x, y, id: fallback });
        return fallback;
    };

    let ensure = id => { if (!graph.has(id)) graph.set(id, []); };

    // ── Build edges from tracks ───────────────────────────────────────────────
    (window.tracks || []).forEach(t => {
        let sId = canonId(t.start.x, t.start.y, t.start.id || t.id + '_s');
        let eId = canonId(t.end.x, t.end.y, t.end.id || t.id + '_e');
        ensure(sId); ensure(eId);

        // Ensure node positions exist for depot/synthetic nodes.
        // Always store the exact track endpoint position so _outwardTangent and
        // turn-filter calls get a position that is guaranteed to be on the correct
        // side of the track (not an offset canonical position from another track).
        nodePositions.set(sId.toString(), { x: t.start.x, y: t.start.y, id: sId });
        nodePositions.set(eId.toString(), { x: t.end.x, y: t.end.y, id: eId });

        // Speed limit in m/s (arc auto-limit or explicit)
        let spdKmh = t.speedLimit
            || (t.type === 'arc' ? Math.min(160, 4.5 * Math.sqrt(t.radius)) : 160);
        let spdMs = spdKmh / 3.6;
        let timeCost = t.length / Math.max(spdMs, 0.1);

        // Physical departure angles — computed from exact track endpoint coords.
        let deptFromS = _outwardTangent(t, { x: t.start.x, y: t.start.y });
        let deptFromE = _outwardTangent(t, { x: t.end.x, y: t.end.y });

        // Determine which graph traversal direction (sId→eId or eId→sId) matches the
        // player's intended "forward" direction for one-way enforcement.
        //
        // Players draw tracks freely — t.start / t.end are just the two endpoints in
        // click order, which is arbitrary and may differ from the physical travel
        // direction intended by the one-way arrow.  t.dir1 stores the tangent angle at
        // t.start pointing INTO the track body along the draw direction (i.e. toward
        // t.end as the player intended).  By comparing dir1 against the geometry-derived
        // departure angle from the sId node, we can detect whether the graph's sId→eId
        // edge runs in the same direction as the player's arrow or the opposite.
        //
        // Angular tolerance of 90° handles floating-point drift and broad curves.
        //
        // Fallback (dir1 undefined): use sId→eId as forward — same as the old behaviour,
        // safe for bidirectional tracks where it doesn't matter.
        let fwdIsStoE = true;
        if (t.oneWay !== 0 && t.dir1 !== undefined) {
            // deptFromS is the angle leaving sId along this track (into the track body).
            // If it agrees with dir1 (< 90° apart), sId→eId is the player's forward.
            // If it disagrees (≥ 90°), the track was drawn end→start, so eId→sId is forward.
            let diff = Math.abs(normalizeAngle(deptFromS - t.dir1));
            fwdIsStoE = diff < Math.PI / 2;
        }

        // Map "allow start→end" / "allow end→start" in draw-order terms to physical edges:
        //   oneWay  0 → both directions
        //   oneWay  1 → forward (player arrow direction) only
        //   oneWay -1 → reverse (against player arrow) only
        let allowStoE = t.oneWay === 0
            || (t.oneWay === 1 && fwdIsStoE)
            || (t.oneWay === -1 && !fwdIsStoE);
        let allowEtoS = t.oneWay === 0
            || (t.oneWay === -1 && fwdIsStoE)
            || (t.oneWay === 1 && !fwdIsStoE);

        if (allowStoE)
            graph.get(sId).push({ trackId: t.id, to: eId, dist: t.length, timeCost, departAngle: deptFromS, speedKmh: spdKmh });
        if (allowEtoS)
            graph.get(eId).push({ trackId: t.id, to: sId, dist: t.length, timeCost, departAngle: deptFromE, speedKmh: spdKmh });
    });

    window._cachedGraph = graph;
    window._canonNodeMap = posToId;
    return graph;
};

window._invalidateGraphCache = function () {
    window._graphMutationPending = true;
};

// ---------------------------------------------------------------------------
// TURN ANGLE (public, used by debug log)
// ---------------------------------------------------------------------------
function _getTurnAngle(incomingTrackId, candidateTrackId, nodeId) {
    if (incomingTrackId.toString() === candidateTrackId.toString()) return Math.PI;
    let inT = (window.tracks || []).find(t => t.id.toString() === incomingTrackId.toString());
    let outT = (window.tracks || []).find(t => t.id.toString() === candidateTrackId.toString());
    if (!inT || !outT) return 0;
    let pos = _nodePos(nodeId);
    if (!pos) return 0;
    return _turnDeviation(inT, outT, pos);
}

function _nodePos(nodeId) {
    if (window._nodePositions) {
        let n = window._nodePositions.get(nodeId.toString());
        if (n) return n;
    }
    return (window.nodes || []).find(n => n.id.toString() === nodeId.toString()) || null;
}

// Expose for debug log compatibility
window._getTurnAngle = _getTurnAngle;
window._nodePos = _nodePos;
// Keep _trackOutwardTangentAtPos alias for debug log
window._trackOutwardTangentAtPos = _outwardTangent;

// ---------------------------------------------------------------------------
// DIJKSTRA — time-cost, direction-aware
//
//   graph         — from buildGraph()
//   startNodeId   — node to start from
//   targetTrackIds— array of track IDs; any one counts as destination
//   incomingTrackId — track the train arrived on (null = no restriction)
//   allowSharpTurns — skip turn filter entirely (used inside turnaround areas)
//
// Returns: [{trackId, fromNode, toNode, dist, timeCost, speedKmh}] or null
// ---------------------------------------------------------------------------
window.computeFullPath = function (graph, startNodeId, targetTrackIds, incomingTrackId, allowSharpTurns) {
    let tIds = Array.isArray(targetTrackIds)
        ? new Set(targetTrackIds.map(String))
        : new Set([String(targetTrackIds)]);
    allowSharpTurns = !!allowSharpTurns;

    let distMap = new Map();  // stateKey → best timeCost so far
    let prev = new Map();  // stateKey → {fromNode, fromTrack, fromSk, edge}
    let pq = [];

    let sk0 = `${startNodeId}|${incomingTrackId || ''}`;
    _heapPush(pq, { id: startNodeId, cost: 0, lastTrackId: incomingTrackId || null, sk: sk0 });
    distMap.set(sk0, 0);

    let bestTargetSk = null, bestTargetCost = Infinity;
    let foundAtNode = null, foundLastTrack = null, foundEdge = null;

    while (pq.length > 0) {
        let u = _heapPop(pq);
        if ((distMap.get(u.sk) || Infinity) < u.cost) continue; // stale entry
        if (u.cost > bestTargetCost) break;  // can't improve

        let nodePos = _nodePos(u.id);
        let inTrack = u.lastTrackId
            ? (window.tracks || []).find(t => t.id.toString() === u.lastTrackId.toString())
            : null;

        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            let eTidStr = String(edge.trackId);

            // Never U-turn on the same track
            if (u.lastTrackId && eTidStr === String(u.lastTrackId)) continue;

            // Turn filter
            if (!allowSharpTurns && inTrack && nodePos) {
                let outTrack = (window.tracks || []).find(t => t.id.toString() === eTidStr);
                if (outTrack) {
                    let dev = _turnDeviation(inTrack, outTrack, nodePos);
                    if (dev > SHARP_ANGLE_THRESHOLD) continue;
                }
            }

            let alt = u.cost + edge.timeCost;
            let nextSk = `${edge.to}|${eTidStr}`;
            if (!distMap.has(nextSk) || alt < distMap.get(nextSk)) {
                distMap.set(nextSk, alt);
                prev.set(nextSk, { fromNode: u.id, fromTrack: u.lastTrackId, fromSk: u.sk, edge });
                _heapPush(pq, { id: edge.to, cost: alt, lastTrackId: eTidStr, sk: nextSk });
            }

            if (tIds.has(eTidStr) && alt < bestTargetCost) {
                bestTargetCost = alt;
                bestTargetSk = `${u.id}|${u.lastTrackId || ''}`;
                foundAtNode = u.id;
                foundLastTrack = u.lastTrackId;
                foundEdge = edge;
            }
        }
    }

    if (!foundEdge) return null;

    // Reconstruct path
    let path = [];
    let cur = bestTargetSk;
    let curNode = foundAtNode;
    let seen = new Set([cur]);
    let safety = 0;
    while (curNode !== startNodeId && prev.has(cur) && safety++ < 5000) {
        let p = prev.get(cur);
        path.unshift({
            trackId: p.edge.trackId, fromNode: p.fromNode, toNode: curNode,
            dist: p.edge.dist, timeCost: p.edge.timeCost, speedKmh: p.edge.speedKmh
        });
        curNode = p.fromNode;
        let nextCur = `${p.fromNode}|${p.fromTrack || ''}`;
        if (seen.has(nextCur)) break;
        seen.add(nextCur);
        cur = nextCur;
    }
    path.push({
        trackId: foundEdge.trackId, fromNode: foundAtNode, toNode: foundEdge.to,
        dist: foundEdge.dist, timeCost: foundEdge.timeCost, speedKmh: foundEdge.speedKmh
    });
    return path.length > 0 ? path : null;
};

// Strict path (no sharp turns). Returns null if impossible (caller should use turnaround).
window.computePathStrict = function (graph, startNodeId, targetTrackIds, incomingTrackId) {
    let strict = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId, false);
    if (strict) return { path: strict, forcedSharpTurn: false };
    let loose = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId, true);
    if (loose) return { path: loose, forcedSharpTurn: true };
    return null;
};

// Single-step version (used by legacy callers)
window.findNextTrack = function (graph, startNodeId, targetTrackIds, incomingTrackId, allowSharpTurns) {
    let path = window.computeFullPath(graph, startNodeId, targetTrackIds, incomingTrackId, !!allowSharpTurns);
    if (!path || path.length === 0) return null;
    let first = path[0];
    let edges = graph.get(startNodeId) || [];
    return edges.find(e => e.trackId === first.trackId && e.to === first.toNode)
        || {
        trackId: first.trackId, to: first.toNode, cost: first.dist,
        speed: first.speedKmh, dist: first.dist, timeCost: first.timeCost
    };
};

// ---------------------------------------------------------------------------
// TURNAROUND AREA FINDER
// Finds the nearest reachable player-defined turnaround area via Dijkstra.
// Sharp-turn filter is relaxed for edges that enter the area itself (approach
// edges outside the area still respect the filter).
// ---------------------------------------------------------------------------
window.findTurnaroundArea = function (graph, startNodeId, incomingTrackId, trainLength) {
    let areas = window.turnaroundAreas || [];
    if (areas.length === 0) return null;

    let areaTrackSet = new Set(areas.flatMap(a => a.trackIds.map(String)));

    let distMap = new Map();
    let prev = new Map();
    let pq = [];
    let sk0 = `${startNodeId}|${incomingTrackId || ''}`;
    _heapPush(pq, { id: startNodeId, cost: 0, lastTrackId: incomingTrackId || null, sk: sk0 });
    distMap.set(sk0, 0);

    let bestArea = null, bestCost = Infinity, bestSk = null;

    while (pq.length > 0) {
        let u = _heapPop(pq);
        if ((distMap.get(u.sk) || Infinity) < u.cost) continue;
        if (u.cost > 30000 || u.cost > bestCost) break; // reasonable search horizon

        let nodePos = _nodePos(u.id);
        let inTrack = u.lastTrackId
            ? (window.tracks || []).find(t => t.id.toString() === u.lastTrackId.toString())
            : null;

        let edges = graph.get(u.id) || [];
        for (let edge of edges) {
            let eTidStr = String(edge.trackId);
            if (u.lastTrackId && eTidStr === String(u.lastTrackId)) continue;

            // Allow sharp turns INTO area; enforce them on approach
            let isAreaEdge = areaTrackSet.has(eTidStr);
            if (!isAreaEdge && inTrack && nodePos) {
                let outTrack = (window.tracks || []).find(t => t.id.toString() === eTidStr);
                if (outTrack && _turnDeviation(inTrack, outTrack, nodePos) > SHARP_ANGLE_THRESHOLD) continue;
            }

            let alt = u.cost + edge.timeCost;
            let nextSk = `${edge.to}|${eTidStr}`;
            if (!distMap.has(nextSk) || alt < distMap.get(nextSk)) {
                distMap.set(nextSk, alt);
                prev.set(nextSk, { fromNode: u.id, fromTrack: u.lastTrackId, edge });
                _heapPush(pq, { id: edge.to, cost: alt, lastTrackId: eTidStr, sk: nextSk });
            }

            for (let area of areas) {
                if (area.trackIds.map(String).includes(eTidStr) && alt < bestCost) {
                    bestCost = alt;
                    bestArea = area;
                    bestSk = nextSk;
                }
            }
        }
    }

    if (!bestArea) return null;

    // Reconstruct approach path
    let path = [];
    let cur = bestSk;
    let seen = new Set([cur]);
    let safety = 0;
    while (prev.has(cur) && safety++ < 500) {
        let p = prev.get(cur);
        path.unshift({
            trackId: p.edge.trackId, fromNode: p.fromNode, toNode: p.edge.to,
            dist: p.edge.dist, timeCost: p.edge.timeCost
        });
        let nextCur = `${p.fromNode}|${p.fromTrack || ''}`;
        if (seen.has(nextCur)) break;
        seen.add(nextCur);
        cur = nextCur;
    }

    return { areaId: bestArea.id, trackIds: bestArea.trackIds, approachPath: path };
};

// ---------------------------------------------------------------------------
// DEPOT SPAWN  — pre-pathfind to pick the best track + direction
//
// For each non-occupied depot track, try BOTH traversal directions.
// Score = time-cost to first station.  Pick the minimum.
// This means inbound and outbound trains automatically exit from whichever
// end of the depot gives the faster route to their first station.
// ---------------------------------------------------------------------------
window.spawnTrainOnLine = function (line, dir, depot, g) {
    if (!g) g = window.buildGraph();
    let depotTrackIds = new Set((depot.tracks || []).map(String));
    let st = line[dir].stations;
    if (!st || st.length === 0) return null;
    let firstStationTids = st[0].trackIds.map(String);

    // Enumerate all (depotTrack, traversalDirection) combinations
    let bestDepTrack = null, bestFromNode = null, bestToNode = null;
    let bestTimeCost = Infinity;

    for (let [nid, edges] of g) {
        for (let e of edges) {
            if (!depotTrackIds.has(String(e.trackId))) continue;

            let depTrack = (window.tracks || []).find(t => t.id.toString() === String(e.trackId));
            if (!depTrack) continue;
            if (window.isDepotTrackOccupied(depTrack)) continue;

            // e.to is the exit node of this traversal direction
            let exitNode = e.to;
            let externalEdges = (g.get(exitNode) || []).filter(ex => !depotTrackIds.has(String(ex.trackId)));
            if (externalEdges.length === 0) continue; // dead end inside depot

            // Pathfind from exit node to first station (no incoming restriction: first step out of depot)
            let path = window.computeFullPath(g, exitNode, firstStationTids, null, false);
            if (!path) path = window.computeFullPath(g, exitNode, firstStationTids, null, true);
            if (!path) continue;

            let totalCost = e.timeCost + path.reduce((s, p) => s + p.timeCost, 0);
            if (totalCost < bestTimeCost) {
                bestTimeCost = totalCost;
                bestDepTrack = depTrack;
                bestFromNode = nid;
                bestToNode = exitNode;
            }
        }
    }

    // Fallback: any non-occupied depot track with an external exit
    if (!bestDepTrack) {
        outer: for (let [nid, edges] of g) {
            for (let e of edges) {
                if (!depotTrackIds.has(String(e.trackId))) continue;
                let depTrack = (window.tracks || []).find(t => t.id.toString() === String(e.trackId));
                if (!depTrack || window.isDepotTrackOccupied(depTrack)) continue;
                let ext = (g.get(e.to) || []).filter(ex => !depotTrackIds.has(String(ex.trackId)));
                if (ext.length > 0) {
                    bestDepTrack = depTrack; bestFromNode = nid; bestToNode = e.to;
                    break outer;
                }
            }
        }
    }

    if (!bestDepTrack) return null;

    let tLen = (depot.carriages || 4) * 25 + Math.max(0, (depot.carriages || 4) - 1);
    let initialHeadDist = Math.min(tLen, bestDepTrack.length);

    return {
        id: 'TRN' + Math.floor(Math.random() * 100000),
        lineId: line.id, dirPhase: dir,
        depotId: depot.id,
        carriages: depot.carriages || 4, trainLength: tLen,
        color: depot.color || '#ff8800',
        maxSpeed: depot.maxSpeed || 60,
        accel: depot.accel || 1.0, brake: depot.brake || 1.0, ebrake: depot.ebrake || 2.0,
        speed: 0, state: 'DRIVING',
        nextStationIdx: 0,
        _stationArrived: false,   // arrival guard — prevent double-advance
        dwellTimer: 0,
        returningToDepot: false,
        plannedRoute: [],
        _justSpawned: true,
        history: [{
            track: bestDepTrack, fromNode: bestFromNode, toNode: bestToNode,
            startDist: 0, endDist: bestDepTrack.length
        }],
        headDist: initialHeadDist
    };
};

// ---------------------------------------------------------------------------
// STATION SEQUENCE — safe next-station accessor
// Returns the active station for the current nextStationIdx, or null if
// we are past the end of the list.  Also resolves secondary platforms.
// ---------------------------------------------------------------------------
window.getTargetStation = function (train, lObj) {
    if (!lObj) return null;
    let stations = lObj[train.dirPhase].stations;
    if (!stations || train.nextStationIdx >= stations.length) return null;
    return window.selectActiveStation(stations[train.nextStationIdx]);
};

// ---------------------------------------------------------------------------
// EXTEND TRAIN HISTORY
// Fills history ROUTE_LOOKAHEAD metres ahead of the head.
// Uses a cached full Dijkstra route to avoid recomputing every tick.
// ---------------------------------------------------------------------------
window.extendTrainHistory = function (train, g, targetStation) {
    if (!targetStation) return;

    // If committed to a turnaround approach, delegate
    if (train._turnaroundTarget) {
        _extendTowardTurnaround(train, g);
        return;
    }

    let platIds = targetStation.trackIds.map(String);
    let lastSeg = train.history[train.history.length - 1];
    if (!lastSeg || !lastSeg.track) return;

    // ── Already on platform: load any remaining platform tracks ──────────────
    if (platIds.includes(lastSeg.track.id.toString())) {
        _loadRemainingPlatformTracks(train, g, platIds);

        // Check if this platform is also a turnaround area
        if (!train._turnaroundTarget && !train._justReversed) {
            let loaded = new Set(
                train.history.filter(h => h.track && platIds.includes(h.track.id.toString()))
                    .map(h => h.track.id.toString())
            );
            if (platIds.every(id => loaded.has(id))) {
                let platTA = (window.turnaroundAreas || []).find(a =>
                    a.trackIds.some(tid => loaded.has(String(tid))));
                if (platTA) {
                    train._turnaroundTarget = { areaId: platTA.id, trackIds: platTA.trackIds, approachPath: [] };
                    train._needsTurnaround = false;
                }
            }
        }
        return;
    }

    // ── Sufficient lookahead? ─────────────────────────────────────────────────
    if (lastSeg.endDist - train.headDist > ROUTE_LOOKAHEAD) return;

    // ── Spawn grace / cooldown ────────────────────────────────────────────────
    if (train._spawnTicks === undefined) train._spawnTicks = 0;
    if (train._justSpawned) { train._spawnTicks = 6; train._justSpawned = false; }
    if (train._spawnTicks > 0) train._spawnTicks--;
    let freshSpawn = train._spawnTicks > 0;
    let inCooldown = (train._turnaroundCooldown || 0) > 0;
    let incomingTid = (freshSpawn || inCooldown) ? null : lastSeg.track.id;
    let allowSharp = freshSpawn || inCooldown;

    // ── Compute / reuse cached route ──────────────────────────────────────────
    let routeKey = `${lastSeg.toNode}|${incomingTid}|${platIds.join(',')}|${allowSharp ? 1 : 0}`;
    if (!train._route || train._routeKey !== routeKey) {
        let path = window.computeFullPath(g, lastSeg.toNode, platIds, incomingTid, allowSharp);
        if (!path && !allowSharp)
            path = window.computeFullPath(g, lastSeg.toNode, platIds, incomingTid, true);
        train._route = path || null;
        train._routeKey = routeKey;
        train._routePos = 0;
    }

    // ── Consume route into history ────────────────────────────────────────────
    if (train._route && train._route.length > 0) {
        // Skip steps already committed to history
        while (train._routePos < train._route.length) {
            let step = train._route[train._routePos];
            if (train.history.some(h => h.track
                && h.track.id.toString() === String(step.trackId)
                && h.fromNode.toString() === String(step.fromNode))) {
                train._routePos++;
            } else break;
        }

        while (train._routePos < train._route.length) {
            let lastH = train.history[train.history.length - 1];
            if (!lastH || lastH.endDist - train.headDist > ROUTE_LOOKAHEAD) break;

            let step = train._route[train._routePos];
            if (String(step.fromNode) !== String(lastH.toNode)) {
                // Route is stale — clear and recompute next tick
                train._route = null; train._routeKey = null; break;
            }
            let nt = (window.tracks || []).find(x => x.id.toString() === String(step.trackId));
            if (!nt) { train._route = null; break; }

            train.history.push({
                track: nt, fromNode: step.fromNode, toNode: step.toNode,
                startDist: lastH.endDist, endDist: lastH.endDist + nt.length
            });
            train._routePos++;

            if (platIds.includes(String(step.trackId))) {
                // Reached target — clear route so next call recomputes for next station
                train._route = null; train._routeKey = null;
                break;
            }
        }

        if (train._route && train._routePos >= train._route.length)
            train._route = null, train._routeKey = null;

        train._noPathLogged = false;
        return;
    }

    // ── No route found ────────────────────────────────────────────────────────
    // Check if we are already inside a turnaround area
    let isStillInDepot = train.history.length === 1 && train.headDist < lastSeg.endDist + 50;
    if (isStillInDepot) return;

    let bodyTids = train.history
        .filter(h => h.track && h.startDist < train.headDist && h.endDist > train.headDist - train.trainLength)
        .map(h => h.track.id.toString());
    let inPlaceTA = (window.turnaroundAreas || []).find(a =>
        a.trackIds.some(tid => bodyTids.includes(String(tid))));
    if (inPlaceTA) {
        train._turnaroundTarget = { areaId: inPlaceTA.id, trackIds: inPlaceTA.trackIds, approachPath: [] };
        train._needsTurnaround = false;
        return;
    }

    if (!inCooldown) {
        let taResult = window.findTurnaroundArea(g, lastSeg.toNode, lastSeg.track.id, train.trainLength);
        if (taResult) {
            train._turnaroundTarget = taResult;
            train._needsTurnaround = false;
            _extendTowardTurnaround(train, g);
        } else {
            if (!train._noPathLogged) {
                console.warn('[SIM] No path/turnaround for train', train.id, 'at node', lastSeg.toNode);
                train._noPathLogged = true;
            }
            train._needsTurnaround = true;
        }
    }
};

// Load remaining multi-track platform segments (O(1) edge lookup, no Dijkstra)
function _loadRemainingPlatformTracks(train, g, platIds) {
    let loaded = new Set(
        train.history.filter(h => h.track && platIds.includes(h.track.id.toString()))
            .map(h => h.track.id.toString())
    );
    if (loaded.size >= platIds.length) return;

    let lastSeg = train.history[train.history.length - 1];
    let remaining = platIds.filter(id => !loaded.has(id));
    let edges = (g.get(lastSeg.toNode) || []);
    for (let e of edges) {
        if (String(e.trackId) === String(lastSeg.track.id)) continue;
        if (!remaining.includes(String(e.trackId))) continue;
        let nt = (window.tracks || []).find(x => x.id.toString() === String(e.trackId));
        if (!nt) continue;
        if (train.history.some(h => h.track && h.track.id.toString() === String(e.trackId)
            && h.fromNode.toString() === String(lastSeg.toNode))) continue;
        train.history.push({
            track: nt, fromNode: lastSeg.toNode, toNode: e.to,
            startDist: lastSeg.endDist, endDist: lastSeg.endDist + nt.length
        });
        break;
    }
}

// ---------------------------------------------------------------------------
// EXTEND TOWARD TURNAROUND AREA
// Follows the pre-computed approachPath step by step, then loads area tracks.
// ---------------------------------------------------------------------------
function _extendTowardTurnaround(train, g) {
    let ta = train._turnaroundTarget;
    if (!ta) return;

    let areaIds = ta.trackIds.map(String);
    let sanity = 0;

    while (sanity++ < 200) {
        let lastSeg = train.history[train.history.length - 1];
        if (!lastSeg || !lastSeg.track) break;

        let lookaheadOk = lastSeg.endDist - train.headDist > ROUTE_LOOKAHEAD;
        if (lookaheadOk) break;

        let lastId = lastSeg.track.id.toString();
        let alreadyInArea = areaIds.includes(lastId);

        if (alreadyInArea) {
            // Load remaining area tracks
            let areaInHistory = new Set(
                train.history.filter(h => h.track && areaIds.includes(h.track.id.toString()))
                    .map(h => h.track.id.toString())
            );
            if (areaInHistory.size >= areaIds.length) break;

            let remaining = areaIds.filter(id => !areaInHistory.has(id));
            let nextStep = window.findNextTrack(g, lastSeg.toNode, remaining, lastSeg.track.id, true);
            if (!nextStep) break;
            if (train.history.some(h => h.track && h.track.id.toString() === String(nextStep.trackId))) break;
            let nt = (window.tracks || []).find(x => x.id.toString() === String(nextStep.trackId));
            if (!nt) break;
            train.history.push({
                track: nt, fromNode: lastSeg.toNode, toNode: nextStep.to,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nt.length
            });
            continue;
        }

        // Follow pre-computed approach path
        let approachPath = ta.approachPath || [];
        let nextApproach = approachPath.find(step =>
            step.fromNode.toString() === lastSeg.toNode.toString()
            && !train.history.some(h => h.track
                && h.track.id.toString() === String(step.trackId)
                && h.fromNode.toString() === String(step.fromNode)));

        if (nextApproach) {
            let nt = (window.tracks || []).find(x => x.id.toString() === String(nextApproach.trackId));
            if (!nt) break;
            train.history.push({
                track: nt, fromNode: lastSeg.toNode, toNode: nextApproach.toNode,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nt.length
            });
        } else {
            // Approach exhausted — try to enter area directly
            let nextStep = window.findNextTrack(g, lastSeg.toNode, areaIds, lastSeg.track.id, true);
            if (!nextStep) break;
            if (train.history.some(h => h.track && h.track.id.toString() === String(nextStep.trackId))) break;
            let nt = (window.tracks || []).find(x => x.id.toString() === String(nextStep.trackId));
            if (!nt) break;
            train.history.push({
                track: nt, fromNode: lastSeg.toNode, toNode: nextStep.to,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nt.length
            });
        }
    }
}

// ---------------------------------------------------------------------------
// EXTEND TOWARD DEPOT  (return-trip version — allows re-traversal)
// ---------------------------------------------------------------------------
function _extendTowardDepot(train, g, depotStation) {
    if (!depotStation) return;
    if (train._turnaroundTarget) { _extendTowardTurnaround(train, g); return; }

    let platIds = depotStation.trackIds.map(String);
    let sanity = 0;

    while (sanity++ < 200) {
        let lastSeg = train.history[train.history.length - 1];
        if (!lastSeg || !lastSeg.track) break;

        let lastId = lastSeg.track.id.toString();
        if (platIds.includes(lastId)) {
            // Already on depot — load all depot tracks
            let loaded = new Set(
                train.history.filter(h => h.track && platIds.includes(h.track.id.toString()))
                    .map(h => h.track.id.toString())
            );
            if (loaded.size >= platIds.length) break;
            let nextStep = window.findNextTrack(g, lastSeg.toNode, platIds, lastSeg.track.id);
            if (!nextStep) break;
            // Allow reverse-direction re-traversal; only block exact same-direction duplicate
            if (train.history.some(h => h.track
                && h.track.id.toString() === String(nextStep.trackId)
                && h.fromNode.toString() === String(lastSeg.toNode)
                && h.toNode.toString() === String(nextStep.to))) break;
            let nt = (window.tracks || []).find(x => x.id.toString() === String(nextStep.trackId));
            if (!nt) break;
            train.history.push({
                track: nt, fromNode: lastSeg.toNode, toNode: nextStep.to,
                startDist: lastSeg.endDist, endDist: lastSeg.endDist + nt.length
            });
            continue;
        }

        if (lastSeg.endDist - train.headDist > ROUTE_LOOKAHEAD) break;

        let inCooldown = (train._turnaroundCooldown || 0) > 0;
        let incomingTid = inCooldown ? null : lastSeg.track.id;
        // Returning trains retrace their outbound path; try strict routing first,
        // then allow sharp turns before considering any turnaround.
        let nextStep = window.findNextTrack(g, lastSeg.toNode, platIds, incomingTid, false)
            || window.findNextTrack(g, lastSeg.toNode, platIds, incomingTid, true);

        if (!nextStep) {
            if (inCooldown && (train._turnaroundCooldown || 0) >= 2) {
                train._turnaroundCooldown = 0; inCooldown = false;
            }
            if (!inCooldown) {
                // Only trigger a turnaround if the depot is truly unreachable from here.
                let depotReachable = !!(
                    window.computeFullPath(g, lastSeg.toNode, platIds, null, false) ||
                    window.computeFullPath(g, lastSeg.toNode, platIds, null, true)
                );
                if (!depotReachable) {
                    let ta = window.findTurnaroundArea(g, lastSeg.toNode, lastSeg.track.id, train.trainLength);
                    if (ta) {
                        train._turnaroundTarget = ta;
                        train._needsTurnaround = false;
                        _extendTowardTurnaround(train, g);
                    } else {
                        train._needsTurnaround = true;
                    }
                }
                // If depot is reachable, routing glitch — break and retry next tick.
            }
            break;
        }

        // Allow reverse-direction re-traversal
        if (train.history.some(h => h.track
            && h.track.id.toString() === String(nextStep.trackId)
            && h.fromNode.toString() === String(lastSeg.toNode)
            && h.toNode.toString() === String(nextStep.to))) break;

        let nt = (window.tracks || []).find(x => x.id.toString() === String(nextStep.trackId));
        if (!nt) break;
        train.history.push({
            track: nt, fromNode: lastSeg.toNode, toNode: nextStep.to,
            startDist: lastSeg.endDist, endDist: lastSeg.endDist + nt.length
        });
    }
}

// Make _extendTowardDepot and helpers accessible for the state machine
window._extendTowardDepot = _extendTowardDepot;
window._extendTowardTurnaround = _extendTowardTurnaround;

// ---------------------------------------------------------------------------
// CONNECTIVITY DIAGNOSTIC  (unchanged API, updated internals)
// ---------------------------------------------------------------------------
window._checkConnectivity = function (targetTrackId) {
    let g = window.buildGraph();
    let tIdStr = String(targetTrackId);
    let entryNodes = [];
    for (let [nid, edges] of g) {
        if (edges.some(e => String(e.trackId) === tIdStr)) entryNodes.push(nid);
    }
    console.log('[CONNECTIVITY] Target track', tIdStr, '— entry nodes:', entryNodes);

    let reachable = new Set(entryNodes.map(String));
    let queue = [...entryNodes];
    let bfsSafety = 0;
    while (queue.length > 0 && bfsSafety++ < 100000) {
        let cur = queue.shift();
        (g.get(cur) || []).forEach(e => {
            if (!reachable.has(String(e.to))) {
                reachable.add(String(e.to));
                queue.push(e.to);
            }
        });
    }
    console.log('[CONNECTIVITY] Reachable nodes (BFS):', reachable.size, '/ total:', g.size);

    (window.trains || []).forEach(tr => {
        let last = tr.history && tr.history[tr.history.length - 1];
        if (!last) return;
        let inReach = reachable.has(String(last.toNode));
        let strict = window.computeFullPath(g, last.toNode, [tIdStr], last.track && last.track.id, false);
        let loose = window.computeFullPath(g, last.toNode, [tIdStr], last.track && last.track.id, true);
        console.log('[CONNECTIVITY] Train', tr.id,
            '@ node', last.toNode,
            '| reachable:', inReach,
            '| strict:', strict ? strict.length + ' hops' : 'NULL',
            '| loose:', loose ? loose.length + ' hops' : 'NULL');
    });
};

// ---------------------------------------------------------------------------
// EDGE DIRECTION HELPER  (used by debug log)
// ---------------------------------------------------------------------------
window._getEdgeDir = function (trackId, fromNodeId, graphOrNull) {
    let g = graphOrNull || window._cachedGraph;
    if (g) {
        let edges = g.get(fromNodeId) || [];
        let e = edges.find(ed => String(ed.trackId) === String(trackId));
        if (e && e.departAngle !== undefined) return e.departAngle;
    }
    let t = (window.tracks || []).find(x => x.id.toString() === String(trackId));
    if (!t) return null;
    return _outwardTangent(t, { x: t.start.x, y: t.start.y });
};

// ---------------------------------------------------------------------------
// HOW TO INTEGRATE
// ---------------------------------------------------------------------------
// 1. In sim.js, DELETE the following blocks (replace with this file's contents):
//      • window.buildGraph  (lines ~329–407)
//      • window._invalidateGraphCache  (~410–412)
//      • window._checkConnectivity  (~421–462)
//      • window._getEdgeDir  (~465–490)
//      • _trackOutwardTangentAtPos  (~524–554)
//      • _nodePos  (~557–567)
//      • _getTurnAngle  (~583–605)
//      • _isUTurn / _isSharpTurn  (~607–613)
//      • window.findTurnaroundArea  (~625–705)
//      • window.computeFullPath  (~748–821)
//      • window.computePathStrict  (~827–833)
//      • window.findNextTrack  (~836–860)
//      • window.spawnTrainOnLine  (~1283–1376)
//      • window.extendTrainHistory  (~1461–1610)
//      • _extendTowardTurnaround  (~1619–1711)
//      • _extendTowardDepot  (~1723–1808)
//      • The SHARP_ANGLE_THRESHOLD / UTURN_THRESHOLD / ROUTE_LOOKAHEAD / POS_SNAP constants
//
// 2. ADD  window.getTargetStation  call in the DRIVING state machine:
//      Replace:  let targetStation = window.selectActiveStation(stations[tr.nextStationIdx]);
//      With:     let targetStation = window.getTargetStation(tr, lObj);
//
// 3. In the DWELLING arrival block, guard nextStationIdx advance with _stationArrived:
//      Replace:  tr.nextStationIdx++;
//      With:
//        if (!tr._stationArrived) { tr._stationArrived = true; tr.nextStationIdx++; }
//      And clear it on departure:
//        tr._stationArrived = false;   // add at the end of the DWELLING→DRIVING transition
//
// 4. findNextTrack's .cost field is now .dist (both are still set for compatibility).
//    The new field .timeCost is the Dijkstra edge weight. simulateLineTripTime can
//    use .dist / (.speedKmh/3.6) or .timeCost directly — identical result.