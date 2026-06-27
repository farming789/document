import { describe, expect, it, vi } from 'vitest';
import {
  isWebGPUAvailable,
  parseOpenAIResponse,
  toOpenAIMessages,
  toOpenAITools,
  WebLLMProvider,
} from '../../lib/agent-plugin/llm/webllm';
import { createProvider, defaultProviderId } from '../../lib/agent-plugin/llm/factory';
import type { LLMMessage } from '../../lib/agent-plugin/llm/types';

describe('webllm conversion', () => {
  it('reports WebGPU unavailable under jsdom', () => {
    expect(isWebGPUAvailable()).toBe(false);
  });

  it('maps tools to OpenAI function shape', () => {
    expect(toOpenAITools([{ name: 'insert_text', description: 'd', inputSchema: { type: 'object' } }])).toEqual([
      { type: 'function', function: { name: 'insert_text', description: 'd', parameters: { type: 'object' } } },
    ]);
  });

  it('prepends the system prompt and maps string content', () => {
    const out = toOpenAIMessages([{ role: 'user', content: 'hi' }], 'SYS');
    expect(out).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('maps an assistant turn with text + tool_use to tool_calls', () => {
    const messages: LLMMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'ok' },
          { type: 'tool_use', id: 't1', name: 'insert_text', input: { text: 'x' } },
        ],
      },
    ];
    const out = toOpenAIMessages(messages, 'SYS');
    expect(out[1]).toEqual({
      role: 'assistant',
      content: 'ok',
      tool_calls: [
        { id: 't1', type: 'function', function: { name: 'insert_text', arguments: JSON.stringify({ text: 'x' }) } },
      ],
    });
  });

  it('maps a tool_result block to a tool message', () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: 'done' }] },
    ];
    const out = toOpenAIMessages(messages, 'SYS');
    expect(out[1]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'done' });
  });

  it('parses text and tool_calls (with JSON arguments) from a completion', () => {
    const parsed = parseOpenAIResponse({
      choices: [
        {
          message: {
            content: 'sure',
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'insert_text', arguments: '{"text":"hi"}' } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    expect(parsed.text).toBe('sure');
    expect(parsed.toolCalls).toEqual([{ id: 't1', name: 'insert_text', input: { text: 'hi' } }]);
    expect(parsed.stopReason).toBe('tool_calls');
  });

  it('falls back to {} for unparseable tool arguments', () => {
    const parsed = parseOpenAIResponse({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: 'not json' } }],
          },
        },
      ],
    });
    expect(parsed.toolCalls[0].input).toEqual({});
    expect(parsed.text).toBe('');
    expect(parsed.stopReason).toBe('stop');
  });
});

describe('WebLLMProvider', () => {
  it('is ready when an engine is injected', () => {
    const engine = { chat: { completions: { create: vi.fn() } } };
    expect(new WebLLMProvider({ engine }).isReady()).toBe(true);
  });

  it('is not ready without an engine and without WebGPU', () => {
    expect(new WebLLMProvider().isReady()).toBe(false);
  });

  it('chat() sends the OpenAI-shaped request and parses the result', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
    });
    const provider = new WebLLMProvider({ engine: { chat: { completions: { create } } } });

    const result = await provider.chat(
      [{ role: 'user', content: 'go' }],
      [{ name: 'insert_text', description: 'd', inputSchema: { type: 'object' } }],
    );

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0];
    expect(body.tool_choice).toBe('auto');
    expect(body.messages[0]).toEqual({ role: 'system', content: expect.any(String) });
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'insert_text', description: 'd', parameters: { type: 'object' } } },
    ]);
    expect(result.text).toBe('done');
  });
});

describe('provider factory', () => {
  it('creates the requested provider', () => {
    expect(createProvider('anthropic', { apiKey: 'k' }).name).toBe('anthropic');
    expect(createProvider('webllm', { engine: { chat: { completions: { create: vi.fn() } } } }).name).toBe('webllm');
  });

  it('defaults to anthropic under jsdom (no WebGPU)', () => {
    expect(defaultProviderId()).toBe('anthropic');
  });
});
