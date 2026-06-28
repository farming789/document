/**
 * WebLLM offline LLM provider.
 *
 * Runs a quantized model fully in-browser via @mlc-ai/web-llm (WebGPU) — no API
 * key, no network once the model is cached. WebLLM speaks the OpenAI
 * chat-completions format, so it reuses the shared converters in openai-format.ts.
 *
 * The @mlc-ai/web-llm import is dynamic (inside engine creation) so the heavy
 * runtime + model loader only loads when offline mode is actually used. The
 * engine is injectable so the provider can be unit tested without WebGPU or a
 * model download.
 */
import {
  accumulateOpenAIStream,
  type OpenAICompletion,
  type OpenAIStreamChunk,
  parseOpenAIResponse,
  toOpenAIMessages,
  toOpenAITools,
} from './openai-format';
import { DEFAULT_SYSTEM_PROMPT } from './prompt';
import type { LLMMessage, LLMProvider, LLMResponse, LLMToolDef } from './types';

/** A selectable local model. `size` is an approximate download size. */
export interface WebLLMModel {
  id: string;
  label: string;
  size: string;
}

/**
 * Local models that support **function calling** — required for the agent's
 * tool use. WebLLM only enables tools on the Hermes family, so the small
 * Llama/Qwen/Phi models (which can't call tools) are intentionally excluded.
 * These are 7–8B, hence the ~4 GB+ downloads.
 */
export const WEBLLM_MODELS: WebLLMModel[] = [
  { id: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC', label: 'Hermes 2 Pro · Mistral 7B（最小，支持工具）', size: '~4.0 GB' },
  { id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC', label: 'Hermes 3 · Llama 3.1 8B（更强）', size: '~4.7 GB' },
  { id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC', label: 'Hermes 2 Pro · Llama 3 8B', size: '~4.7 GB' },
];

/** The default tool-capable model (smallest of the supported set). */
export const DEFAULT_WEBLLM_MODEL = 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC';

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

/**
 * Whether a model's weights are already cached in the browser (Cache API).
 * When true, loading it skips the download and only re-initialises from cache
 * (fast, no network) — so a page refresh never re-downloads. Returns false if
 * the SDK can't be loaded or the check throws.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

export interface WebLLMProviderOptions {
  model?: string;
  systemPrompt?: string;
  /** Inject an engine (tests); otherwise one is created lazily on first use. */
  engine?: WebLLMEngine;
  /** Called with download/load progress while the model initialises. */
  onProgress?: (progress: InitProgress) => void;
}

export class WebLLMProvider implements LLMProvider {
  readonly name = 'webllm';
  readonly model: string;
  private readonly systemPrompt: string;
  private readonly onProgress?: (progress: InitProgress) => void;
  private engine?: WebLLMEngine;
  private enginePromise?: Promise<WebLLMEngine>;

  constructor(options: WebLLMProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_WEBLLM_MODEL;
    this.systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.onProgress = options.onProgress;
    this.engine = options.engine;
  }

  isReady(): boolean {
    return !!this.engine || isWebGPUAvailable();
  }

  /** Download/load the model now (so the first message isn't blocked on it). */
  async preload(): Promise<void> {
    await this.getEngine();
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
      // Hermes function calling forbids a custom system prompt, so omit it when
      // sending tools (WebLLM injects its own tool-calling system prompt).
      messages: toOpenAIMessages(messages, tools.length ? undefined : this.systemPrompt),
      tools: toOpenAITools(tools),
      tool_choice: 'auto',
    });
    return parseOpenAIResponse(completion);
  }

  async chatStream(
    messages: LLMMessage[],
    tools: LLMToolDef[],
    onDelta: (textDelta: string) => void,
  ): Promise<LLMResponse> {
    const engine = await this.getEngine();
    // With `stream: true` WebLLM returns an async iterable of OpenAI-format
    // chunks instead of a completion; the shared accumulator folds them back
    // into a completion that parses identically to the non-streaming path.
    const stream = (await engine.chat.completions.create({
      // See chat(): Hermes + tools forbids a custom system prompt.
      messages: toOpenAIMessages(messages, tools.length ? undefined : this.systemPrompt),
      tools: toOpenAITools(tools),
      tool_choice: 'auto',
      stream: true,
    })) as unknown as AsyncIterable<OpenAIStreamChunk>;
    const completion = await accumulateOpenAIStream(stream, onDelta);
    return parseOpenAIResponse(completion);
  }
}
