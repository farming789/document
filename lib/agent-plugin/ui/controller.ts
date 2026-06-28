/**
 * Agent chat controller — the testable core behind the UI panel.
 *
 * Holds the conversation history, drives runAgent, and emits UI-facing "turns"
 * (user / agent / tool / error) through a callback. The DOM panel is a thin view
 * over this; all orchestration and state logic lives here so it can be unit
 * tested with a mock provider.
 */
import { t } from '@ranuts/shared/i18n';
import { runAgent } from '@ranuts/agent-core/runtime';
import type { HistoryStorage } from './storage';
import type { AgentTool } from '@ranuts/agent-core/types';
import type { LLMMessage, LLMProvider } from '@ranuts/agent-core/llm/types';

export interface ChatTurn {
  role: 'user' | 'agent' | 'tool' | 'error';
  text: string;
}

export interface AgentChatControllerOptions {
  tools?: Record<string, AgentTool>;
  maxIterations?: number;
  /** Called with each streamed assistant text delta (live-render the bubble). */
  onAgentDelta?: (delta: string) => void;
  /** Called when a streamed assistant turn completes (close the live bubble). */
  onAgentStreamEnd?: () => void;
  /** Persist/restore conversation history across reloads. */
  storage?: HistoryStorage;
}

export class AgentChatController {
  private history: LLMMessage[] = [];
  private running = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly provider: LLMProvider,
    private readonly onTurn: (turn: ChatTurn) => void,
    private readonly options: AgentChatControllerOptions = {},
  ) {
    // Restore prior conversation so a rebuilt controller (provider switch) or a
    // page reload continues with the model's full context.
    this.history = options.storage?.load() ?? [];
  }

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
          if (event.type === 'assistant_delta') {
            this.options.onAgentDelta?.(event.text);
          } else if (event.type === 'tool_call') {
            this.onTurn({ role: 'tool', text: t('agentToolCallPrefix') + event.name });
          } else if (event.type === 'tool_result' && event.isError) {
            this.onTurn({ role: 'error', text: t('agentToolErrorPrefix') + event.content });
          } else if (event.type === 'assistant') {
            // A streamed turn was already rendered via deltas — just close the
            // live bubble. Without a delta handler wired, fall back to emitting
            // the whole turn so the text is never lost.
            if (event.streamed && this.options.onAgentDelta) {
              this.options.onAgentStreamEnd?.();
            } else if (event.text) {
              this.onTurn({ role: 'agent', text: event.text });
            }
          }
        },
      });
      this.history = result.messages;
      this.options.storage?.save(this.history);
      if (result.aborted) {
        this.onTurn({ role: 'error', text: t('agentStopped') });
      } else if (result.stoppedOnLimit) {
        this.onTurn({ role: 'error', text: t('agentMaxSteps') });
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

  /** Clear the conversation history (and its persisted copy). */
  reset(): void {
    this.history = [];
    this.options.storage?.clear();
  }
}
