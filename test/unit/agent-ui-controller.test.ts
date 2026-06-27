import { describe, expect, it, vi } from 'vitest';
import { AgentChatController, type ChatTurn } from '../../lib/agent-plugin/ui/controller';
import type { AgentTool } from '../../lib/agent-plugin/types';
import type { LLMMessage, LLMProvider, LLMResponse } from '../../lib/agent-plugin/llm/types';

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

function scripted(responses: LLMResponse[]): LLMProvider {
  let i = 0;
  return {
    name: 'test',
    isReady: () => true,
    chat: vi.fn(async () => responses[Math.min(i++, responses.length - 1)]),
  };
}

/** Like scripted, but snapshots each chat's messages array (runAgent mutates it). */
function scriptedWithSnapshots(responses: LLMResponse[]): {
  provider: LLMProvider;
  snapshots: Array<Array<{ role: string; content: unknown }>>;
} {
  let i = 0;
  const snapshots: Array<Array<{ role: string; content: unknown }>> = [];
  const provider: LLMProvider = {
    name: 'test',
    isReady: () => true,
    chat: vi.fn(async (messages: LLMMessage[]) => {
      snapshots.push(messages.map((m) => ({ role: m.role, content: m.content })));
      return responses[Math.min(i++, responses.length - 1)];
    }),
  };
  return { provider, snapshots };
}

const makeTool = (name: string, execute: AgentTool['execute']): AgentTool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: 'object' },
  readOnlyHint: false,
  execute,
});

function collect(provider: LLMProvider, options = {}) {
  const turns: ChatTurn[] = [];
  const controller = new AgentChatController(provider, (t) => turns.push(t), options);
  return { controller, turns };
}

describe('AgentChatController', () => {
  it('ignores empty input', async () => {
    const { controller, turns } = collect(scripted([textResponse('x')]), { tools: {} });
    await controller.send('   ');
    expect(turns).toEqual([]);
    expect(controller.isRunning()).toBe(false);
  });

  it('emits a user turn then an agent turn for a plain reply', async () => {
    const { controller, turns } = collect(scripted([textResponse('done editing')]), { tools: {} });
    await controller.send('do something');
    expect(turns).toEqual([
      { role: 'user', text: 'do something' },
      { role: 'agent', text: 'done editing' },
    ]);
  });

  it('emits a tool turn when the agent calls a tool', async () => {
    const tools = { insert_text: makeTool('insert_text', async () => ({ inserted: true })) };
    const provider = scripted([toolResponse('t1', 'insert_text', { text: 'hi' }), textResponse('inserted')]);
    const { controller, turns } = collect(provider, { tools });
    await controller.send('insert hi');
    expect(turns).toEqual([
      { role: 'user', text: 'insert hi' },
      { role: 'tool', text: '调用工具：insert_text' },
      { role: 'agent', text: 'inserted' },
    ]);
  });

  it('emits an error turn when a tool fails', async () => {
    const tools = {
      boom: makeTool('boom', async () => {
        throw new Error('editor not ready');
      }),
    };
    const provider = scripted([toolResponse('t1', 'boom', {}), textResponse('recovered')]);
    const { turns, controller } = collect(provider, { tools });
    await controller.send('go');
    expect(turns).toContainEqual({ role: 'error', text: '工具出错：editor not ready' });
  });

  it('emits an error turn when the iteration cap is hit', async () => {
    const tools = { loop: makeTool('loop', async () => ({})) };
    const provider = scripted([toolResponse('t', 'loop', {})]);
    const { controller, turns } = collect(provider, { tools, maxIterations: 2 });
    await controller.send('go');
    expect(turns).toContainEqual({ role: 'error', text: '已达到最大执行步数，已停止。' });
  });

  it('emits an error turn when the provider throws', async () => {
    const provider: LLMProvider = {
      name: 'test',
      isReady: () => true,
      chat: vi.fn(async () => {
        throw new Error('401 unauthorized');
      }),
    };
    const { controller, turns } = collect(provider, { tools: {} });
    await controller.send('go');
    expect(turns).toContainEqual({ role: 'error', text: '401 unauthorized' });
    expect(controller.isRunning()).toBe(false);
  });

  it('accumulates history across sends', async () => {
    const { provider, snapshots } = scriptedWithSnapshots([textResponse('first'), textResponse('second')]);
    const { controller } = collect(provider, { tools: {} });
    await controller.send('one');
    await controller.send('two');
    // Second send's history must include the first exchange + the new user message.
    const secondCallMessages = snapshots[1];
    expect(secondCallMessages.length).toBeGreaterThanOrEqual(3);
    expect(secondCallMessages[secondCallMessages.length - 1]).toEqual({ role: 'user', content: 'two' });
  });

  it('stop() aborts the run and emits a stopped turn', async () => {
    let resolveChat: () => void = () => {};
    const provider: LLMProvider = {
      name: 'test',
      isReady: () => true,
      chat: vi.fn(
        () =>
          new Promise<LLMResponse>((resolve) => {
            resolveChat = () => resolve(toolResponse('t1', 'loop', {}));
          }),
      ),
    };
    const tools = { loop: makeTool('loop', async () => ({})) };
    const { controller, turns } = collect(provider, { tools });

    const pending = controller.send('go');
    await Promise.resolve(); // let send() reach the awaited chat()
    controller.stop();
    resolveChat(); // first chat returns a tool call; next iteration sees the abort
    await pending;

    expect(turns).toContainEqual({ role: 'error', text: '已停止。' });
    expect(controller.isRunning()).toBe(false);
  });

  it('reset clears history', async () => {
    const { provider, snapshots } = scriptedWithSnapshots([textResponse('first'), textResponse('second')]);
    const { controller } = collect(provider, { tools: {} });
    await controller.send('one');
    controller.reset();
    await controller.send('two');
    expect(snapshots[1]).toEqual([{ role: 'user', content: 'two' }]);
  });
});
