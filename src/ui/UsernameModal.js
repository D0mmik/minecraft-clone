export class UsernameModal {
  show() {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:200;display:flex;justify-content:center;align-items:center;font-family:Courier New,monospace;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#222;border:2px solid #555;padding:30px;text-align:center;min-width:320px;';

      const title = document.createElement('div');
      title.textContent = 'Minecraft Clone';
      title.style.cssText = 'color:#fff;font-size:24px;margin-bottom:20px;';

      const inputStyle = 'width:100%;padding:8px;font-size:14px;font-family:Courier New,monospace;background:#111;color:#fff;border:1px solid #555;outline:none;text-align:center;';

      // Name
      const nameLabel = document.createElement('div');
      nameLabel.textContent = 'Your name:';
      nameLabel.style.cssText = 'color:#aaa;font-size:13px;margin-bottom:6px;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 16;
      nameInput.placeholder = 'Steve';
      nameInput.style.cssText = inputStyle;

      // Server address
      const serverLabel = document.createElement('div');
      serverLabel.textContent = 'Server address:';
      serverLabel.style.cssText = 'color:#aaa;font-size:13px;margin-top:14px;margin-bottom:6px;';

      const serverInput = document.createElement('input');
      serverInput.type = 'text';
      serverInput.placeholder = 'localhost:3001';
      serverInput.style.cssText = inputStyle;

      const hint = document.createElement('div');
      hint.textContent = 'Leave blank for local server';
      hint.style.cssText = 'color:#666;font-size:11px;margin-top:4px;';

      const btn = document.createElement('button');
      btn.textContent = 'Join Game';
      btn.style.cssText = 'margin-top:16px;padding:8px 24px;font-size:16px;font-family:Courier New,monospace;background:#4a4;color:#fff;border:none;cursor:pointer;';

      const submit = () => {
        const username = nameInput.value.trim() || 'Steve';
        const serverRaw = serverInput.value.trim();
        backdrop.remove();
        resolve({ username, server: serverRaw });
      };

      btn.addEventListener('click', submit);
      const onEnter = (e) => { if (e.key === 'Enter') submit(); };
      nameInput.addEventListener('keydown', onEnter);
      serverInput.addEventListener('keydown', onEnter);

      box.appendChild(title);
      box.appendChild(nameLabel);
      box.appendChild(nameInput);
      box.appendChild(serverLabel);
      box.appendChild(serverInput);
      box.appendChild(hint);
      box.appendChild(btn);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      nameInput.focus();
    });
  }
}
