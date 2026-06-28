import { ensureChatUiStyles } from './styles';
import type { ChatMessage, ChatRole, ChatViewLabels, ChatViewOptions } from './types';

/**
 * A framework-free chat UI: a scrolling message list with streaming support and
 * an auto-growing input box whose button doubles as Send / Stop.
 *
 * Mount {@link ChatView.el} anywhere. Drive it with {@link ChatView.append},
 * {@link ChatView.appendDelta}, and {@link ChatView.setRunning}; receive user
 * input through the `onSend` / `onStop` callbacks. No backend assumptions.
 */
export class ChatView {
  /** Root element — append this to your container. */
  readonly el: HTMLDivElement;
  /**
   * An action slot directly above the input row. Populate it with your own
   * controls (toggles, quick actions) for an IM-style compose toolbar; it
   * collapses when empty.
   */
  readonly actionsEl: HTMLDivElement;

  private readonly messagesEl: HTMLDivElement;
  private readonly emptyEl: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendBtn: HTMLButtonElement;
  private labels: ChatViewLabels;
  private running = false;
  /** The agent bubble currently receiving streamed deltas, if any. */
  private liveMsg: HTMLDivElement | null = null;

  constructor(private readonly options: ChatViewOptions) {
    ensureChatUiStyles();
    this.labels = options.labels ?? {};

    this.el = document.createElement('div');
    this.el.className = 'cui-root';

    this.messagesEl = document.createElement('div');
    this.messagesEl.className = 'cui-messages';

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'cui-empty';
    this.emptyEl.textContent = this.labels.empty ?? '';
    this.messagesEl.appendChild(this.emptyEl);

    const inputRow = document.createElement('div');
    inputRow.className = 'cui-input-row';
    this.input = document.createElement('textarea');
    this.input.className = 'cui-input';
    this.input.rows = 1;
    this.input.placeholder = this.labels.placeholder ?? '';
    this.input.addEventListener('input', () => this.autoGrow());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });

    this.sendBtn = document.createElement('button');
    this.sendBtn.type = 'button';
    this.sendBtn.className = 'cui-send';
    this.sendBtn.textContent = this.labels.send ?? 'Send';
    this.sendBtn.addEventListener('click', () => {
      if (this.running) this.options.onStop?.();
      else this.submit();
    });

    inputRow.append(this.input, this.sendBtn);

    // Compose toolbar slot: host-populated controls just above the input.
    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'cui-actions';

    this.el.append(this.messagesEl, this.actionsEl, inputRow);
  }

  /** Append a finished message and scroll to it. Returns the bubble element. */
  append(message: ChatMessage): HTMLDivElement {
    this.emptyEl.remove();
    const row = document.createElement('div');
    row.className = `cui-msg cui-msg-${message.role}`;

    const chip = this.roleChip(message.role);
    if (chip) {
      const who = document.createElement('span');
      who.className = 'cui-role';
      who.textContent = chip;
      row.appendChild(who);
    }

    const bubble = document.createElement('div');
    bubble.className = 'cui-bubble';
    bubble.textContent = message.text;
    row.appendChild(bubble);

    this.messagesEl.appendChild(row);
    this.scrollToEnd();
    return bubble;
  }

  /**
   * Append streamed text to a live agent bubble, creating it on the first delta.
   * Call {@link endStream} when the turn completes.
   */
  appendDelta(delta: string): void {
    if (!delta) return;
    if (!this.liveMsg) {
      this.liveMsg = this.append({ role: 'agent', text: '' }).parentElement as HTMLDivElement;
      this.liveMsg.classList.add('cui-streaming');
    }
    const bubble = this.liveMsg.querySelector('.cui-bubble');
    if (bubble) bubble.textContent = (bubble.textContent ?? '') + delta;
    this.scrollToEnd();
  }

  /** Finalise the current streaming bubble (removes the caret). */
  endStream(): void {
    this.liveMsg?.classList.remove('cui-streaming');
    this.liveMsg = null;
  }

  /** Toggle the running state: Send becomes Stop and the input locks. */
  setRunning(running: boolean): void {
    this.running = running;
    this.input.disabled = running;
    this.sendBtn.textContent = running ? this.labels.stop ?? 'Stop' : this.labels.send ?? 'Send';
    this.sendBtn.classList.toggle('cui-send-stop', running);
  }

  /** Remove all messages and restore the empty state. */
  clear(): void {
    this.messagesEl.replaceChildren(this.emptyEl);
    this.emptyEl.textContent = this.labels.empty ?? '';
    this.liveMsg = null;
  }

  /** Current input text. */
  getInput(): string {
    return this.input.value;
  }

  /** Replace the input text (e.g. to prepend a quoted selection). */
  setInput(text: string): void {
    this.input.value = text;
    this.autoGrow();
  }

  focus(): void {
    this.input.focus();
  }

  /** Update labels (e.g. on a language change) and re-apply them live. */
  setLabels(labels: ChatViewLabels): void {
    this.labels = labels;
    this.input.placeholder = labels.placeholder ?? '';
    this.sendBtn.textContent = this.running ? labels.stop ?? 'Stop' : labels.send ?? 'Send';
    if (!this.emptyEl.parentElement) return;
    this.emptyEl.textContent = labels.empty ?? '';
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text || this.running) return;
    this.input.value = '';
    this.autoGrow();
    this.options.onSend(text);
  }

  private roleChip(role: ChatRole): string {
    if (this.labels.role) return this.labels.role(role);
    return role === 'agent' ? 'Agent' : '';
  }

  private autoGrow(): void {
    this.input.style.height = 'auto';
    this.input.style.height = `${this.input.scrollHeight}px`;
  }

  private scrollToEnd(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
