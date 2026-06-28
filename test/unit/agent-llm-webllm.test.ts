import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WEBLLM_MODEL,
  isWebGPUAvailable,
  WEBLLM_MODELS,
  WebLLMProvider,
} from '@ranuts/agent-core/llm/webllm';
import { createProvider, defaultProviderId } from '@ranuts/agent-core/llm/factory';

describe('WebLLMProvider', () => {
  it('reports WebGPU unavailable under jsdom', () => {
    expect(isWebGPUAvailable()).toBe(false);
  });

  it('exposes a curated model list with the default included', () => {
    expect(WEBLLM_MODELS.length).toBeGreaterThanOrEqual(2);
    expect(WEBLLM_MODELS.map((m) => m.id)).toContain(DEFAULT_WEBLLM_MODEL);
  });

  it('defaults to the balanced model but accepts an override', () => {
    expect(new WebLLMProvider().model).toBe(DEFAULT_WEBLLM_MODEL);
    expect(new WebLLMProvider({ model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC' }).model).toBe(
      'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    );
  });

  it('is ready when an engine is injected, not ready otherwise (no WebGPU)', () => {
    expect(new WebLLMProvider({ engine: { chat: { completions: { create: vi.fn() } } } }).isReady()).toBe(true);
    expect(new WebLLMProvider().isReady()).toBe(false);
  });

  it('chat() sends the OpenAI-shaped request and parses the result', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] });
    const provider = new WebLLMProvider({ engine: { chat: { completions: { create } } } });
    const result = await provider.chat(
      [{ role: 'user', content: 'go' }],
      [{ name: 'insert_text', description: 'd', inputSchema: { type: 'object' } }],
    );
    const body = create.mock.calls[0][0];
    expect(body.tool_choice).toBe('auto');
    // Hermes function calling forbids a custom system prompt, so when tools are
    // passed there must be no system message.
    expect(body.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'go' });
    expect(result.text).toBe('done');
  });

  it('preload() resolves with an injected engine without loading the SDK', async () => {
    const provider = new WebLLMProvider({ engine: { chat: { completions: { create: vi.fn() } } } });
    await expect(provider.preload()).resolves.toBeUndefined();
  });

  it('chatStream() requests a stream, reports deltas, and resolves the full text', async () => {
    async function* chunks() {
      yield { choices: [{ delta: { content: 'on' } }] };
      yield { choices: [{ delta: { content: 'line' } }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    }
    const create = vi.fn().mockResolvedValue(chunks());
    const provider = new WebLLMProvider({ engine: { chat: { completions: { create } } } });
    const deltas: string[] = [];
    const result = await provider.chatStream([{ role: 'user', content: 'go' }], [], (d) => deltas.push(d));
    expect(create.mock.calls[0][0].stream).toBe(true);
    expect(deltas).toEqual(['on', 'line']);
    expect(result.text).toBe('online');
  });
});

describe('provider factory', () => {
  it('creates each provider by id', () => {
    expect(createProvider('anthropic', { apiKey: 'k' }).name).toBe('anthropic');
    expect(createProvider('openai', { apiKey: 'k' }).name).toBe('openai');
    expect(createProvider('webllm', { engine: { chat: { completions: { create: vi.fn() } } } }).name).toBe('webllm');
  });

  it('defaults to anthropic under jsdom (no WebGPU)', () => {
    expect(defaultProviderId()).toBe('anthropic');
  });
});
