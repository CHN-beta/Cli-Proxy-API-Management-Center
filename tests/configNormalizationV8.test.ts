import { describe, expect, test } from 'bun:test';
import { normalizeConfigResponse } from '../src/services/api/transformers';

describe('v8 persisted configuration normalization', () => {
  test('uses backend AI Studio authentication default when the persisted field is absent', () => {
    expect(normalizeConfigResponse({ 'config-version': 8 }).wsAuth).toBe(true);
    expect(
      normalizeConfigResponse({ oauth: { providers: { aistudio: { 'ws-auth': false } } } }).wsAuth
    ).toBe(false);
  });

  test('reads only Antigravity credits from the OAuth provider path', () => {
    expect(normalizeConfigResponse({}).quotaExceeded).toEqual({ antigravityCredits: false });
    for (const enabled of [true, false]) {
      const oauth = { providers: { antigravity: { 'antigravity-credits': enabled } } };
      expect(normalizeConfigResponse({ oauth }).quotaExceeded).toEqual({
        antigravityCredits: enabled,
      });
      const config = normalizeConfigResponse({
        oauth,
        'quota-exceeded': {
          'switch-project': true,
          'switch-preview-model': true,
          'antigravity-credits': !enabled,
        },
      });
      expect(config.quotaExceeded).toEqual({ antigravityCredits: enabled });
      expect(config.quotaExceeded).not.toHaveProperty('switchProject');
      expect(config.quotaExceeded).not.toHaveProperty('switchPreviewModel');
    }
    expect(
      normalizeConfigResponse({ 'quota-exceeded': { 'antigravity-credits': true } }).quotaExceeded
    ).toEqual({ antigravityCredits: false });
  });

  test('normalizes structured client access keys with backend usage fields', () => {
    const config = normalizeConfigResponse({
      access: {
        'api-keys': [
          'legacy-client',
          {
            key: ' structured-client ',
            name: ' self ',
            quota: 20,
            used: 1.2345,
            'current-month': '2026-10',
            'key-hash': 'fixture-hash',
          },
        ],
      },
    });
    expect(config.apiKeys).toEqual([
      { key: 'legacy-client' },
      {
        key: 'structured-client',
        name: 'self',
        quota: 20,
        used: 1.2345,
        'current-month': '2026-10',
        'key-hash': 'fixture-hash',
      },
    ]);
  });

  test('does not interpret legacy root settings as v8 values', () => {
    const config = normalizeConfigResponse({
      'api-keys': ['legacy-client'],
      'codex-api-key': [{ 'api-key': 'legacy-upstream' }],
      'proxy-url': 'https://old.invalid',
      'ws-auth': false,
      requests: { 'proxy-url': 'https://current.invalid' },
    });
    expect(config.apiKeys).toEqual([]);
    expect(config.codexApiKeys).toEqual([]);
    expect(config.proxyUrl).toBe('https://current.invalid');
    expect(config.wsAuth).toBe(true);
  });
});
