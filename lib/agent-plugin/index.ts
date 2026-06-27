/**
 * Agent plugin — top-level public API.
 *
 * Composes four independent layers; import from here rather than reaching into
 * subpaths, so internal file moves don't ripple out to callers:
 *
 *   ui  →  runtime  →  tools + editor-bridge (OnlyOffice)
 *                  →  llm (provider-agnostic, no editor dependency)
 *
 * The app entry only needs {@link createAgentPanel}; the rest is exported for
 * tests and future consumers (e.g. a WebMCP bridge reusing the tools/runtime).
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
export type { AgentTool, JsonSchema } from './types';

// Orchestration
export { type AgentEvent, type AgentRunOptions, type AgentRunResult, runAgent, toLLMToolDefs } from './runtime';

// LLM provider layer
export * from './llm';

// UI
export * from './ui';
