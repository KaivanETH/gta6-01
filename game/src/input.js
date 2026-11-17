// Keyboard and mouse input: held keys, per-frame key presses, mouse position/buttons and wheel.

const held = new Set();
const pressed = new Set();
const mouse = { x: 640, y: 360, down: false, clicked: false, rightDown: false, moved: 0, wheel: 0 };
let onFirstGesture = null;

export function initInput(canvas, firstGesture) {
  onFirstGesture = firstGesture;
  const gesture = () => { if (onFirstGesture) { const f = onFirstGesture; onFirstGesture = null; f(); } };
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
    gesture();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
    mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
  };
  canvas.addEventListener('mousemove', (e) => { toCanvas(e); mouse.moved = 1.5; });
  canvas.addEventListener('mousedown', (e) => {
    toCanvas(e);
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; } else if (e.button === 2) mouse.rightDown = true;
    gesture();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; else if (e.button === 2) mouse.rightDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}

export const isDown = (code) => held.has(code);
export const wasPressed = (code) => pressed.has(code);
export const anyPressed = (...codes) => codes.some((c) => pressed.has(c));
export const anyDown = (...codes) => codes.some((c) => held.has(c));
export const getMouse = () => mouse;

// Called once per rendered frame after all systems have read their input.
export function endInputFrame(dt) {
  pressed.clear();
  mouse.clicked = false;
  mouse.wheel = 0;
  mouse.moved = Math.max(0, mouse.moved - dt);
}

// Movement axes shared by walking and driving.
export function moveAxes() {
  const x = (anyDown('KeyD', 'ArrowRight') ? 1 : 0) - (anyDown('KeyA', 'ArrowLeft') ? 1 : 0);
  const y = (anyDown('KeyS', 'ArrowDown') ? 1 : 0) - (anyDown('KeyW', 'ArrowUp') ? 1 : 0);
  return { x, y };
}
