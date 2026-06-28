# @ranuts/chat-ui

Framework-free, dependency-free chat / IM UI component: a scrolling message list
with streaming support and an auto-growing input box whose button doubles as
Send / Stop. Bring your own backend — it only renders and emits events.

## Usage

```ts
import { ChatView } from '@ranuts/chat-ui';

const chat = new ChatView({
  onSend: (text) => {
    chat.append({ role: 'user', text });
    chat.setRunning(true);
    // ...call your backend, stream the reply:
    chat.appendDelta('Hello');
    chat.appendDelta(' world');
    chat.endStream();
    chat.setRunning(false);
  },
  onStop: () => {
    /* abort the in-flight request */
  },
  labels: {
    send: 'Send',
    stop: 'Stop',
    placeholder: 'Type a message…',
    empty: 'Start a conversation',
    role: (r) => (r === 'agent' ? 'AI' : ''),
  },
});

container.appendChild(chat.el);
```

Styles are injected automatically on first construction; no CSS import needed.
Override the look via the `--cui-*` custom properties on `.cui-root`.

## API

- `append({ role, text })` — add a finished message (`user` / `agent` / `tool` / `error`).
- `appendDelta(text)` — stream text into a live agent bubble (auto-created).
- `endStream()` — finalise the streaming bubble.
- `setRunning(bool)` — toggle Send⇄Stop and lock the input.
- `clear()` — remove all messages.
- `getInput()` / `setInput(text)` / `focus()` — input helpers.
- `setLabels(labels)` — update labels live (e.g. language change).
- `actionsEl` — host-populated slot above the input (compose toolbar); collapses when empty.
