// Road network: intersection graph, right-hand lane geometry, traffic-light phases,
// road queries (on-road test, nearest node, street names) and greedy route steps.
import { NODES_X, NODES_Y, ROAD_HALF, LANE_OFFSET, nodeX, nodeY, AVENUE_NAMES, STREET_NAMES, BLOCK, MARGIN } from './config.js';
import { clamp } from './mathutil.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N

export const nodeId = (i, j) => j * NODES_X + i;
export const nodeI = (id) => id % NODES_X;
export const nodeJ = (id) => Math.floor(id / NODES_X);
export const nodePos = (id) => ({ x: nodeX(nodeI(id)), y: nodeY(nodeJ(id)) });

export function neighbors(id) {
  const i = nodeI(id), j = nodeJ(id), out = [];
  for (const [dx, dy] of DIRS) {
    const ni = i + dx, nj = j + dy;
    if (ni >= 0 && nj >= 0 && ni < NODES_X && nj < NODES_Y) out.push(nodeId(ni, nj));
  }
  return out;
}

// Lane endpoints for travel from node a to node b, offset to the right-hand side.
export function laneSegment(a, b) {
  const A = nodePos(a), B = nodePos(b);
  const dx = Math.sign(B.x - A.x), dy = Math.sign(B.y - A.y);
  const nx = -dy, ny = dx;
  const inset = ROAD_HALF + 6;
  return {
    sx: A.x + dx * inset + nx * LANE_OFFSET, sy: A.y + dy * inset + ny * LANE_OFFSET,
    ex: B.x - dx * inset + nx * LANE_OFFSET, ey: B.y - dy * inset + ny * LANE_OFFSET,
    dx, dy, angle: Math.atan2(dy, dx),
  };
}

// Traffic lights: each intersection alternates east–west and north–south green.
const LIGHT_CYCLE = 16;
export function lightOffset(id) { return ((id * 7919) % 97) / 97 * LIGHT_CYCLE; }
export function lightState(id, time, horizontal) {
  const t = (time + lightOffset(id)) % LIGHT_CYCLE;
  if (horizontal) return t < 6.4 ? 'green' : t < 8 ? 'yellow' : 'red';
  return t < 8 ? 'red' : t < 14.4 ? 'green' : 'yellow';
}

export function nearestNode(x, y) {
  const i = clamp(Math.round((x - MARGIN) / BLOCK), 0, NODES_X - 1);
  const j = clamp(Math.round((y - MARGIN) / BLOCK), 0, NODES_Y - 1);
  return nodeId(i, j);
}

export function roadInfoAt(x, y) {
  const i = Math.round((x - MARGIN) / BLOCK), j = Math.round((y - MARGIN) / BLOCK);
  const inX = x >= nodeX(0) - ROAD_HALF && x <= nodeX(NODES_X - 1) + ROAD_HALF;
  const inY = y >= nodeY(0) - ROAD_HALF && y <= nodeY(NODES_Y - 1) + ROAD_HALF;
  const onH = inX && j >= 0 && j < NODES_Y && Math.abs(y - nodeY(j)) <= ROAD_HALF;
  const onV = inY && i >= 0 && i < NODES_X && Math.abs(x - nodeX(i)) <= ROAD_HALF;
  return { onH, onV, i, j, onRoad: onH || onV, intersection: onH && onV };
}

export function streetNameAt(x, y) {
  const r = roadInfoAt(x, y);
  if (r.intersection) return `${AVENUE_NAMES[r.i]} & ${STREET_NAMES[r.j]}`;
  if (r.onV) return AVENUE_NAMES[r.i];
  if (r.onH) return STREET_NAMES[r.j];
  const i = clamp(Math.round((x - MARGIN) / BLOCK), 0, NODES_X - 1);
  const j = clamp(Math.round((y - MARGIN) / BLOCK), 0, NODES_Y - 1);
  return Math.abs(x - nodeX(i)) < Math.abs(y - nodeY(j)) ? AVENUE_NAMES[i] : STREET_NAMES[j];
}

// Greedy next hop toward a target point (the grid has no holes, so greedy always arrives).
export function nextNodeToward(from, tx, ty, prev = -1) {
  let best = -1, bestD = Infinity;
  for (const n of neighbors(from)) {
    const p = nodePos(n);
    let d = Math.hypot(p.x - tx, p.y - ty);
    if (n === prev) d += BLOCK * 0.75;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

// Random lane edge whose midpoint lies within [minD, maxD] of (x, y).
export function randomEdgeNear(rng, x, y, minD, maxD, tries = 30) {
  for (let k = 0; k < tries; k++) {
    const a = nodeId(rng.int(0, NODES_X - 1), rng.int(0, NODES_Y - 1));
    const ns = neighbors(a);
    const b = ns[rng.int(0, ns.length - 1)];
    const A = nodePos(a), B = nodePos(b);
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const d = Math.hypot(mx - x, my - y);
    if (d >= minD && d <= maxD) return { a, b };
  }
  return null;
}

// Pick the outgoing edge from node `at` that continues straight / turns, avoiding U-turns.
export function chooseNextNode(rng, at, prev) {
  const ns = neighbors(at).filter((n) => n !== prev);
  if (!ns.length) return prev;
  // slight preference for going straight
  const P = nodePos(prev), A = nodePos(at);
  const dx = Math.sign(A.x - P.x), dy = Math.sign(A.y - P.y);
  const straight = ns.find((n) => { const q = nodePos(n); return Math.sign(q.x - A.x) === dx && Math.sign(q.y - A.y) === dy; });
  if (straight !== undefined && rng.chance(0.5)) return straight;
  return ns[rng.int(0, ns.length - 1)];
}
