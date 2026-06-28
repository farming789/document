/**
 * @ranuts/agent-core — editor-agnostic agent core.
 *
 * Two layers, neither aware of any UI or editor:
 *   - llm/      provider-neutral LLM interface + concrete providers (Claude /
 *               OpenAI / Gemini / Ollama / WebLLM) behind a factory.
 *   - runtime   the tool-use loop tying an LLMProvider to an AgentTool registry.
 *
 * Bring your own tools (anything matching {@link AgentTool}) and your own UI.
 */
export type { AgentTool, JsonSchema } from './types';
export {
  type AgentEvent,
  type AgentRunOptions,
  type AgentRunResult,
  runAgent,
  toLLMToolDefs,
} from './runtime';
export * from './llm';
