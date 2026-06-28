import { afterEach, describe, expect, it } from 'vitest';
import { clearApiKey, getApiKey, setApiKey } from '@ranuts/agent-core/llm/keys';

describe('agent llm keys', () => {
  afterEach(() => {
    clearApiKey('anthropic');
    clearApiKey('openai');
  });

  it('returns undefined when no key is stored', () => {
    expect(getApiKey('anthropic')).toBeUndefined();
  });

  it('stores and retrieves a key per provider', () => {
    setApiKey('anthropic', 'sk-ant-123');
    setApiKey('openai', 'sk-oai-456');
    expect(getApiKey('anthropic')).toBe('sk-ant-123');
    expect(getApiKey('openai')).toBe('sk-oai-456');
  });

  it('treats a blank stored value as unset', () => {
    setApiKey('anthropic', '');
    expect(getApiKey('anthropic')).toBeUndefined();
  });

  it('clearApiKey removes the key', () => {
    setApiKey('anthropic', 'sk-ant-123');
    clearApiKey('anthropic');
    expect(getApiKey('anthropic')).toBeUndefined();
  });
});
