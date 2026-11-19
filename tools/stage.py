"""Stage the four press screenshots of Bahía Dorada by playing the game.

Every shot is produced by a real headless Chromium session that boots the game, sends
keyboard and mouse events exactly as a player would, waits until the frame looks right,
and then captures it. Nothing is drawn on top: the images are the game's own canvas.

usage:  python3 tools/stage.py <cover|city|mission|title|all> [out_dir]
Needs the game on http://localhost:8080/ (node serve.ts).
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

URL = 'http://localhost:8080/'
ARGS = ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']

# The autopilot lives in the page and only ever dispatches the same keydown/keyup events a
# keyboard produces. It reads the game state to decide which keys to hold, nothing else.
AUTOPILOT = r"""() => {
  if (window.__ap) return;
  const held = new Set();
  const key = (code, on) => {
    if (on && !held.has(code)) { held.add(code); window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
    else if (!on && held.has(code)) { held.delete(code); window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }
  };
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const ap = { mode: 'off', dx: 1, dy: 0, lane: 0, gas: 330, target: null, stuckT: 0, revT: 0 };
  ap.release = () => { for (const c of [...held]) key(c, false); };

  // Steer toward a point, hold the throttle, and dodge whatever sits in the lane ahead.
  function steer(v, tx, ty, want) {
    const now = performance.now() / 1000;
    if (ap.revT > now) {                       // reversing out of a wall or a jam
      key('KeyW', false); key('Space', false); key('KeyS', true);
      const err = wrap(Math.atan2(-ty + v.y, -tx + v.x) - v.a);
      key('KeyD', err > 0.05); key('KeyA', err < -0.05);
      return;
    }
    const st = window.__bd.state;
    const c = Math.cos(v.a), s = Math.sin(v.a);
    // how far the road is clear along each candidate lateral offset (weaving through traffic)
    const scan = (off, reach) => {
      let clear = reach;
      for (const o of st.vehicles) {
        if (o === v || o.wrecked) continue;
        const dx = o.x - v.x, dy = o.y - v.y, along = dx * c + dy * s;
        if (along < 6 || along > reach) continue;
        if (Math.abs(-dx * s + dy * c - off) < 32 && along < clear) clear = along;
      }
      for (const p of st.peds) {
        if (p.state === 'dead') continue;
        const dx = p.x - v.x, dy = p.y - v.y, along = dx * c + dy * s;
        if (along < 4 || along > reach) continue;
        if (Math.abs(-dx * s + dy * c - off) < 22 && along < clear) clear = along;
      }
      return clear;
    };
    let off = 0, gap = scan(0, 300);
    if (gap < 260) {
      for (const cand of [-96, -70, -46, 46, 70, 96, -128, 128]) {
        const clear = scan(cand, 300) - Math.abs(cand) * 0.35;
        if (clear > gap + 12) { gap = clear; off = cand; }
      }
    }
    let ex = tx + -s * off, ey = ty + c * off;
    const err = wrap(Math.atan2(ey - v.y, ex - v.x) - v.a);
    const sp = Math.hypot(v.vx, v.vy);
    const fwd = v.vx * c + v.vy * s;
    const dz = sp > 260 ? 0.03 : 0.06;
    key('KeyD', err > dz); key('KeyA', err < -dz);
    if (gap < 90) want = Math.min(want, Math.max(0, (gap - 26) * 2.8));
    if (Math.abs(err) > 0.75) want = Math.min(want, 175);
    key('KeyW', sp < want);
    key('KeyS', sp > want + 110);
    key('Space', Math.abs(err) > 0.45 && sp > 230);
    if (fwd < 14 && Math.abs(err) > 1.9) { key('KeyW', false); key('KeyS', true); }
    if (sp < 24) ap.stuckT += 1 / 60; else ap.stuckT = 0;
    if (ap.stuckT > 0.9) { ap.stuckT = 0; ap.revT = now + 0.8; }
  }

  function tick() {
    const s = window.__bd && window.__bd.state;
    if (s && s.mode === 'play' && !s.player.dead) {
      const pl = s.player;
      if (ap.mode === 'walk' && ap.target) {
        const t = ap.jack && !window.__bd.state.player.vehicle ? ap.jack : (typeof ap.target === 'function' ? ap.target() : ap.target);
        const dx = t.x - pl.x, dy = t.y - pl.y;
        key('KeyD', dx > 7); key('KeyA', dx < -7); key('KeyS', dy > 7); key('KeyW', dy < -7);
        if (!ap.jack && Math.hypot(dx, dy) < 12) { ap.release(); ap.mode = 'off'; }
      } else if (ap.mode === 'drive' && pl.vehicle) {
        const v = pl.vehicle;
        // steer at the hunt target if there is one, else at the lane centre ahead
        let tx, ty;
        if (ap.aim) {
          tx = ap.aim.x; ty = ap.aim.y;
          if (ap.stopAt && Math.hypot(tx - v.x, ty - v.y) < ap.stopAt) { ap.mode = 'hold'; ap.gas = 0; }
        } else {
          const ahead = 420;
          tx = ap.dx ? v.x + ap.dx * ahead : ap.lane;
          ty = ap.dy ? v.y + ap.dy * ahead : ap.lane;
        }
        if (ap.mode === 'drive') steer(v, tx, ty, ap.gas);
        else { key('KeyW', false); key('KeyA', false); key('KeyD', false); key('Space', false); key('KeyS', Math.hypot(v.vx, v.vy) > 18); }
      } else if (ap.mode === 'hold') {
        // keep the wheel straight and the engine on while the capture is taken
        key('KeyA', false); key('KeyD', false); key('KeyS', false);
        key('KeyW', pl.vehicle ? Math.hypot(pl.vehicle.vx, pl.vehicle.vy) < ap.gas : false);
      } else ap.release();
    }
    requestAnimationFrame(tick);
  }
  window.__ap = ap;
  requestAnimationFrame(tick);
}"""

INFO = """() => {
  const s = window.__bd.state, pl = s.player, me = pl.vehicle || pl, v = window.__bd.view, c = s.camera;
  const scr = (o) => ({ x: (o.x - c.x) * c.zoom + v.w / 2, y: (o.y - c.y) * c.zoom + v.h / 2 });
  const inFrame = (o) => { const q = scr(o); return q.x > 40 && q.x < v.w - 40 && q.y > 40 && q.y < v.h - 40; };
  const cops = s.vehicles.filter((o) => o.role === 'cop' && o.driver && !o.wrecked);
  const sp = Math.hypot(me.vx || 0, me.vy || 0) || 1, fx = (me.vx || 0) / sp, fy = (me.vy || 0) / sp;
  const rel = (o) => { const dx = o.x - me.x, dy = o.y - me.y; return { along: dx * fx + dy * fy, lat: Math.abs(-dx * fy + dy * fx) }; };
  const behind = cops.filter((o) => { const r = rel(o); return r.along < -40 && r.along > -420 && r.lat < 150 && inFrame(o); }).length;
  const near = cops.filter((o) => Math.hypot(o.x - me.x, o.y - me.y) < 420 && inFrame(o)).length;
  const smoke = s.particles.filter((p) => p.type === 'smoke' && Math.hypot(p.x - me.x, p.y - me.y) < 320).length;
  const blocked = s.vehicles.filter((o) => { if (o === pl.vehicle) return false; const r = rel(o); return r.along > 20 && r.along < 210 && r.lat < 40; }).length;
  const overlap = s.vehicles.filter((o) => o !== pl.vehicle && o !== pl && o.x && Math.hypot(o.x - me.x, o.y - me.y) < 62).length;
  return {
    mode: s.mode, wanted: s.wanted.level, seen: s.wanted.seen, units: s.wanted.units, inCar: !!pl.vehicle,
    car: pl.vehicle && pl.vehicle.type, speed: Math.round(Math.hypot(pl.vehicle ? pl.vehicle.vx : pl.vx, pl.vehicle ? pl.vehicle.vy : pl.vy)),
    carHp: pl.vehicle ? +(pl.vehicle.health / pl.vehicle.maxHealth).toFixed(2) : 0,
    flash: pl.vehicle ? +(pl.vehicle.flash || 0).toFixed(2) : 0,
    cops: cops.length, copsSee: near, behind, smoke, blocked, overlap,
    traffic: s.vehicles.filter((o) => o.driver && o.driver !== 'player' && o.role !== 'cop' && inFrame(o)).length,
    peds: s.peds.filter((p) => p.state !== 'dead' && inFrame(p)).length,
    mission: s.mission && s.mission.def.title, objective: s.mission && s.mission.objective,
    subtitle: !!s.subtitle, bigText: !!s.bigText, banner: !!s.districtToast, dead: pl.dead,
    hp: Math.round(pl.health), x: Math.round(me.x), y: Math.round(me.y), zoom: +c.zoom.toFixed(2),
  };
}"""


def launch(p):
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    return browser, page, errors


def info(page):
    return page.evaluate(INFO)


def wait(page, seconds):
    page.wait_for_timeout(int(seconds * 1000))


def boot(page, query, warm=3.0):
    page.goto(URL + query)
    wait(page, warm)
    page.evaluate(AUTOPILOT)
    wait(page, 0.3)
    return info(page)


def save(page, path):
    """Capture as JPEG under the gate's 256 KiB cap, stepping quality down only if needed."""
    for q in (88, 82, 74):
        page.screenshot(path=path, type='jpeg', quality=q)
        if os.path.getsize(path) <= 250 * 1024:
            break
    print('  saved', path, round(os.path.getsize(path) / 1024), 'KiB', json.dumps({k: v for k, v in info(page).items() if k in ('wanted', 'behind', 'copsSee', 'traffic', 'peds', 'speed', 'smoke', 'carHp')}), flush=True)


def carjack_near(page, x, y, radius=340, types=('muscle', 'sports', 'sedan', 'pickup', 'taxi', 'van')):
    """Walk to the nearest drivable car around a chosen corner and take it."""
    page.evaluate("""([types, x, y, radius]) => { const s = window.__bd.state;
      const onRoad = (o) => {
        const i = Math.round((o.x - 240) / 400), j = Math.round((o.y - 240) / 400);
        return Math.abs(o.x - (240 + i * 400)) < 74 || Math.abs(o.y - (240 + j * 400)) < 74;
      };
      const dist = (o) => Math.hypot(o.x - x, o.y - y);
      const v = s.vehicles.filter((o) => types.includes(o.type) && !o.wrecked && onRoad(o) && dist(o) < radius
          && o.role !== 'cop' && o.role !== 'roadblock' && o.role !== 'copParked')
        .sort((a, b) => dist(a) + types.indexOf(a.type) * 60 - (dist(b) + types.indexOf(b.type) * 60))[0];
      if (!v) return;
      window.__ap.jack = v; window.__ap.mode = 'walk'; window.__ap.target = { x: v.x, y: v.y };
    }""", [list(types), x, y, radius])
    for _ in range(90):
        wait(page, 0.14)
        if page.evaluate("() => { const v = window.__ap.jack, pl = window.__bd.state.player; return !v || Math.hypot(v.x - pl.x, v.y - pl.y) < 32; }"):
            break
    page.evaluate("() => { window.__ap.mode = 'off'; window.__ap.release(); }")
    for _ in range(5):
        page.keyboard.press('KeyE')
        wait(page, 0.7)
        if info(page)['inCar']:
            return True
    return False


def nearest_target(page, roles, maxd=340):
    return page.evaluate("""([roles, maxd]) => { const s = window.__bd.state, v = window.__bd.view, c = s.camera, pl = s.player;
      const me = pl.vehicle || pl;
      const t = s.peds.filter((p) => roles.includes(p.role) && p.state !== 'dead' && Math.hypot(p.x - me.x, p.y - me.y) < maxd)
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      if (!t) return null;
      return [(t.x - c.x) * c.zoom + v.w / 2, (t.y - c.y) * c.zoom + v.h / 2]; }""", [list(roles), maxd])


def shoot(page, roles, seconds, maxd=340):
    t0 = time.time()
    while time.time() - t0 < seconds:
        aim = nearest_target(page, roles, maxd)
        if aim:
            page.mouse.move(aim[0], aim[1])
            page.mouse.down()
        else:
            page.mouse.up()
        wait(page, 0.12)
    page.mouse.up()


def lane_point(page, heading, index):
    """World point on the right-hand lane of a street, for heading e/w/n/s and grid index."""
    MARGIN, BLOCK, OFFSET = 240, 400, 22
    if heading in ('e', 'w'):
        y = MARGIN + index * BLOCK + (OFFSET if heading == 'e' else -OFFSET)
        return {'x': 0, 'y': y}
    x = MARGIN + index * BLOCK + (OFFSET if heading == 'n' else -OFFSET)
    return {'x': x, 'y': 0}


def drive(page, heading, index, seconds=0, gas=330, dry=False):
    """Hold the wheel in one lane: heading e/w/n/s along street/avenue `index`."""
    p = lane_point(page, heading, index)
    dx = {'e': 1, 'w': -1}.get(heading, 0)
    dy = {'s': 1, 'n': -1}.get(heading, 0)
    lane = p['y'] if dx else p['x']
    page.evaluate("([dx, dy, lane, gas]) => { const ap = window.__ap; ap.mode = 'drive'; ap.dx = dx; ap.dy = dy; ap.lane = lane; ap.gas = gas; ap.aim = null; }", [dx, dy, lane, gas])
    if not dry:
        wait(page, seconds)


def cover(page, out):
    # The chase photo scene sets the pose (four stars, a cruiser pack on the bumper, the
    # helicopter up); from there the car is driven at full throttle with real key events,
    # with short handbrake flicks for tyre smoke, and the frame is taken once it all lines up.
    boot(page, '?scene=chase', 4.0)
    if not info(page)['inCar']:
        print('  no car in the chase scene'); return False
    best, t0 = -1, time.time()
    page.keyboard.down('KeyW')
    while time.time() - t0 < 22:
        i = info(page)
        score = (i['behind'] * 4 + i['copsSee'] * 2 + i['wanted'] * 2 + i['speed'] * 0.06
                 + min(i['traffic'], 10) + min(i['peds'], 16) * 0.3 + min(i['smoke'], 10) * 0.5
                 - i['blocked'] * 3 - i['overlap'] * 4)
        if (i['wanted'] >= 3 and i['seen'] and i['behind'] >= 2 and i['speed'] > 225
                and i['carHp'] > 0.55 and i['smoke'] >= 1 and i['flash'] == 0 and not i['dead'] and score > best):
            best = score
            save(page, os.path.join(out, '1-chase.jpg'))
            print('  candidate score', round(score, 1), flush=True)
            if score > 42:
                break
        # a short handbrake stab lays rubber and throws smoke without losing the lead
        if int(time.time() - t0) % 3 == 0:
            page.keyboard.down('Space')
            wait(page, 0.14)
            page.keyboard.up('Space')
        wait(page, 0.2)
    page.keyboard.up('KeyW')
    return best > 0


# ---------------------------------------------------------------------------------------------
def city(page, out):
    # the photo scene starts Sol at the wheel of a Rayo GT in Centro; the cruise itself is driven
    boot(page, '?scene=city', 5.0)
    if not info(page)['inCar']:
        print('  city scene did not start in a car'); return False
    drive(page, 's', 8, gas=225, dry=True)
    heading = 's'
    best, t0 = -1, time.time()
    while time.time() - t0 < 60:
        i = info(page)
        if heading == 's' and i['y'] > 1960:
            heading = 'n'; drive(page, 'n', 8, gas=225, dry=True)
        elif heading == 'n' and i['y'] < 700:
            heading = 's'; drive(page, 's', 8, gas=225, dry=True)
        score = min(i['traffic'], 14) * 2.2 + min(i['peds'], 40) * 0.45 + (7 if i['speed'] > 110 else 0)
        if i['wanted'] == 0 and i['speed'] > 90 and i['traffic'] >= 9 and i['peds'] >= 18 and score > best and not i['bigText'] and not i['banner']:
            best = score
            save(page, os.path.join(out, '2-city.jpg'))
            print('  candidate score', round(score, 1), flush=True)
            if score > 44:
                return True
        wait(page, 0.35)
    return best > 0


# ---------------------------------------------------------------------------------------------
def mission(page, out):
    # Mission 3 in progress: the photo scene puts Sol's Toro on the cab's bumper, then the
    # throttle and the wheel are worked for real until the frame has everything on it.
    boot(page, '?scene=mission', 3.0)
    print('  mission', info(page)['mission'], info(page)['objective'], flush=True)
    drive(page, 'e', 7, gas=430, dry=True)
    best, t0 = -1, time.time()
    while time.time() - t0 < 40:
        i = info(page)
        if not i['mission']:
            print('  mission ended'); break
        taxi = page.evaluate("""() => { const s = window.__bd.state, m = s.mission, t = m && m.tags.flaco, v = s.player.vehicle;
          return t && v ? { d: Math.hypot(t.x - v.x, t.y - v.y), hp: +(t.health / t.maxHealth).toFixed(2) } : null; }""")
        if not taxi:
            wait(page, 0.3); continue
        score = (10 if taxi['d'] < 260 else 0) + min(i['traffic'], 10) + min(i['peds'], 18) * 0.35 + i['speed'] * 0.03
        if (taxi['d'] < 320 and i['speed'] > 120 and i['x'] < 3300 and score > best and not i['bigText']
                and not i['subtitle'] and not i['banner'] and i['flash'] == 0):
            best = score
            save(page, os.path.join(out, '3-mission.jpg'))
            print('  candidate score', round(score, 1), 'cab', round(taxi['d']), flush=True)
            if taxi['d'] < 250:
                return True
        wait(page, 0.25)
    return best > 0


# ---------------------------------------------------------------------------------------------
def title(page, out):
    page.goto(URL)
    wait(page, 4.5)
    save(page, os.path.join(out, '4-title.jpg'))
    return True


STEPS = {'cover': cover, 'city': city, 'mission': mission, 'title': title}


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    out = sys.argv[2] if len(sys.argv) > 2 else 'screenshots'
    os.makedirs(out, exist_ok=True)
    names = list(STEPS) if which == 'all' else which.split(',')
    errors = []
    with sync_playwright() as p:
        for name in names:
            ok = False
            for attempt in range(4 if name == 'cover' else 2):
                browser, page, errs = launch(p)
                try:
                    ok = STEPS[name](page, out)
                finally:
                    browser.close()
                errors += errs
                print(name, 'OK' if ok else 'MISS', 'attempt', attempt, flush=True)
                if ok:
                    break
    print(json.dumps({'errors': errors[:30], 'count': len(errors)}, indent=1))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
