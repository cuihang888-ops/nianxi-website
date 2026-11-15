(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.AnheliPreviewRoads = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const WIDTH = 4, PRICE_PER_UNIT = 2, MAX_SEGMENTS = 128;
  const MIN_LENGTH = 2, MAX_LENGTH = 80, SNAP_DISTANCE = 8, HOME_ACCESS_DISTANCE = 20;
  const EPSILON = 1e-7;
  const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.z);
  const copyPoint = value => ({ x: value.x, z: value.z });
  const length = road => Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z);
  const roadCost = road => Math.ceil(length(road)) * PRICE_PER_UNIT;
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  const exactKeys = (value, keys) => plain(value) && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable && Object.hasOwn(descriptor, "value");
    });

  function validPlayerRoad(road) {
    return exactKeys(road, ["a", "b"]) && [road.a, road.b].every(p => exactKeys(p, ["x", "z"]) && point(p))
      && length(road) >= MIN_LENGTH && length(road) <= MAX_LENGTH;
  }

  function validatePlayerRoads(roads) {
    return Array.isArray(roads) && roads.length <= MAX_SEGMENTS
      && Reflect.ownKeys(roads).length === roads.length + 1
      && Array.from({ length: roads.length }, (_, i) => Object.getOwnPropertyDescriptor(roads, String(i)))
        .every(descriptor => descriptor?.enumerable && Object.hasOwn(descriptor, "value"))
      && roads.every(validPlayerRoad);
  }

  function projectPoint(p, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, square = dx * dx + dz * dz;
    const t = square ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / square)) : 0;
    const position = { x: a.x + dx * t, z: a.z + dz * t };
    return { point: position, distance: Math.hypot(p.x - position.x, p.z - position.z) };
  }

  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  function segmentsIntersect(a, b, c, d) {
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
      && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
    return (Math.abs(abC) <= EPSILON && projectPoint(c, a, b).distance <= EPSILON)
      || (Math.abs(abD) <= EPSILON && projectPoint(d, a, b).distance <= EPSILON)
      || (Math.abs(cdA) <= EPSILON && projectPoint(a, c, d).distance <= EPSILON)
      || (Math.abs(cdB) <= EPSILON && projectPoint(b, c, d).distance <= EPSILON);
  }

  function segmentDistance(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(projectPoint(a, c, d).distance, projectPoint(b, c, d).distance,
      projectPoint(c, a, b).distance, projectPoint(d, a, b).distance);
  }

  function pointInPolygon(p, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i];
      if (projectPoint(p, a, b).distance <= EPSILON) return true;
      if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }

  function polygonSegmentDistance(polygon, a, b) {
    if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return 0;
    return Math.min(...polygon.map((p, index) => segmentDistance(a, b, p, polygon[(index + 1) % polygon.length])));
  }

  function publicSegments(roads) {
    const output = [];
    for (const road of roads || []) {
      if (!Array.isArray(road?.points) || !Number.isFinite(road.width) || road.width <= 0) continue;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i];
        if (point(a) && point(b) && Math.hypot(b.x - a.x, b.z - a.z) > EPSILON) {
          output.push({ a: copyPoint(a), b: copyPoint(b), width: road.width, source: "public" });
        }
      }
    }
    return output;
  }

  function connectedNetwork(roads, playerRoads, roots) {
    const segments = publicSegments(roads).concat((playerRoads || []).filter(validPlayerRoad).map(road => ({
      a: copyPoint(road.a), b: copyPoint(road.b), width: WIDTH, source: "player",
    })));
    const connected = new Set();
    for (let i = 0; i < segments.length; i++) {
      if ((roots || []).some(p => point(p) && projectPoint(p, segments[i].a, segments[i].b).distance <= EPSILON)) connected.add(i);
    }
    const queue = [...connected];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = segments[queue[cursor]];
      for (let i = 0; i < segments.length; i++) if (!connected.has(i)
        && segmentsIntersect(current.a, current.b, segments[i].a, segments[i].b)) {
        connected.add(i); queue.push(i);
      }
    }
    return segments.filter((_, i) => connected.has(i));
  }

  function nearestRoadPoint(p, network) {
    if (!point(p)) return null;
    let best = null;
    for (const road of network) {
      const candidate = projectPoint(p, road.a, road.b);
      if (!best || candidate.distance < best.distance) best = { ...candidate, road };
    }
    return best;
  }

  function checkCorridor(road, environment) {
    const half = WIDTH / 2, margin = half + 0.5, bounds = environment.bounds;
    // The ellipse is convex. Keeping both endpoint discs inside it also keeps
    // the full road capsule inside; the smaller radius gives a conservative bound.
    if (!bounds || [road.a, road.b].some(p => Math.hypot(p.x / bounds.rx, p.z / bounds.rz)
      + half / Math.min(bounds.rx, bounds.rz) > 1 + EPSILON)) return { ok: false, reason: "bounds" };
    for (const [circles, reason] of [[environment.waters, "water"], [environment.solids, "solid"], [environment.areas, "site"]]) {
      for (const circle of circles || []) if (projectPoint(circle, road.a, road.b).distance <= (circle.r ?? circle.radius) + margin) {
        return { ok: false, reason };
      }
    }
    for (const [polygons, reason] of [[environment.plots, "taken"], [environment.protected, "site"]]) {
      for (const polygon of polygons || []) if (polygonSegmentDistance(polygon, road.a, road.b) <= margin) return { ok: false, reason };
    }
    return { ok: true };
  }

  function quoteRoad(start, end, network, playerRoads, environment) {
    if (!point(start) || !point(end)) return { ok: false, reason: "invalid" };
    if (playerRoads.length >= MAX_SEGMENTS) return { ok: false, reason: "road-limit" };
    const snap = nearestRoadPoint(start, network);
    if (!snap || snap.distance > SNAP_DISTANCE + EPSILON) return { ok: false, reason: "road-disconnected" };
    const road = { a: copyPoint(snap.point), b: copyPoint(end) }, distance = length(road);
    if (distance < MIN_LENGTH) return { ok: false, reason: "road-too-short" };
    if (distance > MAX_LENGTH) return { ok: false, reason: "road-too-long" };
    if (network.some(existing => projectPoint(road.a, existing.a, existing.b).distance <= EPSILON
      && projectPoint(road.b, existing.a, existing.b).distance <= EPSILON)) return { ok: false, reason: "road-duplicate" };
    const checked = checkCorridor(road, environment);
    return checked.ok ? { ok: true, road, length: distance } : checked;
  }

  function homeRoadAccess(footprint, network) {
    let distance = Infinity;
    for (const road of network) distance = Math.min(distance,
      Math.max(0, polygonSegmentDistance(footprint, road.a, road.b) - road.width / 2));
    return distance <= HOME_ACCESS_DISTANCE + EPSILON ? { ok: true, distance } : { ok: false, reason: "road-access", distance };
  }

  return Object.freeze({ WIDTH, PRICE_PER_UNIT, MAX_SEGMENTS, MIN_LENGTH, MAX_LENGTH, SNAP_DISTANCE, HOME_ACCESS_DISTANCE,
    validPlayerRoad, validatePlayerRoads, validateRoads: validatePlayerRoads, length, roadLength: length, roadCost,
    projectPoint, segmentDistance, polygonSegmentDistance,
    publicSegments, connectedNetwork, nearestRoadPoint, checkCorridor, quoteRoad, homeRoadAccess });
});
