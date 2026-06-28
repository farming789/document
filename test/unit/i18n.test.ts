import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, getOnlyOfficeLang, LanguageCode, setLanguage, t } from '@ranuts/shared/i18n';

describe('i18n', () => {
  afterEach(() => {
    setLanguage(LanguageCode.EN);
  });

  it('uses English by default in the test environment', () => {
    expect(getLanguage()).toBe(LanguageCode.EN);
    expect(getOnlyOfficeLang()).toBe('en');
  });

  it('returns known translations for the active language', () => {
    expect(t('documentLoaded')).toBe('Document loaded: ');

    setLanguage(LanguageCode.ZH);

    expect(getLanguage()).toBe(LanguageCode.ZH);
    expect(getOnlyOfficeLang()).toBe('zh-CN');
    expect(t('documentLoaded')).toBe('文档加载完成：');
  });

  it('falls back to the key for unknown translations', () => {
    expect(t('missing.translation.key' as Parameters<typeof t>[0])).toBe('missing.translation.key');
  });

  it('has non-empty agent-panel translations in both languages', () => {
    const agentKeys = [
      'agentTitle',
      'agentSend',
      'agentStop',
      'agentClear',
      'agentQuote',
      'agentReviewMode',
      'agentProviderClaude',
      'agentProviderOpenAI',
      'agentProviderLocal',
      'agentLoadModel',
      'agentNeedKey',
      'agentStopped',
      'agentToolCallPrefix',
    ] as const;
    for (const lang of [LanguageCode.EN, LanguageCode.ZH]) {
      setLanguage(lang);
      for (const key of agentKeys) {
        expect(t(key), `${key} (${lang})`).toBeTruthy();
      }
    }
  });
});
