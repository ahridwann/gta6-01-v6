// Keyboard, mouse and touch input. Held keys give steering/throttle; one-shot
// presses (confirm, pause, enter car, melee, shoot, crew, nitro tap) are queued
// as bit flags and taken once by the loop, so a press between frames is never
// lost and never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MELEE = 8;
export const ACTION_SHOOT = 16;
export const ACTION_CREW_Z = 32;
export const ACTION_CREW_X = 64;
export const ACTION_CREW_C = 128;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'nitro', ShiftRight: 'nitro',
  Space: 'brake',
};

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, nitro: false, brake: false };
  let actions = 0;
  let mouseDX = 0;

  window.addEventListener('keydown', (event) => {
    const k = KEYMAP[event.code];
    if (k) { held[k] = true; event.preventDefault(); return; }
    if (event.repeat) return;
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_MELEE;
    else if (event.code === 'KeyG') actions |= ACTION_SHOOT;
    else if (event.code === 'KeyZ') actions |= ACTION_CREW_Z;
    else if (event.code === 'KeyX') actions |= ACTION_CREW_X;
    else if (event.code === 'KeyC') actions |= ACTION_CREW_C;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const k = KEYMAP[event.code];
    if (k) held[k] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
  });
  target.addEventListener('pointerdown', (e) => {
    actions |= ACTION_CONFIRM;
    mouseDX = e.clientX;
  });
  // Mouse drag steers on foot; click confirms on menus.
  target.addEventListener('pointermove', (e) => {
    if (e.buttons) mouseDX = e.clientX - mouseDX;
  });

  return {
    held,
    takeMouseDX() { const d = mouseDX; mouseDX = 0; return d; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
