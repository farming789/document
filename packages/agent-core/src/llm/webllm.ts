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
 * Curated, cost-effective local models (all tool-calling capable). Smaller =
 * faster + smaller download but lower quality.
 */
export const WEBLLM_MODELS: WebLLMModel[] = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B（最快）', size: '~0.9 GB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B（轻量）', size: '~1.0 GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi-3.5 mini（均衡，推荐）', size: '~1.8 GB' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B（更强）', size: '~2.2 GB' },
];

/** The default balanced model. */
export const DEFAULT_WEBLLM_MODEL = 'Phi-3.5-mini-instruct-q4f16_1-MLC';

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
      messages: toOpenAIMessages(messages, this.systemPrompt),
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
      messages: toOpenAIMessages(messages, this.systemPrompt),
      tools: toOpenAITools(tools),
      tool_choice: 'auto',
      stream: true,
    })) as unknown as AsyncIterable<OpenAIStreamChunk>;
    const completion = await accumulateOpenAIStream(stream, onDelta);
    return parseOpenAIResponse(completion);
  }
}
