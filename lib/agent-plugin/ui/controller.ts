/**
 * Agent chat controller — the testable core behind the UI panel.
 *
 * Holds the conversation history, drives runAgent, and emits UI-facing "turns"
 * (user / agent / tool / error) through a callback. The DOM panel is a thin view
 * over this; all orchestration and state logic lives here so it can be unit
 * tested with a mock provider.
 */
import { runAgent } from '../runtime';
import type { AgentTool } from '../types';
import type { LLMMessage, LLMProvider } from '../llm/types';

export interface ChatTurn {
  role: 'user' | 'agent' | 'tool' | 'error';
  text: string;
}

export interface AgentChatControllerOptions {
  tools?: Record<string, AgentTool>;
  maxIterations?: number;
}

export class AgentChatController {
  private history: LLMMessage[] = [];
  private running = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly provider: LLMProvider,
    private readonly onTurn: (turn: ChatTurn) => void,
    private readonly options: AgentChatControllerOptions = {},
  ) {}

  /** Whether a run is currently in progress (input should be disabled). */
  isRunning(): boolean {
    return this.running;
  }

  /** Send a user instruction and run the agent loop, emitting turns as it goes. */
  async send(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || this.running) return;

    this.running = true;
    this.abortController = new AbortController();
    this.onTurn({ role: 'user', text });
    try {
      const result = await runAgent(this.provider, text, {
        tools: this.options.tools,
        maxIterations: this.options.maxIterations,
        history: this.history,
        signal: this.abortController.signal,
        onEvent: (event) => {
          if (event.type === 'tool_call') {
            this.onTurn({ role: 'tool', text: `调用工具：${event.name}` });
          } else if (event.type === 'tool_result' && event.isError) {
            this.onTurn({ role: 'error', text: `工具出错：${event.content}` });
          } else if (event.type === 'assistant' && event.text) {
            this.onTurn({ role: 'agent', text: event.text });
          }
        },
      });
      this.history = result.messages;
      if (result.aborted) {
        this.onTurn({ role: 'error', text: '已停止。' });
      } else if (result.stoppedOnLimit) {
        this.onTurn({ role: 'error', text: '已达到最大执行步数，已停止。' });
      }
    } catch (error) {
      this.onTurn({ role: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      this.running = false;
      this.abortController = null;
    }
  }

  /** Request the current run to stop after the in-flight model call returns. */
  stop(): void {
    this.abortController?.abort();
  }

  /** Clear the conversation history. */
  reset(): void {
    this.history = [];
  }
}
