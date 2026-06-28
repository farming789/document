/**
 * Agent plugin — top-level public API.
 *
 * Composes four independent layers; import from here rather than reaching into
 * subpaths, so internal file moves don't ripple out to callers:
 *
 *   ui  →  @ranuts/agent-core (runtime + llm, editor-agnostic)
 *       →  tools + editor-bridge (OnlyOffice)
 *
 * The app entry only needs {@link createAgentPanel}; the rest is exported for
 * tests and future consumers. The provider-neutral runtime + LLM layer now live
 * in @ranuts/agent-core; this barrel re-exports them for backward compatibility.
 */

// Editor capability layer
export {
  type CommentData,
  type EditorApi,
  type EditorAsc,
  type EditorContext,
  EditorNotReadyError,
  getEditorApi,
  getEditorContext,
  requireEditorApi,
  requireEditorContext,
} from './editor-bridge';
export { agentTools } from './tools';

// Editor-agnostic core (re-exported from @ranuts/agent-core)
export type { AgentTool, JsonSchema } from '@ranuts/agent-core/types';
export { type AgentEvent, type AgentRunOptions, type AgentRunResult, runAgent, toLLMToolDefs } from '@ranuts/agent-core/runtime';
export * from '@ranuts/agent-core/llm';

// UI
export * from './ui';
