"""Headless play-test for Bahía Dorada.

Opens the game served by `node serve.ts`, records every console error and page error,
drives it with scripted keyboard/mouse input and saves screenshots.

usage: python3 tools/playtest.py <mode> [out_dir]
  modes: smoke   — title screen, new game, skip intro, walk, steal a car, drive (≈40 s)
         long    — ≥3 minutes of scripted play: driving, carjacking, combat, wanted chase,
                   the first missions, pause menu save/load
         shots   — stage the press screenshots via ?scene=… presets
"""
import json
import sys
import time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8080/'


def launch(p):
    browser = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    return browser, page, errors


def hold(page, keys, seconds):
    for k in keys:
        page.keyboard.down(k)
    page.wait_for_timeout(int(seconds * 1000))
    for k in keys:
        page.keyboard.up(k)


def tap(page, key, wait=0.15):
    page.keyboard.press(key)
    page.wait_for_timeout(int(wait * 1000))


def info(page):
    return page.evaluate("""() => { const s = window.__bd.state; const pl = s.player;
      return { mode: s.mode, cash: s.cash, wanted: s.wanted.level, inCar: !!pl.vehicle, car: pl.vehicle && pl.vehicle.type,
        x: Math.round(pl.x), y: Math.round(pl.y), hp: Math.round(pl.health), cars: s.vehicles.length, peds: s.peds.length,
        mission: s.mission && s.mission.def.title, objective: s.mission && s.mission.objective, next: s.story.next,
        dead: pl.dead, fps: 0 }; }""")


def smoke(page, out):
    page.goto(URL)
    page.wait_for_timeout(2500)
    page.screenshot(path=f'{out}/smoke-title.png')
    tap(page, 'Enter', 1.0)          # New Game
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{out}/smoke-intro.png')
    tap(page, 'Enter', 1.0)          # skip intro
    print('after intro', info(page))
    hold(page, ['KeyW'], 1.5)
    hold(page, ['KeyD'], 1.0)
    page.screenshot(path=f'{out}/smoke-walk.png')
    # walk to the nearest car and steal it
    page.evaluate("""() => { const s = window.__bd.state; const pl = s.player;
      let best = null, bd = 1e12; for (const v of s.vehicles) { const d = (v.x-pl.x)**2 + (v.y-pl.y)**2; if (d < bd) { bd = d; best = v; } }
      pl.x = best.x + 30; pl.y = best.y; }""")
    tap(page, 'KeyE', 1.2)
    print('after E', info(page))
    hold(page, ['KeyW'], 3.0)
    hold(page, ['KeyW', 'KeyA'], 1.0)
    hold(page, ['KeyW'], 2.0)
    page.screenshot(path=f'{out}/smoke-drive.png')
    print('after drive', info(page))


def long_play(page, out):
    page.goto(URL)
    page.wait_for_timeout(2000)
    t0 = time.time()
    tap(page, 'Enter', 1.0)
    tap(page, 'Enter', 1.0)
    print('start', info(page))
    # 1) walk around, punch a pedestrian, steal a car
    hold(page, ['KeyS'], 1.0)
    for _ in range(6):
        tap(page, 'Space', 0.2)
    page.evaluate("""() => { const s = window.__bd.state; const pl = s.player;
      const v = s.vehicles.filter(v => v.driver && v.driver !== 'player').sort((a,b)=>((a.x-pl.x)**2+(a.y-pl.y)**2)-((b.x-pl.x)**2+(b.y-pl.y)**2))[0];
      if (v) { pl.x = v.x + 20; pl.y = v.y + 20; v.vx = v.vy = 0; } }""")
    tap(page, 'KeyE', 1.5)
    print('jacked', info(page))
    # 2) drive aggressively for a while
    for i in range(8):
        hold(page, ['KeyW'], 2.0)
        hold(page, ['KeyW', 'KeyD' if i % 2 else 'KeyA'], 0.7)
        hold(page, ['KeyW', 'Space', 'KeyA'], 0.4)
    page.screenshot(path=f'{out}/long-1-drive.png')
    print('drove', info(page))
    # 3) crime spree -> wanted level, chase
    page.evaluate("() => { const s = window.__bd.state; s.player.weapons.pistol = true; s.player.ammo.pistol = 200; s.player.weapon = 'pistol'; }")
    tap(page, 'KeyE', 0.8)
    for _ in range(25):
        page.mouse.move(640 + 80, 360 + 20)
        page.mouse.down(); page.wait_for_timeout(120); page.mouse.up()
    page.evaluate("() => { const s = window.__bd.state; const m = s.wanted; if (m.level < 3) { m.heat = 200; m.level = 3; } }")
    page.evaluate("""() => { const s = window.__bd.state; const pl = s.player;
      const v = s.vehicles.filter(v => !v.wrecked && v.driver !== 'player').sort((a,b)=>((a.x-pl.x)**2+(a.y-pl.y)**2)-((b.x-pl.x)**2+(b.y-pl.y)**2))[0];
      if (v) { pl.x = v.x + 20; pl.y = v.y + 20; v.vx = v.vy = 0; } }""")
    tap(page, 'KeyE', 1.5)
    for i in range(10):
        hold(page, ['KeyW'], 1.6)
        hold(page, ['KeyW', 'KeyD' if i % 3 else 'KeyA'], 0.6)
        if i == 4:
            page.screenshot(path=f'{out}/long-2-chase.png')
            print('chase', info(page))
    print('after chase', info(page))
    # 4) let the cops catch us (busted/wasted cycle), then wait
    page.wait_for_timeout(9000)
    print('after wait', info(page))
    # 5) missions: teleport to the giver and run the first two missions with scripted help
    page.evaluate("() => { const s = window.__bd.state; window.__bd.state.wanted.level = 0; const L = s.world.landmarks.cafe; if (s.player.vehicle) { s.player.vehicle.x = L.x; s.player.vehicle.y = L.y + 30; s.player.vehicle.vx = s.player.vehicle.vy = 0; } else { s.player.x = L.x; s.player.y = L.y; } }")
    page.wait_for_timeout(1500)
    for _ in range(8):
        tap(page, 'Enter', 0.4)
    page.wait_for_timeout(1500)
    print('mission1', info(page))
    page.evaluate("() => { const s = window.__bd.state; s.wanted.level = 0; const L = s.world.landmarks.cafe; const me = s.player.vehicle || s.player; me.x = L.x; me.y = L.y; }")
    page.wait_for_timeout(1500)
    for _ in range(4):
        tap(page, 'Enter', 0.4)
    print('mission2', info(page))
    page.screenshot(path=f'{out}/long-3-mission.png')
    # steal the Rayo GT
    page.evaluate("""() => { const s = window.__bd.state; const m = s.mission; if (!m) return; const v = m.tags.rayo; if (!v) return;
      if (s.player.vehicle) { s.player.vehicle.driver = null; s.player.vehicle = null; }
      s.player.x = v.x + 22; s.player.y = v.y; }""")
    tap(page, 'KeyE', 1.2)
    print('in rayo', info(page))
    hold(page, ['KeyW'], 3)
    page.evaluate("() => { const s = window.__bd.state; const L = s.world.landmarks.garage; const v = s.player.vehicle; if (v) { v.x = L.x; v.y = L.y; v.vx = v.vy = 0; } }")
    page.wait_for_timeout(1500)
    for _ in range(4):
        tap(page, 'Enter', 0.4)
    print('mission2 done?', info(page))
    # 6) pause menu: save, mission log, map, options, back
    tap(page, 'Escape', 0.6)
    page.screenshot(path=f'{out}/long-4-pause.png')
    tap(page, 'ArrowDown', 0.2); tap(page, 'ArrowDown', 0.2)
    tap(page, 'Enter', 0.8)
    page.screenshot(path=f'{out}/long-5-log.png')
    tap(page, 'Escape', 0.3)
    tap(page, 'ArrowUp', 0.2)
    tap(page, 'Enter', 0.8)
    page.screenshot(path=f'{out}/long-6-map.png')
    tap(page, 'Escape', 0.3)
    tap(page, 'Escape', 0.3)
    print('back in game', info(page))
    # 7) shop + safehouse
    page.evaluate("() => { const s = window.__bd.state; if (s.player.vehicle) { s.player.vehicle.driver = null; s.player.vehicle = null; } s.cash += 5000; const L = s.world.landmarks.gunshop; s.player.x = L.x; s.player.y = L.y; }")
    page.wait_for_timeout(500)
    tap(page, 'KeyE', 0.6)
    page.screenshot(path=f'{out}/long-7-shop.png')
    tap(page, 'Enter', 0.4); tap(page, 'ArrowDown', 0.2); tap(page, 'Enter', 0.4)
    tap(page, 'Escape', 0.4)
    page.evaluate("() => { const s = window.__bd.state; const L = s.world.landmarks.safehouse; s.player.x = L.x; s.player.y = L.y; }")
    page.wait_for_timeout(500)
    tap(page, 'KeyE', 0.6)
    tap(page, 'Enter', 0.6)
    print('saved', page.evaluate("() => !!localStorage.getItem('bahia_dorada_save_v1')"))
    # 8) keep playing until 3+ minutes have passed: free driving with gunfire
    page.evaluate("""() => { const s = window.__bd.state; const pl = s.player;
      const v = s.vehicles.filter(v => !v.wrecked).sort((a,b)=>((a.x-pl.x)**2+(a.y-pl.y)**2)-((b.x-pl.x)**2+(b.y-pl.y)**2))[0];
      if (v) { pl.x = v.x + 20; pl.y = v.y + 20; v.vx = v.vy = 0; } }""")
    tap(page, 'KeyE', 1.2)
    i = 0
    while time.time() - t0 < 200:
        hold(page, ['KeyW'], 1.8)
        hold(page, ['KeyW', 'KeyD' if i % 2 else 'KeyA'], 0.5)
        if i % 5 == 0:
            tap(page, 'Tab', 0.2)
        i += 1
    page.screenshot(path=f'{out}/long-8-end.png')
    print('end', info(page), 'elapsed', round(time.time() - t0))
    # 9) quit to title and continue from the save
    tap(page, 'Escape', 0.5)
    for _ in range(7):
        tap(page, 'ArrowDown', 0.1)
    tap(page, 'Enter', 1.5)
    tap(page, 'ArrowDown', 0.2)
    tap(page, 'Enter', 1.5)
    print('continued', info(page))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'smoke'
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/bd'
    import os
    os.makedirs(out, exist_ok=True)
    with sync_playwright() as p:
        browser, page, errors = launch(p)
        if mode == 'smoke':
            smoke(page, out)
        elif mode == 'long':
            long_play(page, out)
        browser.close()
    print(json.dumps({'errors': errors[:30], 'count': len(errors)}, indent=1))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
