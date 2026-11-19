"""Reorder each module's import statements so the dossier's depth-first load-order walk lists
the gameplay systems (story, missions, police, traffic, vehicles, peds, combat…) before the
rendering internals. Behaviour is unchanged: ES module imports are hoisted and order-free here."""
import re
import sys
from pathlib import Path

PRIORITY = ['config', 'story', 'missions', 'police', 'traffic', 'vehicles', 'peds', 'combat', 'player',
            'economy', 'activities', 'pickups', 'save', 'hud', 'minimap', 'menus', 'world', 'roads', 'audio', 'music',
            'state', 'mathutil', 'input', 'fx', 'camera', 'render', 'lighting', 'cityground', 'buildings',
            'sprites', 'textures', 'markers', 'scenes']
IMPORT = re.compile(r"import[^;]*?from '\./([a-z_]+)\.js';\n", re.S)


def rank(name):
    return PRIORITY.index(name) if name in PRIORITY else len(PRIORITY)


if len(sys.argv) != 2:
    sys.exit(__doc__ + '\nusage: python3 tools/order_imports.py <game/src>')


for path in sorted(Path(sys.argv[1]).glob('*.js')):
    src = path.read_text()
    matches = list(IMPORT.finditer(src))
    if not matches:
        continue
    start, end = matches[0].start(), matches[-1].end()
    block = src[start:end]
    if IMPORT.sub('', block).strip():
        print('skip (non-import code between imports):', path.name)
        continue
    stmts = sorted((m.group(0) for m in matches), key=lambda s: rank(IMPORT.match(s).group(1)))
    out = src[:start] + ''.join(stmts) + src[end:]
    if out != src:
        path.write_text(out)
        print('reordered', path.name)
