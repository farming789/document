/**
 * API key storage for cloud LLM providers.
 *
 * Keys live in localStorage only — they never touch the global store (sensitive
 * data) and never leave the browser. Each provider has its own slot so the user
 * can configure several. Stored under `agent_api_key_<provider>`.
 */
const KEY_PREFIX = 'agent_api_key_';

/** Safe localStorage access (no-op when unavailable: SSR, blocked, quota). */
function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // best-effort — ignore quota / privacy-mode failures
  }
}

/** Return the stored API key for a provider, or undefined when unset/blank. */
export function getApiKey(provider: string): string | undefined {
  const value = read(`${KEY_PREFIX}${provider}`);
  return value ? value : undefined;
}

/** Store (or overwrite) the API key for a provider. */
export function setApiKey(provider: string, key: string): void {
  write(`${KEY_PREFIX}${provider}`, key);
}

/** Remove the stored API key for a provider. */
export function clearApiKey(provider: string): void {
  write(`${KEY_PREFIX}${provider}`, '');
}
