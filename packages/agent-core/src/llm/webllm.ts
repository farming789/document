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
  type OpenAIMessage,
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
  { id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC', label: 'Hermes 3 · Llama 3.1 8B（推荐，工具最佳）', size: '~4.7 GB' },
  { id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC', label: 'Hermes 2 Pro · Llama 3 8B', size: '~4.7 GB' },
  { id: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC', label: 'Hermes 2 Pro · Mistral 7B（最小）', size: '~4.0 GB' },
];

/** The default tool-capable model — the strongest of the supported set. */
export const DEFAULT_WEBLLM_MODEL = 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC';

/**
 * Generation params tuned for small local models: a low temperature for stable
 * tool-calling, and a token cap to bound run-away repetition (a common failure
 * mode of 7–8B models that the user can otherwise only escape via Stop).
 */
const GENERATION_PARAMS = { temperature: 0.3, max_tokens: 1024 } as const;

/** The slice of the WebLLM engine this provider uses (eases test mocking). */
export interface WebLLMEngine {
  chat: { completions: { create(body: Record<string, unknown>): Promise<OpenAICompletion> } };
  /** Stop the in-flight generation (so Stop works mid-stream). */
  interruptGenerate?(): void | Promise<void>;
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

  /**
   * Build request messages for a small local model. Hermes + tools forbids a
   * custom system prompt, so when tools are present we fold the guidance into the
   * first user message instead (the user role is allowed) — giving the weak local
   * model the framing it needs without tripping WebLLM's restriction.
   */
  private buildMessages(messages: LLMMessage[], tools: LLMToolDef[]): OpenAIMessage[] {
    if (!tools.length) return toOpenAIMessages(messages, this.systemPrompt);
    const out = toOpenAIMessages(messages, undefined);
    const firstUser = out.find((m) => m.role === 'user' && typeof m.content === 'string');
    if (firstUser) firstUser.content = `${this.systemPrompt}\n\n${firstUser.content ?? ''}`;
    return out;
  }

  async chat(messages: LLMMessage[], tools: LLMToolDef[], signal?: AbortSignal): Promise<LLMResponse> {
    const engine = await this.getEngine();
    const onAbort = () => void engine.interruptGenerate?.();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const completion = await engine.chat.completions.create({
        messages: this.buildMessages(messages, tools),
        tools: toOpenAITools(tools),
        tool_choice: 'auto',
        ...GENERATION_PARAMS,
      });
      return parseOpenAIResponse(completion);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async chatStream(
    messages: LLMMessage[],
    tools: LLMToolDef[],
    onDelta: (textDelta: string) => void,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    const engine = await this.getEngine();
    // Stop: interrupt the engine so it stops generating, and the accumulator
    // (also passed the signal) breaks out of the chunk loop.
    const onAbort = () => void engine.interruptGenerate?.();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      // With `stream: true` WebLLM returns an async iterable of OpenAI-format
      // chunks instead of a completion; the shared accumulator folds them back
      // into a completion that parses identically to the non-streaming path.
      const stream = (await engine.chat.completions.create({
        messages: this.buildMessages(messages, tools),
        tools: toOpenAITools(tools),
        tool_choice: 'auto',
        ...GENERATION_PARAMS,
        stream: true,
      })) as unknown as AsyncIterable<OpenAIStreamChunk>;
      const completion = await accumulateOpenAIStream(stream, onDelta, signal);
      return parseOpenAIResponse(completion);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
