# @ranuts/chat-ui — AI usage guide

Framework-free, dependency-free chat/IM UI. Renders messages + an input box and
emits events; it has **no backend, no LLM, no editor knowledge**. Wire it to
whatever you want.

## When to use

Any "chat panel" surface: a message list with role bubbles, streaming assistant
replies, and a Send/Stop input. Don't reach for it if you just need a textarea.

## Import

```ts
import { ChatView } from '@ranuts/chat-ui';
import type { ChatMessage, ChatRole, ChatViewLabels, ChatViewOptions } from '@ranuts/chat-ui';
```

Styles are injected automatically on first `new ChatView(...)` — **do not import any CSS**.

## Construct

```ts
const chat = new ChatView({
  onSend: (text) => { /* user submitted `text` (trimmed, non-empty) */ },
  onStop: () => { /* user clicked Send while running → treat as abort */ },
  labels: { send: 'Send', stop: 'Stop', placeholder: 'Type…', empty: 'Start chatting',
            role: (r) => (r === 'agent' ? 'AI' : '') },
});
container.appendChild(chat.el);   // mount the root element
```

## Methods

| Method | Purpose |
| --- | --- |
| `append({ role, text })` | Add a finished message. `role`: `'user' \| 'agent' \| 'tool' \| 'error'`. |
| `appendDelta(text)` | Stream into a live agent bubble (auto-created on first delta). |
| `endStream()` | Finalise the streaming bubble (drops the caret). |
| `setRunning(bool)` | Toggle Send⇄Stop and lock the input. |
| `clear()` | Remove all messages, restore empty state. |
| `getInput()` / `setInput(text)` / `focus()` | Input helpers (e.g. prepend a quote). |
| `setLabels(labels)` | Re-apply labels live (e.g. language change). |

## Canonical streaming flow

```ts
onSend: async (text) => {
  chat.append({ role: 'user', text });
  chat.setRunning(true);
  try {
    for await (const delta of backendStream(text)) chat.appendDelta(delta);
    chat.endStream();
  } catch (e) {
    chat.append({ role: 'error', text: String(e) });
  } finally {
    chat.setRunning(false);
  }
}
```

## Gotchas

- `onSend` only fires for non-empty trimmed input; the component clears the input itself.
- Streaming: call `appendDelta` repeatedly, then exactly one `endStream`. Don't `append` an agent message during a stream.
- Restyle via CSS custom properties on `.cui-root` (`--cui-accent`, `--cui-agent-bg`, …) — don't depend on internal `cui-*` class names.
- Zero dependencies on purpose — **never** add ranui/ranuts here.
