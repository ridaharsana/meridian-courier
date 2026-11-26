// input.js — keyboard and mouse into one stick-and-throttle object.

export function createInput() {
  return {
    pitch: 0, roll: 0, yaw: 0,
    throttleDelta: 0, throttleSet: null,
    brakes: false,
    keys: new Set(),
    mouseDrag: null,
    toggles: [],
  };
}

export function attachInput(input, element) {
  const down = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) {
      input.keys.add(e.code);
      if (e.code === 'KeyG') input.toggles.push('gear');
      if (e.code === 'KeyX') input.toggles.push('smoke');
      if (e.code === 'KeyC') input.toggles.push('camera');
      if (e.code === 'KeyM') input.toggles.push('mission');
      if (e.code === 'Enter') input.toggles.push('confirm');
      if (e.code === 'KeyP') input.toggles.push('pause');
    }
  };
  const up = (e) => input.keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);

  element.addEventListener('pointerdown', (e) => {
    input.mouseDrag = { x: e.clientX, y: e.clientY };
    input.toggles.push('confirm');
  });
  window.addEventListener('pointermove', (e) => {
    if (!input.mouseDrag) return;
    input.mouseRoll = clampUnit((e.clientX - input.mouseDrag.x) / 130);
    input.mousePitch = clampUnit((e.clientY - input.mouseDrag.y) / 130);
  });
  window.addEventListener('pointerup', () => {
    input.mouseDrag = null;
    input.mouseRoll = 0;
    input.mousePitch = 0;
  });
  element.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheelThrottle = clampUnit((input.wheelThrottle || 0) - Math.sign(e.deltaY) * 0.09);
    input.throttleSet = (input.wheelThrottle + 1) / 2;
  }, { passive: false });
}

// Read once per frame: held keys become stick deflections.
export function readInput(input) {
  const k = input.keys;
  let pitch = 0;
  let roll = 0;
  let yaw = 0;
  if (k.has('ArrowDown')) pitch += 1;
  if (k.has('ArrowUp')) pitch -= 1;
  if (k.has('ArrowLeft') || k.has('KeyA')) roll -= 1;
  if (k.has('ArrowRight') || k.has('KeyD')) roll += 1;
  if (k.has('KeyQ')) yaw -= 1;
  if (k.has('KeyE')) yaw += 1;
  if (input.mouseDrag) {
    roll += input.mouseRoll || 0;
    pitch += input.mousePitch || 0;
  }
  let throttleDelta = 0;
  if (k.has('KeyW')) throttleDelta += 1;
  if (k.has('KeyS')) throttleDelta -= 1;
  if (throttleDelta !== 0) input.throttleSet = null;
  const out = {
    pitch: clampUnit(pitch),
    roll: clampUnit(roll),
    yaw: clampUnit(yaw),
    throttleDelta,
    throttleSet: input.throttleSet,
    brakes: k.has('KeyB'),
    toggles: input.toggles.splice(0),
  };
  return out;
}

function clampUnit(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
