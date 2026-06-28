# @ranuts/agent-core — AI usage guide

Editor-agnostic agent core: a provider-neutral LLM layer + a tool-use runtime
loop. **No UI, no editor.** Bring your own tools and interface.

## When to use

You need to call an LLM (Claude / OpenAI / Gemini / Ollama / WebLLM) and let it
call your tools in a loop. If you only need to render chat, use `@ranuts/chat-ui`.

## Import map

```ts
import { runAgent, toLLMToolDefs } from '@ranuts/agent-core/runtime';
import type { AgentTool, JsonSchema } from '@ranuts/agent-core/types';
import { createProvider, defaultProviderId, getApiKey, setApiKey } from '@ranuts/agent-core/llm';
// providers/helpers also at subpaths: @ranuts/agent-core/llm/{anthropic,openai,gemini,ollama,webllm,factory,keys,types}
```

## Define a tool

```ts
const tools: Record<string, AgentTool> = {
  echo: {
    name: 'echo',
    description: 'Echo text back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    readOnlyHint: true,
    execute: async ({ text }) => ({ echoed: text }),
  },
};
```

## Run the loop

```ts
const provider = createProvider('anthropic', { apiKey: getApiKey('anthropic') });
const result = await runAgent(provider, 'echo hello', {
  tools,
  maxIterations: 8,              // default 8
  history: prior,               // LLMMessage[] to continue a conversation
  signal: abortController.signal,
  onEvent: (e) => {             // 'assistant' | 'assistant_delta' | 'tool_call' | 'tool_result'
    if (e.type === 'assistant_delta') render(e.text);
  },
});
// result: { text, messages, toolCallCount, stoppedOnLimit, aborted }
```

## Providers

`createProvider(id, opts)` where id ∈ `anthropic | openai | gemini | ollama | webllm`.
`defaultProviderId()` → `'webllm'` when WebGPU is available, else `'anthropic'`.
Cloud keys live in localStorage via `getApiKey/setApiKey` (per provider).

## Gotchas

- The runtime is **editor-agnostic**: it does NOT default to any tools. If you
  don't pass `options.tools`, the model gets none. Always pass your registry.
- `runAgent` streams via `provider.chatStream` when available, else falls back to `chat`.
- `signal` aborts *between* iterations; the in-flight model call still finishes.
- Tool `execute` errors are caught and fed back to the model as an error tool result (not thrown).
- Deps: `@anthropic-ai/sdk`, `@mlc-ai/web-llm`. No editor/DOM beyond `localStorage` for keys.

## Testing

Fully unit-testable: pass a scripted `LLMProvider` (returns canned `chat()` results)
and mock `AgentTool`s; assert on the event stream and `result`.
