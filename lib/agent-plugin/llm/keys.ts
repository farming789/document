/**
 * API key storage for cloud LLM providers.
 *
 * Keys live in localStorage only — they never touch the global store (sensitive
 * data) and never leave the browser. Each provider has its own slot so the user
 * can configure several. Stored under `agent_api_key_<provider>`.
 */
import { localStorageGetItem, localStorageSetItem } from 'ranuts/utils';

const KEY_PREFIX = 'agent_api_key_';

/** Return the stored API key for a provider, or undefined when unset/blank. */
export function getApiKey(provider: string): string | undefined {
  const value = localStorageGetItem(`${KEY_PREFIX}${provider}`);
  return value ? value : undefined;
}

/** Store (or overwrite) the API key for a provider. */
export function setApiKey(provider: string, key: string): void {
  localStorageSetItem(`${KEY_PREFIX}${provider}`, key);
}

/** Remove the stored API key for a provider. */
export function clearApiKey(provider: string): void {
  localStorageSetItem(`${KEY_PREFIX}${provider}`, '');
}
