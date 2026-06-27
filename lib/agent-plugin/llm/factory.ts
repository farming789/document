/**
 * Provider factory + default selection.
 *
 * One place to construct an {@link LLMProvider} by id, and a heuristic for which
 * to default to: offline (WebLLM) when WebGPU is available, else cloud (Claude).
 */
import { AnthropicProvider, type AnthropicProviderOptions } from './anthropic';
import type { LLMProvider } from './types';
import { isWebGPUAvailable, WebLLMProvider, type WebLLMProviderOptions } from './webllm';

export type ProviderId = 'anthropic' | 'webllm';

export function createProvider(
  id: ProviderId,
  options: AnthropicProviderOptions & WebLLMProviderOptions = {},
): LLMProvider {
  return id === 'webllm' ? new WebLLMProvider(options) : new AnthropicProvider(options);
}

/** Suggested default provider: offline when WebGPU is present, else cloud. */
export function defaultProviderId(): ProviderId {
  return isWebGPUAvailable() ? 'webllm' : 'anthropic';
}
