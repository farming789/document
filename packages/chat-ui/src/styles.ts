/**
 * Component styles, injected once into the document head on first construction
 * (so consumers don't need a separate CSS import). All classes are `cui-`
 * prefixed and variables are overridable via the `.cui-root` scope.
 */
export const CHAT_UI_CSS = `
.cui-root {
  --cui-accent: #4f46e5;
  --cui-accent-contrast: #fff;
  --cui-bg: #fff;
  --cui-agent-bg: #f3f4f6;
  --cui-text: #1f2937;
  --cui-muted: #9ca3af;
  --cui-border: #e5e7eb;
  --cui-radius: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--cui-bg);
  color: var(--cui-text);
  font-size: 14px;
  line-height: 1.5;
}
.cui-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scroll-behavior: smooth;
}
.cui-empty {
  margin: auto;
  color: var(--cui-muted);
  text-align: center;
  font-size: 13px;
  padding: 24px;
}
.cui-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 88%;
}
.cui-msg-user { align-self: flex-end; align-items: flex-end; }
.cui-msg-agent, .cui-msg-tool, .cui-msg-error { align-self: flex-start; align-items: flex-start; }
.cui-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--cui-muted);
  padding: 0 4px;
}
.cui-bubble {
  padding: 9px 13px;
  border-radius: var(--cui-radius);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.cui-msg-user .cui-bubble {
  background: var(--cui-accent);
  color: var(--cui-accent-contrast);
  border-bottom-right-radius: 4px;
}
.cui-msg-agent .cui-bubble {
  background: var(--cui-agent-bg);
  border-bottom-left-radius: 4px;
}
.cui-msg-tool .cui-bubble {
  background: transparent;
  border: 1px dashed var(--cui-border);
  color: var(--cui-muted);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cui-msg-error .cui-bubble {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
/* Blinking caret while a message is streaming in. */
.cui-streaming .cui-bubble::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: currentColor;
  opacity: 0.6;
  animation: cui-blink 1s steps(2, start) infinite;
}
@keyframes cui-blink { to { visibility: hidden; } }
/* Compose toolbar: host-populated quick actions just above the input. */
.cui-actions {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 0;
  font-size: 13px;
}
.cui-actions:empty {
  display: none;
}
.cui-input-row {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px;
  border-top: 1px solid var(--cui-border);
}
.cui-input {
  flex: 1 1 auto;
  resize: none;
  border: 1px solid var(--cui-border);
  border-radius: 10px;
  padding: 9px 12px;
  font: inherit;
  color: inherit;
  outline: none;
  max-height: 160px;
  background: var(--cui-bg);
}
.cui-input:focus { border-color: var(--cui-accent); }
.cui-input:disabled { background: #f9fafb; color: var(--cui-muted); }
.cui-send {
  flex: 0 0 auto;
  border: none;
  border-radius: 10px;
  padding: 9px 16px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: var(--cui-accent);
  color: var(--cui-accent-contrast);
}
.cui-send:hover { filter: brightness(1.05); }
.cui-send.cui-send-stop { background: #6b7280; }
`;

let injected = false;

/** Inject the component stylesheet once per document. */
export function ensureChatUiStyles(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById('cui-styles')) {
    injected = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'cui-styles';
  style.textContent = CHAT_UI_CSS;
  document.head.appendChild(style);
  injected = true;
}
