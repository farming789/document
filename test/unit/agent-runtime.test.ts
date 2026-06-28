import { describe, expect, it, vi } from 'vitest';
import { type AgentEvent, runAgent, toLLMToolDefs } from '@ranuts/agent-core/runtime';
import type { AgentTool } from '@ranuts/agent-core/types';
import type { LLMMessage, LLMProvider, LLMResponse } from '@ranuts/agent-core/llm/types';

const textResponse = (text: string): LLMResponse => ({
  text,
  toolCalls: [],
  stopReason: 'end_turn',
  assistant: { role: 'assistant', content: [{ type: 'text', text }] },
});

const toolResponse = (id: string, name: string, input: Record<string, unknown>): LLMResponse => ({
  text: '',
  toolCalls: [{ id, name, input }],
  stopReason: 'tool_use',
  assistant: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
});

/**
 * A provider that returns scripted responses (repeating the last one).
 * `snapshots[n]` is a copy of the messages array passed to the nth chat call —
 * the runtime mutates the live array, so we snapshot it at call time.
 */
function scripted(responses: LLMResponse[]): {
  provider: LLMProvider;
  chat: ReturnType<typeof vi.fn>;
  snapshots: LLMMessage[][];
} {
  let i = 0;
  const snapshots: LLMMessage[][] = [];
  const chat = vi.fn(async (messages: LLMMessage[]) => {
    snapshots.push([...messages]);
    return responses[Math.min(i++, responses.length - 1)];
  });
  return { provider: { name: 'test', isReady: () => true, chat }, chat, snapshots };
}

const makeTool = (name: string, execute: AgentTool['execute']): AgentTool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: 'object' },
  readOnlyHint: false,
  execute,
});

describe('toLLMToolDefs', () => {
  it('maps a registry to name/description/inputSchema', () => {
    const tools = { a: makeTool('a', async () => null), b: makeTool('b', async () => null) };
    expect(toLLMToolDefs(tools)).toEqual([
      { name: 'a', description: 'a tool', inputSchema: { type: 'object' } },
      { name: 'b', description: 'b tool', inputSchema: { type: 'object' } },
    ]);
  });
});

describe('runAgent', () => {
  it('returns the text when the model makes no tool calls', async () => {
    const { provider, chat } = scripted([textResponse('all done')]);
    const result = await runAgent(provider, 'hi', { tools: {} });
    expect(result.text).toBe('all done');
    expect(result.toolCallCount).toBe(0);
    expect(result.stoppedOnLimit).toBe(false);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('executes a tool call, feeds the result back, then finishes', async () => {
    const exec = vi.fn(async () => ({ inserted: true }));
    const tools = { insert_text: makeTool('insert_text', exec) };
    const { provider, chat, snapshots } = scripted([
      toolResponse('t1', 'insert_text', { text: 'hello' }),
      textResponse('inserted it'),
    ]);

    const result = await runAgent(provider, 'insert hello', { tools });

    expect(exec).toHaveBeenCalledWith({ text: 'hello' });
    expect(result.text).toBe('inserted it');
    expect(result.toolCallCount).toBe(1);
    expect(chat).toHaveBeenCalledTimes(2);
    // Second chat must include the tool_result we fed back.
    const secondTurnMessages = snapshots[1];
    const last = secondTurnMessages[secondTurnMessages.length - 1];
    expect(last).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', toolUseId: 't1', content: JSON.stringify({ inserted: true }), isError: false }],
    });
  });

  it('reports an error tool_result for an unknown tool', async () => {
    const { provider, snapshots } = scripted([toolResponse('t1', 'nope', {}), textResponse('handled')]);
    await runAgent(provider, 'go', { tools: {} });
    const secondTurnMessages = snapshots[1];
    const last = secondTurnMessages[secondTurnMessages.length - 1];
    expect(last.content).toEqual([
      { type: 'tool_result', toolUseId: 't1', content: 'Unknown tool: nope', isError: true },
    ]);
  });

  it('captures a thrown tool error as an error tool_result', async () => {
    const tools = {
      boom: makeTool('boom', async () => {
        throw new Error('editor not ready');
      }),
    };
    const { provider, snapshots } = scripted([toolResponse('t1', 'boom', {}), textResponse('ok')]);
    await runAgent(provider, 'go', { tools });
    const secondTurnMessages = snapshots[1];
    const last = secondTurnMessages[secondTurnMessages.length - 1];
    expect(last.content).toEqual([
      { type: 'tool_result', toolUseId: 't1', content: 'editor not ready', isError: true },
    ]);
  });

  it('stops on the iteration cap when the model keeps calling tools', async () => {
    const tools = { loop: makeTool('loop', async () => ({})) };
    const { provider, chat } = scripted([toolResponse('t', 'loop', {})]); // always a tool call
    const result = await runAgent(provider, 'go', { tools, maxIterations: 3 });
    expect(result.stoppedOnLimit).toBe(true);
    expect(result.text).toBe('');
    expect(chat).toHaveBeenCalledTimes(3);
    expect(result.toolCallCount).toBe(3);
  });

  it('returns aborted without calling chat when the signal is already aborted', async () => {
    const { provider, chat } = scripted([textResponse('x')]);
    const ac = new AbortController();
    ac.abort();
    const result = await runAgent(provider, 'go', { tools: {}, signal: ac.signal });
    expect(result.aborted).toBe(true);
    expect(chat).not.toHaveBeenCalled();
  });

  it('prepends prior history before the new user message', async () => {
    const { provider, snapshots } = scripted([textResponse('ok')]);
    const history: LLMMessage[] = [
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'sure' },
    ];
    await runAgent(provider, 'now this', { tools: {}, history });
    const firstTurnMessages = snapshots[0];
    expect(firstTurnMessages).toEqual([...history, { role: 'user', content: 'now this' }]);
  });

  it('emits progress events for assistant text, tool calls, and tool results', async () => {
    const tools = { do_x: makeTool('do_x', async () => ({ ok: 1 })) };
    const { provider } = scripted([toolResponse('t1', 'do_x', { a: 1 }), textResponse('finished')]);
    const events: string[] = [];
    await runAgent(provider, 'go', {
      tools,
      onEvent: (e) => events.push(e.type),
    });
    expect(events).toEqual(['tool_call', 'tool_result', 'assistant']);
  });

  it('uses chatStream when present, emitting deltas then a streamed assistant event', async () => {
    const chatStream = vi.fn(async (_messages: LLMMessage[], _tools, onDelta: (d: string) => void) => {
      onDelta('Hel');
      onDelta('lo');
      return textResponse('Hello');
    });
    const chat = vi.fn();
    const provider: LLMProvider = { name: 'test', isReady: () => true, chat, chatStream };
    const events: AgentEvent[] = [];

    const result = await runAgent(provider, 'go', { tools: {}, onEvent: (e) => events.push(e) });

    expect(chatStream).toHaveBeenCalledTimes(1);
    expect(chat).not.toHaveBeenCalled();
    expect(events.filter((e) => e.type === 'assistant_delta').map((e) => (e as { text: string }).text)).toEqual([
      'Hel',
      'lo',
    ]);
    expect(events.find((e) => e.type === 'assistant')).toMatchObject({ text: 'Hello', streamed: true });
    expect(result.text).toBe('Hello');
  });
});
