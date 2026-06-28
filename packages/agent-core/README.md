# @ranuts/agent-core

Editor-agnostic agent core: a provider-neutral LLM layer and a tool-use runtime
loop. No UI, no editor, no DOM assumptions beyond `localStorage` (for optional
API-key storage). Bring your own tools and your own interface.

## Layers

- **`@ranuts/agent-core/llm`** — a neutral `LLMProvider` interface
  (message / tool / response shapes) with concrete providers behind a factory:
  Anthropic Claude, OpenAI, Gemini, Ollama, and in-browser WebLLM.
- **`@ranuts/agent-core/runtime`** — `runAgent(provider, message, { tools })`:
  the chat ⇄ tool-call loop. Streams text deltas, executes requested tools,
  feeds results back, and stops on a normal turn or the iteration cap.

## Usage

```ts
import { runAgent } from '@ranuts/agent-core/runtime';
import { createProvider } from '@ranuts/agent-core/llm';
import type { AgentTool } from '@ranuts/agent-core/types';

const tools: Record<string, AgentTool> = {
  echo: {
    name: 'echo',
    description: 'Echo text back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    execute: async ({ text }) => ({ echoed: text }),
  },
};

const provider = createProvider('anthropic', { apiKey: '…' });
const result = await runAgent(provider, 'echo hello', { tools, onEvent: console.log });
console.log(result.text);
```

The runtime is fully unit-testable with a scripted provider and mock tools — it
only knows the `LLMProvider` interface and the `AgentTool` registry.
