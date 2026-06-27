/**
 * UI layer — public API.
 *
 * {@link AgentChatController} is the framework-free, testable core (turns in,
 * turn callbacks out); {@link createAgentPanel} is the thin DOM panel that wires
 * the controller to the editor and an {@link LLMProvider}.
 */
export { AgentChatController, type AgentChatControllerOptions, type ChatTurn } from './controller';
export { createAgentPanel } from './panel';
