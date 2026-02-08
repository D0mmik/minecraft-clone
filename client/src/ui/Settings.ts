export interface KeyBindings {
  sprint: string;
  sneak: string;
}

const STORAGE_KEY = 'claudecraft_keybinds';
const DEFAULTS: KeyBindings = { sprint: 'ControlLeft', sneak: 'ShiftLeft' };

export function loadBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.sprint && parsed.sneak) return parsed as KeyBindings;
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveBindings(bindings: KeyBindings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

export function formatKeyCode(code: string): string {
  if (code === 'Space') return 'Space';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'AltLeft') return 'L-Alt';
  if (code === 'AltRight') return 'R-Alt';
  if (code === 'MetaLeft') return 'L-Meta';
  if (code === 'MetaRight') return 'R-Meta';
  if (code === 'Tab') return 'Tab';
  if (code === 'CapsLock') return 'CapsLock';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'Enter') return 'Enter';
  if (code === 'Escape') return 'Escape';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}

export class SettingsModal {
  show(): Promise<KeyBindings> {
    return new Promise((resolve) => {
      const bindings = loadBindings();

      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:200;display:flex;justify-content:center;align-items:center;font-family:Courier New,monospace;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#222;border:2px solid #555;padding:30px;text-align:center;min-width:320px;';

      const title = document.createElement('div');
      title.textContent = 'Key Bindings';
      title.style.cssText = 'color:#fff;font-size:24px;margin-bottom:20px;';
      box.appendChild(title);

      let activeListener: ((e: KeyboardEvent) => void) | null = null;

      const createRow = (label: string, key: 'sprint' | 'sneak'): void => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';

        const lbl = document.createElement('div');
        lbl.textContent = label;
        lbl.style.cssText = 'color:#aaa;font-size:14px;';

        const btn = document.createElement('button');
        btn.textContent = formatKeyCode(bindings[key]);
        btn.style.cssText = 'padding:6px 16px;font-size:14px;font-family:Courier New,monospace;background:#333;color:#fff;border:1px solid #555;cursor:pointer;min-width:100px;';

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Remove any previous listener
          if (activeListener) {
            document.removeEventListener('keydown', activeListener, true);
          }
          btn.textContent = 'Press a key...';
          btn.style.borderColor = '#4a4';

          activeListener = (ev: KeyboardEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            document.removeEventListener('keydown', activeListener!, true);
            activeListener = null;
            bindings[key] = ev.code;
            btn.textContent = formatKeyCode(ev.code);
            btn.style.borderColor = '#555';
          };
          document.addEventListener('keydown', activeListener, true);
        });

        row.appendChild(lbl);
        row.appendChild(btn);
        box.appendChild(row);
      };

      createRow('Sprint', 'sprint');
      createRow('Sneak', 'sneak');

      const doneBtn = document.createElement('button');
      doneBtn.textContent = 'Done';
      doneBtn.style.cssText = 'margin-top:16px;padding:8px 24px;font-size:16px;font-family:Courier New,monospace;background:#4a4;color:#fff;border:none;cursor:pointer;';

      doneBtn.addEventListener('click', () => {
        if (activeListener) {
          document.removeEventListener('keydown', activeListener, true);
          activeListener = null;
        }
        saveBindings(bindings);
        backdrop.remove();
        resolve(bindings);
      });

      box.appendChild(doneBtn);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);
    });
  }
}
