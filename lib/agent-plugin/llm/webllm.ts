/**
 * WebLLM offline LLM provider.
 *
 * Runs a quantized model fully in-browser via @mlc-ai/web-llm (WebGPU) — no API
 * key, no network once the model is cached. WebLLM speaks the OpenAI
 * chat-completions format, so this provider translates the neutral
 * LLMMessage/LLMToolDef shapes to/from OpenAI's, mirroring anthropic.ts.
 *
 * The @mlc-ai/web-llm import is dynamic (inside engine creation) so the heavy
 * runtime + model loader only loads when offline mode is actually used. The
 * engine is injectable so the pure conversion logic can be unit tested without
 * WebGPU or a model download.
 */
import { DEFAULT_SYSTEM_PROMPT } from './prompt';
import type { LLMContent, LLMMessage, LLMProvider, LLMResponse, LLMToolDef } from './types';

/** Default model: small, tool-calling capable, ~1.8 GB quantized. */
const DEFAULT_MODEL = 'Phi-3.5-mini-instruct-q4f16_1-MLC';

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}
interface OpenAICompletion {
  choices: Array<{
    message: { content?: string | null; tool_calls?: OpenAIToolCall[] };
    finish_reason?: string;
  }>;
}

/** The slice of the WebLLM engine this provider uses (eases test mocking). */
export interface WebLLMEngine {
  chat: { completions: { create(body: Record<string, unknown>): Promise<OpenAICompletion> } };
}

/** Progress report while a model downloads/loads. */
export interface InitProgress {
  progress: number;
  text: string;
}

/** Whether WebGPU (required for WebLLM) is available in this browser. */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as unknown as { gpu?: unknown }).gpu;
}

function safeParseArgs(args: string): Record<string, unknown> {
  try {
    return args ? (JSON.parse(args) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Convert neutral tool defs to OpenAI function-tool shape. */
export function toOpenAITools(tools: LLMToolDef[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
}

/** Convert neutral messages (+ system prompt) to OpenAI chat messages. */
export function toOpenAIMessages(messages: LLMMessage[], systemPrompt: string): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    let text = '';
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: OpenAIMessage[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      } else if (block.type === 'tool_result') {
        toolResults.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.content });
      }
    }
    if (message.role === 'assistant' && (text || toolCalls.length)) {
      const assistant: OpenAIMessage = { role: 'assistant', content: text || null };
      if (toolCalls.length) assistant.tool_calls = toolCalls;
      out.push(assistant);
    } else if (message.role === 'user' && text) {
      out.push({ role: 'user', content: text });
    }
    out.push(...toolResults);
  }
  return out;
}

/** Parse an OpenAI completion into the neutral {@link LLMResponse}. */
export function parseOpenAIResponse(completion: OpenAICompletion): LLMResponse {
  const choice = completion.choices?.[0];
  const message = choice?.message ?? {};
  const text = message.content ?? '';
  const toolCalls = (message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    input: safeParseArgs(call.function.arguments),
  }));
  const assistant: LLMContent[] = [];
  if (text) assistant.push({ type: 'text', text });
  for (const call of toolCalls) {
    assistant.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
  }
  return {
    text,
    toolCalls,
    stopReason: choice?.finish_reason ?? 'stop',
    assistant: { role: 'assistant', content: assistant },
  };
}

export interface WebLLMProviderOptions {
  model?: string;
  systemPrompt?: string;
  /** Inject an engine (tests); otherwise one is created lazily on first chat. */
  engine?: WebLLMEngine;
  /** Called with download/load progress while the model initialises. */
  onProgress?: (progress: InitProgress) => void;
}

export class WebLLMProvider implements LLMProvider {
  readonly name = 'webllm';
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly onProgress?: (progress: InitProgress) => void;
  private engine?: WebLLMEngine;
  private enginePromise?: Promise<WebLLMEngine>;

  constructor(options: WebLLMProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.onProgress = options.onProgress;
    this.engine = options.engine;
  }

  isReady(): boolean {
    return !!this.engine || isWebGPUAvailable();
  }

  private async getEngine(): Promise<WebLLMEngine> {
    if (this.engine) return this.engine;
    if (!this.enginePromise) {
      this.enginePromise = import('@mlc-ai/web-llm').then(async ({ CreateMLCEngine }) => {
        const engine = await CreateMLCEngine(this.model, { initProgressCallback: this.onProgress });
        this.engine = engine as unknown as WebLLMEngine;
        return this.engine;
      });
    }
    return this.enginePromise;
  }

  async chat(messages: LLMMessage[], tools: LLMToolDef[]): Promise<LLMResponse> {
    const engine = await this.getEngine();
    const completion = await engine.chat.completions.create({
      messages: toOpenAIMessages(messages, this.systemPrompt),
      tools: toOpenAITools(tools),
      tool_choice: 'auto',
    });
    return parseOpenAIResponse(completion);
  }
}
