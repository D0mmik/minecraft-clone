export class ChatUI {
  isOpen: boolean;
  onSend: ((message: string) => void) | null;
  domElement: HTMLElement | null;

  private container: HTMLDivElement;
  private log: HTMLDivElement;
  private inputRow: HTMLDivElement;
  private input: HTMLInputElement;
  private _fadeTimers: ReturnType<typeof setTimeout>[];

  constructor() {
    this.isOpen = false;
    this.onSend = null;
    this.domElement = null;

    // Container
    this.container = document.createElement('div');
    this.container.style.cssText = 'position:fixed;bottom:60px;left:10px;z-index:50;font-family:Courier New,monospace;pointer-events:none;';

    // Message log
    this.log = document.createElement('div');
    this.log.style.cssText = 'max-height:200px;overflow:hidden;margin-bottom:4px;';
    this.container.appendChild(this.log);

    // Input row (hidden by default)
    this.inputRow = document.createElement('div');
    this.inputRow.style.cssText = 'display:none;pointer-events:auto;';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 200;
    this.input.placeholder = 'Type a message...';
    this.input.style.cssText = 'width:350px;padding:4px 8px;font-size:13px;font-family:Courier New,monospace;background:rgba(0,0,0,0.7);color:#fff;border:1px solid #555;outline:none;';
    this.inputRow.appendChild(this.input);
    this.container.appendChild(this.inputRow);

    document.body.appendChild(this.container);

    // Input event handlers
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation(); // prevent game keys
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (text && this.onSend) this.onSend(text);
        this.close();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    this._fadeTimers = [];
  }

  open(): void {
    this.isOpen = true;
    this.inputRow.style.display = 'block';
    this.input.value = '';
    this.input.focus();
    // Exit pointer lock so user can type
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  close(): void {
    this.isOpen = false;
    this.inputRow.style.display = 'none';
    this.input.blur();
    // Re-lock pointer to resume game
    if (this.domElement) {
      this.domElement.requestPointerLock();
    }
  }

  addMessage(text: string, color?: string): void {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `color:${color || '#fff'};font-size:13px;text-shadow:1px 1px 0 #000;padding:1px 0;`;
    this.log.appendChild(div);

    // Keep max 50 messages
    while (this.log.children.length > 50) {
      this.log.removeChild(this.log.firstChild!);
    }

    // Scroll to bottom
    this.log.scrollTop = this.log.scrollHeight;

    // Fade out after 8 seconds
    div.style.opacity = '1';
    const timer = setTimeout(() => {
      div.style.transition = 'opacity 1s';
      div.style.opacity = '0';
    }, 8000);
    this._fadeTimers.push(timer);
  }

  addSystemMessage(text: string): void {
    this.addMessage(text, '#ff0');
  }

  addChatMessage(username: string, message: string): void {
    this.addMessage(`<${username}> ${message}`, '#fff');
  }
}
