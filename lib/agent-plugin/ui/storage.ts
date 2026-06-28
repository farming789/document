/**
 * Conversation persistence for the agent panel.
 *
 * The model-facing history ({@link LLMMessage}[]) is serialised to localStorage
 * so a page refresh keeps the conversation and its context. On load the panel
 * also needs to *re-render* the conversation, so {@link historyToTurns} maps the
 * stored message history back to display {@link ChatTurn}s using the same
 * role/prefix conventions the controller emits live.
 */
import { localStorageGetItem, localStorageSetItem } from 'ranuts/utils';
import { t } from '@ranuts/shared/i18n';
import type { ChatTurn } from './controller';
import type { LLMMessage } from '@ranuts/agent-core/llm/types';

const STORAGE_PREFIX = 'agent_history_';

/** Persisted conversation history (model-facing messages). */
export interface HistoryStorage {
  load(): LLMMessage[];
  save(messages: LLMMessage[]): void;
  clear(): void;
}

/** A localStorage-backed history store, namespaced by `sessionKey`. */
export function createHistoryStorage(sessionKey = 'default'): HistoryStorage {
  const key = `${STORAGE_PREFIX}${sessionKey}`;
  return {
    load(): LLMMessage[] {
      const raw = localStorageGetItem(key);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as LLMMessage[]) : [];
      } catch {
        return [];
      }
    },
    save(messages: LLMMessage[]): void {
      try {
        localStorageSetItem(key, JSON.stringify(messages));
      } catch {
        // Ignore quota / serialisation failures — persistence is best-effort.
      }
    },
    clear(): void {
      localStorageSetItem(key, '');
    },
  };
}

/**
 * Rebuild display turns from persisted history. Mirrors the controller's live
 * event→turn mapping: assistant text → agent, tool_use → tool, errored
 * tool_result → error, plain user/assistant strings → their role.
 */
export function historyToTurns(messages: LLMMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      if (message.content) {
        turns.push({ role: message.role === 'assistant' ? 'agent' : 'user', text: message.content });
      }
      continue;
    }
    for (const block of message.content) {
      if (block.type === 'text') {
        if (block.text) turns.push({ role: 'agent', text: block.text });
      } else if (block.type === 'tool_use') {
        turns.push({ role: 'tool', text: t('agentToolCallPrefix') + block.name });
      } else if (block.type === 'tool_result' && block.isError) {
        turns.push({ role: 'error', text: t('agentToolErrorPrefix') + block.content });
      }
    }
  }
  return turns;
}
