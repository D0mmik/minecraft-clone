export class UsernameModal {
  show(): Promise<{ username: string }> {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:200;display:flex;justify-content:center;align-items:center;font-family:Courier New,monospace;';

      const box = document.createElement('div');
      box.style.cssText = 'background:#222;border:2px solid #555;padding:30px;text-align:center;min-width:320px;';

      const title = document.createElement('div');
      title.textContent = 'ClaudeCraft';
      title.style.cssText = 'color:#fff;font-size:24px;margin-bottom:20px;';

      // Name
      const nameLabel = document.createElement('div');
      nameLabel.textContent = 'Your name:';
      nameLabel.style.cssText = 'color:#aaa;font-size:13px;margin-bottom:6px;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 16;
      nameInput.placeholder = 'Steve';
      nameInput.style.cssText = 'width:100%;padding:8px;font-size:14px;font-family:Courier New,monospace;background:#111;color:#fff;border:1px solid #555;outline:none;text-align:center;';

      const btn = document.createElement('button');
      btn.textContent = 'Join Game';
      btn.style.cssText = 'margin-top:16px;padding:8px 24px;font-size:16px;font-family:Courier New,monospace;background:#4a4;color:#fff;border:none;cursor:pointer;';

      const submit = (): void => {
        const username = nameInput.value.trim() || 'Steve';
        backdrop.remove();
        resolve({ username });
      };

      btn.addEventListener('click', submit);
      nameInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submit(); });

      box.appendChild(title);
      box.appendChild(nameLabel);
      box.appendChild(nameInput);
      box.appendChild(btn);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      nameInput.focus();
    });
  }
}
