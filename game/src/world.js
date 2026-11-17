// City generation for Bahía Dorada: districts, blocks, building lots, parks, beach, harbor piers,
// props (palms, trees, lamps), parking spots, landmarks and the solid-rectangle spatial hash.
import {
  BLOCK, NODES_X, NODES_Y, ROAD_HALF, SIDEWALK, nodeX, nodeY, COAST_X, HARBOR_Y, HARBOR_X,
  WORLD_W, WORLD_H, DISTRICTS, MARGIN,
} from './config.js';
import { makeRng, pointInRect } from './mathutil.js';

const HASH_CELL = 200;

export function districtOfBlock(bi, bj) {
  if ((bi === 5 || bi === 6) && bj === 3) return 'parque';
  if (bj >= 8 && bi >= 6) return 'muelles';
  if (bi >= 9) return 'playa';
  if (bi >= 4 && bj <= 5) return 'centro';
  if (bi >= 3 && bj >= 4) return 'rosa';
  if (bi === 3 && bj < 4) return 'centro';
  return 'lomas';
}

export function districtAt(x, y) {
  if (x > nodeX(NODES_X - 1)) return y > nodeY(8) - ROAD_HALF ? 'muelles' : 'playa';
  const bi = Math.max(0, Math.min(NODES_X - 2, Math.floor((x - MARGIN) / BLOCK)));
  const bj = Math.max(0, Math.min(NODES_Y - 2, Math.floor((y - MARGIN) / BLOCK)));
  return districtOfBlock(bi, bj);
}

// The sidewalk-inclusive rectangle and the inner lot rectangle of block (bi, bj).
export function blockRect(bi, bj) {
  const x = nodeX(bi) + ROAD_HALF, y = nodeY(bj) + ROAD_HALF;
  return { x, y, w: BLOCK - ROAD_HALF * 2, h: BLOCK - ROAD_HALF * 2 };
}
export function lotRect(bi, bj) {
  const b = blockRect(bi, bj);
  return { x: b.x + SIDEWALK, y: b.y + SIDEWALK, w: b.w - SIDEWALK * 2, h: b.h - SIDEWALK * 2 };
}

const PASTELS = ['#f7a8b8', '#9ee6cf', '#a8d8f7', '#fff1a8', '#d7b8f3', '#ffc8a2', '#b8f2e6', '#fcd5ce'];
const GLASS = ['#5aa9c9', '#3f7fa8', '#6cc0c9', '#8fb8d8', '#4d8c9e', '#9ac6d6'];
const CONCRETE = ['#e8e1d3', '#d9d2c3', '#f1ece2', '#c9c3b8'];
const WAREHOUSE = ['#b5543c', '#3d7a7a', '#8a8f96', '#c98a3a', '#5f6f8a'];
const CONTAINER = ['#d64545', '#2f7fc1', '#e8a33d', '#3aa36b', '#8e44ad', '#e86f3d', '#2c3e50'];
const TERRACOTTA = ['#c8643c', '#b5552f', '#d9774b', '#a84b2a'];
const NEON_WORDS = {
  rosa: ['CAFÉ SOL', 'BAR OLA', 'TACOS', 'BODEGA', 'SALSA', 'LUNA', 'PANADERÍA', 'CUMBIA'],
  playa: ['HOTEL', 'MOTEL', 'SURF', 'MARISCOS', 'CORAL INN', 'TIKI'],
  centro: ['BANCO', 'CASINO', 'NEÓN', 'TORRE', 'DORADA'],
};
const NEON_COLORS = ['#ff4fd8', '#3cf2ff', '#ff5a5a', '#ffe14d', '#7dff6a', '#b37dff'];

export function generateWorld(seed = 2026) {
  const R = makeRng(seed);
  const world = {
    w: WORLD_W, h: WORLD_H,
    buildings: [], solids: [], props: [], parking: [], blocks: [], decor: [],
    piers: [], ships: [], cranes: [], landmarks: {}, hash: new Map(),
  };

  const addBuilding = (b) => {
    b.id = world.buildings.length;
    world.buildings.push(b);
    world.solids.push(b);
    return b;
  };

  for (let bj = 0; bj < NODES_Y - 1; bj++) {
    for (let bi = 0; bi < NODES_X - 1; bi++) {
      const district = districtOfBlock(bi, bj);
      const block = { bi, bj, district, rect: blockRect(bi, bj), lot: lotRect(bi, bj), kind: 'normal' };
      world.blocks.push(block);
      const L = block.lot;
      switch (district) {
        case 'centro': genTowers(R, world, block, L, addBuilding); break;
        case 'playa': genHotels(R, world, block, L, addBuilding); break;
        case 'muelles': genDocks(R, world, block, L, addBuilding); break;
        case 'lomas': genHouses(R, world, block, L, addBuilding); break;
        case 'rosa': genShops(R, world, block, L, addBuilding); break;
        case 'parque': genPark(R, world, block, L); break;
      }
      genStreetLamps(world, block);
    }
  }

  genCoast(R, world);
  genHarbor(R, world, addBuilding);
  genEdgeGreenery(R, world);
  placeLandmarks(world);

  // world border walls
  const T = 60;
  world.solids.push({ x: -T, y: -T, w: WORLD_W + T * 2, h: T, border: true });
  world.solids.push({ x: -T, y: WORLD_H, w: WORLD_W + T * 2, h: T, border: true });
  world.solids.push({ x: -T, y: 0, w: T, h: WORLD_H, border: true });
  world.solids.push({ x: WORLD_W, y: 0, w: T, h: WORLD_H, border: true });

  for (const s of world.solids) hashInsert(world, s);
  return world;
}

function hashInsert(world, s) {
  const x0 = Math.floor(s.x / HASH_CELL), x1 = Math.floor((s.x + s.w) / HASH_CELL);
  const y0 = Math.floor(s.y / HASH_CELL), y1 = Math.floor((s.y + s.h) / HASH_CELL);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const k = cx + cy * 4096;
    let list = world.hash.get(k);
    if (!list) { list = []; world.hash.set(k, list); }
    list.push(s);
  }
}

export function solidsNear(world, x, y) {
  return world.hash.get(Math.floor(x / HASH_CELL) + Math.floor(y / HASH_CELL) * 4096) || EMPTY;
}
const EMPTY = [];

export function isWater(world, x, y) {
  if (x > COAST_X + Math.sin(y * 0.01) * 14) return !onPier(world, x, y);
  if (y > HARBOR_Y) return !onPier(world, x, y);
  return false;
}
function onPier(world, x, y) {
  for (const p of world.piers) if (pointInRect(x, y, p)) return true;
  return false;
}

// Solid test for a point: buildings, containers, ships, border and open water.
export function solidAt(world, x, y) {
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return true;
  const list = solidsNear(world, x, y);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  }
  if (isWater(world, x, y)) return 'water';
  return null;
}

// Coarse line-of-sight test: steps along the segment checking solids that block sight (not water).
export function lineOfSight(world, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d / 18);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    const list = solidsNear(world, x, y);
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (s.ht > 8 && x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
function genTowers(R, world, block, L, add) {
  const pattern = R.int(0, 3);
  const pad = 14;
  const towers = [];
  if (pattern === 0) {
    towers.push({ x: L.x + 30, y: L.y + 30, w: L.w - 60, h: L.h - 60 });
  } else if (pattern === 1) {
    const sw = (L.w - pad * 3) / 2;
    towers.push({ x: L.x + pad, y: L.y + pad, w: sw, h: L.h - pad * 2 });
    towers.push({ x: L.x + pad * 2 + sw, y: L.y + pad + 40, w: sw, h: L.h - pad * 2 - 40 });
  } else if (pattern === 2) {
    const s = (L.w - pad * 3) / 2;
    for (let k = 0; k < 4; k++) {
      if (k === 3 && R.chance(0.5)) { block.plaza = { x: L.x + pad * 2 + s, y: L.y + pad * 2 + s, w: s, h: s }; continue; }
      towers.push({ x: L.x + pad + (k % 2) * (s + pad), y: L.y + pad + Math.floor(k / 2) * (s + pad), w: s, h: s });
    }
  } else {
    // parking lot + one slim tower
    towers.push({ x: L.x + pad, y: L.y + pad, w: 110, h: L.h - pad * 2 });
    block.parkingLot = { x: L.x + 140, y: L.y + 10, w: L.w - 150, h: L.h - 20 };
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      if (R.chance(0.55)) world.parking.push({ x: L.x + 162 + c * 34, y: L.y + 40 + r * 60, a: Math.PI / 2 * (R.chance(0.5) ? 1 : -1), lot: true });
    }
  }
  block.ground = 'plaza';
  for (const t of towers) {
    const glass = R.chance(0.6);
    const base = glass ? R.pick(GLASS) : R.pick(CONCRETE);
    const roofType = R.pick(['helipad', 'ac', 'garden', 'ac', 'pool', 'antenna']);
    const b = add({
      ...t, ht: R.range(90, 210), district: 'centro', style: 'tower', glass,
      base, roof: glass ? '#cfd8dc' : R.pick(['#bfb8aa', '#d6cfc0', '#a9a39a']), roofType,
      windows: glass ? '#bfeaff' : '#5b6c7a',
    });
    if (R.chance(0.35)) b.neon = { text: R.pick(NEON_WORDS.centro), color: R.pick(NEON_COLORS) };
  }
  world.props.push({ type: 'palm', x: L.x + 6, y: L.y + 6, r: 12, ht: 26 });
  world.props.push({ type: 'palm', x: L.x + L.w - 6, y: L.y + L.h - 6, r: 12, ht: 26 });
}

function genHotels(R, world, block, L, add) {
  block.ground = 'resort';
  const two = R.chance(0.5);
  const parts = two
    ? [{ x: L.x + 10, y: L.y + 10, w: L.w - 20, h: 100 }, { x: L.x + 10, y: L.y + L.h - 110, w: 120, h: 100 }]
    : [{ x: L.x + 20, y: L.y + 16, w: 150, h: L.h - 32 }];
  for (const p of parts) {
    const b = add({
      ...p, ht: R.range(55, 125), district: 'playa', style: 'hotel', base: R.pick(PASTELS),
      roof: '#f4efe6', roofType: R.chance(0.6) ? 'pool' : 'deck', windows: '#3e7d9c', balconies: true,
    });
    if (R.chance(0.7)) b.neon = { text: R.pick(NEON_WORDS.playa), color: R.pick(NEON_COLORS) };
  }
  // courtyard pool and palms
  const pool = two ? { x: L.x + 150, y: L.y + 130, w: 90, h: 50 } : { x: L.x + 190, y: L.y + 40, w: 50, h: 120 };
  world.decor.push({ type: 'pool', ...pool });
  for (let k = 0; k < 4; k++) world.props.push({ type: 'palm', x: L.x + R.range(20, L.w - 20), y: L.y + R.range(20, L.h - 20), r: 12, ht: 30, soft: true });
}

function genDocks(R, world, block, L, add) {
  block.ground = 'yard';
  const big = R.chance(0.6) || (block.bi === 9 && block.bj === 10);
  const roof = R.pick(['#b8432f', '#1f7a8c', '#dfe3e6', '#d97b29', '#5d7b93', '#3f8f6b']);
  const label = block.bi === 8 && block.bj === 9 ? 'TIBURÓN' : String(block.bi * 10 + block.bj).padStart(2, '0');
  if (big) {
    add({
      x: L.x + 10, y: L.y + 10, w: L.w - 20, h: 120, ht: R.range(26, 40), district: 'muelles', style: 'warehouse',
      base: R.pick(WAREHOUSE), roof, roofType: 'corrugated', windows: '#333', label,
    });
  } else {
    add({
      x: L.x + 10, y: L.y + 10, w: 120, h: L.h - 20, ht: R.range(26, 40), district: 'muelles', style: 'warehouse',
      base: R.pick(WAREHOUSE), roof, roofType: 'corrugated', windows: '#333', label,
    });
  }
  // container stacks in the yard
  const yard = big ? { x: L.x + 10, y: L.y + 145, w: L.w - 20, h: L.h - 155 } : { x: L.x + 145, y: L.y + 10, w: L.w - 155, h: L.h - 20 };
  block.yard = yard;
  const horiz = yard.w > yard.h;
  // two staggered rows of container stacks with aisles between them
  for (let row = 0; row < 2; row++) {
    const n = horiz ? 3 : 4;
    for (let k = 0; k < n; k++) {
      if (R.chance(0.22)) continue;
      const c = horiz
        ? { x: yard.x + 6 + k * 80 + row * 22, y: yard.y + 8 + row * 62, w: 58, h: 24 }
        : { x: yard.x + 8 + row * 48, y: yard.y + 6 + k * 58 + row * 18, w: 24, h: 50 };
      const col = R.pick(CONTAINER);
      add({ ...c, ht: R.pick([12, 14, 26]), district: 'muelles', style: 'container', base: col, roof: col, roofType: 'container', windows: '#000' });
    }
  }
  if (R.chance(0.6)) world.parking.push({ x: yard.x + yard.w - 30, y: yard.y + yard.h - 30, a: R.range(0, 6.28), lot: true, prefer: 'pickup' });
}

function genHouses(R, world, block, L, add) {
  block.ground = 'lawn';
  const half = L.w / 2;
  for (let k = 0; k < 4; k++) {
    const qx = L.x + (k % 2) * half, qy = L.y + Math.floor(k / 2) * half;
    const top = k < 2;
    const hw = R.range(58, 78), hh = R.range(48, 62);
    const hx = qx + (half - hw) / 2 + R.range(-8, 8);
    const hy = top ? qy + 14 : qy + half - hh - 14;
    const color = R.pick(PASTELS);
    add({
      x: hx, y: hy, w: hw, h: hh, ht: R.range(16, 24), district: 'lomas', style: 'house', base: color,
      roof: R.pick(TERRACOTTA.concat(['#6d6d74', '#8a6a5a'])), roofType: 'gable', windows: '#556',
    });
    // backyard pool, tree, driveway car
    if (R.chance(0.5)) world.decor.push({ type: 'pool', x: qx + 20, y: top ? hy + hh + 18 : qy + 16, w: 44, h: 26 });
    world.props.push({ type: 'tree', x: qx + R.range(16, half - 16), y: top ? qy + half - 20 : qy + 22, r: R.range(14, 20), ht: 22 });
    if (R.chance(0.45)) {
      const px = qx + (k % 2 === 0 ? 14 : half - 14);
      world.parking.push({ x: px, y: top ? qy + 40 : qy + half - 40, a: Math.PI / 2, lot: true });
    }
  }
}

function genShops(R, world, block, L, add) {
  block.ground = 'tiles';
  const cols = 3, rows = 3, gap = 10;
  const cw = (L.w - gap * (cols + 1)) / cols, ch = (L.h - gap * (rows + 1)) / rows;
  const skip = R.int(0, 8);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const idx = r * cols + c;
    const x = L.x + gap + c * (cw + gap), y = L.y + gap + r * (ch + gap);
    if (idx === 4 || idx === skip) {
      world.props.push({ type: 'tree', x: x + cw / 2, y: y + ch / 2, r: 18, ht: 22 });
      continue;
    }
    const b = add({
      x, y, w: cw, h: ch, ht: R.range(24, 48), district: 'rosa', style: 'shop', base: R.pick(PASTELS),
      roof: R.pick(TERRACOTTA.concat(['#e9e3d5'])), roofType: R.chance(0.5) ? 'tile' : 'flat', windows: '#4a3a3a',
      awning: R.pick(['#e63946', '#2ec4b6', '#ffbe0b', '#3a86ff', '#ff006e']),
    });
    if ((r === 0 || r === 2 || c === 0 || c === 2) && R.chance(0.45)) b.neon = { text: R.pick(NEON_WORDS.rosa), color: R.pick(NEON_COLORS) };
  }
}

function genPark(R, world, block, L) {
  block.ground = 'park';
  world.decor.push({ type: 'fountain', x: L.x + L.w / 2 - 34, y: L.y + L.h / 2 - 34, w: 68, h: 68 });
  world.solids.push({ x: L.x + L.w / 2 - 26, y: L.y + L.h / 2 - 26, w: 52, h: 52, ht: 4, fountain: true });
  for (let k = 0; k < 14; k++) {
    const x = L.x + R.range(14, L.w - 14), y = L.y + R.range(14, L.h - 14);
    if (Math.abs(x - (L.x + L.w / 2)) < 30 || Math.abs(y - (L.y + L.h / 2)) < 30) continue;
    world.props.push({ type: R.chance(0.3) ? 'palm' : 'tree', x, y, r: R.range(14, 22), ht: 24 });
  }
  world.parkZones = world.parkZones || [];
  world.parkZones.push(L);
}

function genStreetLamps(world, block) {
  const b = block.rect;
  for (let t = 0.2; t < 1; t += 0.6) {
    world.props.push({ type: 'lamp', x: b.x + b.w * t, y: b.y + 6, r: 3, ht: 30 });
    world.props.push({ type: 'lamp', x: b.x + b.w * t, y: b.y + b.h - 6, r: 3, ht: 30 });
  }
  if (block.district === 'playa' && block.bi === NODES_X - 2) {
    for (let t = 0.1; t < 1; t += 0.27) world.props.push({ type: 'palm', x: b.x + b.w - 8, y: b.y + b.h * t, r: 12, ht: 30 });
  }
}

function genCoast(R, world) {
  // Beach: palms, umbrellas, towels and a lifeguard tower along Paseo del Mar.
  const sandX = nodeX(NODES_X - 1) + ROAD_HALF + SIDEWALK;
  world.beach = { x: sandX, y: 0, w: COAST_X - sandX, h: nodeY(8) };
  for (let y = 120; y < nodeY(8) - 80; y += 46) {
    world.props.push({ type: 'palm', x: sandX + 14 + R.range(-4, 4), y, r: 12, ht: 32 });
    if (R.chance(0.7)) world.decor.push({ type: 'umbrella', x: sandX + R.range(90, 250), y: y + R.range(-10, 10), color: R.pick(['#ff4f7b', '#2ec4b6', '#ffc93c', '#3a86ff', '#ff8c42']) });
    if (R.chance(0.5)) world.decor.push({ type: 'towel', x: sandX + R.range(80, 240), y: y + R.range(0, 30), color: R.pick(['#ffffff', '#ff4f7b', '#3cf2ff', '#ffe14d']) });
  }
  for (let y = 300; y < nodeY(8) - 200; y += 900) world.decor.push({ type: 'lifeguard', x: sandX + 180, y });
  // beach-side parking bays along Paseo del Mar
  world.beachPads = [];
  for (let y = 360; y < nodeY(8) - 120; y += 400) {
    world.beachPads.push({ x: sandX + 16, y: y - 21, w: 70, h: 110 });
    for (let k = 0; k < 3; k++) world.parking.push({ x: sandX + 50, y: y + k * 34, a: 0, lot: true, prefer: k === 1 ? 'sports' : undefined });
  }
  // southern shore sand strip west of the harbor
  world.southShore = { x: 0, y: nodeY(NODES_Y - 1) + ROAD_HALF + SIDEWALK, w: HARBOR_X, h: HARBOR_Y - (nodeY(NODES_Y - 1) + ROAD_HALF + SIDEWALK) };
}

function genHarbor(R, world, add) {
  const quayY = nodeY(NODES_Y - 1) + ROAD_HALF + SIDEWALK;
  world.quay = { x: HARBOR_X, y: quayY, w: COAST_X - HARBOR_X, h: HARBOR_Y - quayY };
  const piers = [nodeX(7) - 60, nodeX(9) - 60];
  for (const px of piers) {
    world.piers.push({ x: px, y: HARBOR_Y - 4, w: 120, h: 420 });
    world.cranes.push({ x: px + 60, y: HARBOR_Y + 120, a: R.range(-0.4, 0.4) });
  }
  // a cargo ship moored between the piers and another east of the last pier
  const ships = [
    { x: nodeX(7) + 90, y: HARBOR_Y + 40, w: 150, h: 380, color: '#24435e' },
    { x: nodeX(9) + 90, y: HARBOR_Y + 60, w: 130, h: 330, color: '#8c2b2b' },
  ];
  for (const s of ships) {
    world.ships.push(s);
    world.solids.push({ ...s, ht: 30, ship: true });
  }
  for (let k = 0; k < 5; k++) world.cranes.push({ x: HARBOR_X + 140 + k * 260, y: quayY + 40, a: 0, small: true });
  // finale boat at the end of the eastern pier
  world.landmarks.pierEnd = { x: nodeX(9), y: HARBOR_Y + 380, name: 'Muelle 9' };
}

function genEdgeGreenery(R, world) {
  // trees on the western and northern hills, and the southern shore
  for (let k = 0; k < 140; k++) {
    const side = R.int(0, 2);
    let x, y;
    if (side === 0) { x = R.range(20, MARGIN - ROAD_HALF - 30); y = R.range(20, HARBOR_Y - 20); }
    else if (side === 1) { x = R.range(20, COAST_X - 340); y = R.range(20, MARGIN - ROAD_HALF - 30); }
    else { x = R.range(20, HARBOR_X - 40); y = R.range(world.southShore.y + 20, HARBOR_Y - 30); if (R.chance(0.6)) continue; }
    world.props.push({ type: side === 2 ? 'palm' : 'tree', x, y, r: R.range(16, 26), ht: 24 });
  }
}

function placeLandmarks(world) {
  const front = (bi, bj, side = 'n') => {
    const b = blockRect(bi, bj);
    if (side === 'n') return { x: b.x + b.w / 2, y: b.y + SIDEWALK / 2 };
    if (side === 's') return { x: b.x + b.w / 2, y: b.y + b.h - SIDEWALK / 2 };
    if (side === 'w') return { x: b.x + SIDEWALK / 2, y: b.y + b.h / 2 };
    return { x: b.x + b.w - SIDEWALK / 2, y: b.y + b.h / 2 };
  };
  const road = (i, j, dx, dy) => ({ x: nodeX(i) + dx * BLOCK / 2, y: nodeY(j) + dy * BLOCK / 2 });
  world.landmarks.cafe = { ...front(4, 7, 'n'), name: 'Café La Ramona' };
  world.landmarks.safehouse = { ...front(2, 5, 'e'), name: 'Casa Brisa (Safehouse)' };
  world.landmarks.gunshop = { ...front(5, 8, 'w'), name: 'Armería La Palma' };
  world.landmarks.garage = { ...road(3, 9, 0, 1), name: 'Garaje Solera' };
  world.landmarks.club = { ...front(9, 4, 'w'), name: 'Club Marea' };
  world.landmarks.penthouse = { ...front(6, 1, 's'), name: 'Torre Brisa Penthouse' };
  world.landmarks.warehouse = { ...front(8, 9, 'n'), name: 'Bodega Tiburón' };
  world.landmarks.lighthouse = { x: COAST_X - 60, y: 160, name: 'Faro Dorado' };
  world.landmarks.hospital = { ...front(4, 2, 'w'), name: 'Hospital San Lucía' };
  world.landmarks.policeHQ = { ...front(7, 6, 'n'), name: 'Comisaría Central' };
  world.landmarks.beach = { x: world.beach.x + 150, y: nodeY(5), name: 'Playa Coral' };
  world.landmarks.stakeout = { ...road(8, 8, 1, 0), name: 'Calle Ancla' };
  const yb = world.blocks.find((b) => b.bi === 9 && b.bj === 10);
  const yard = yb.yard || yb.lot;
  world.landmarks.dockyard = { x: yard.x + yard.w / 2, y: yard.y + yard.h / 2, name: 'Patio Tiburón' };
  world.landmarks.villa = { ...front(0, 1, 'e'), name: 'Villa Varela' };
}

export function describeDistrict(id) { return DISTRICTS[id] || DISTRICTS.centro; }
