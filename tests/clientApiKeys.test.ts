import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { ApiKeysCardEditor } from '@/features/config/components/blocks/ApiKeysCardEditor';
import {
  areClientApiKeysEqual,
  clientApiKeyWritePayload,
  mergeClientApiKeyUsage,
  normalizeClientApiKeys,
  summarizeClientApiKeyUsage,
} from '@/utils/clientApiKeys';
import { formatUsd } from '@/utils/format';
import { LANGUAGE_ORDER } from '@/utils/constants';
import type { ClientApiKeyEntry } from '@/types/config';

describe('client API key normalization', () => {
  test('accepts legacy string entries and trims structured fields', () => {
    expect(
      normalizeClientApiKeys([
        '  fixture-legacy  ',
        '',
        {
          key: '  fixture-structured  ',
          name: '  self  ',
          quota: '20.5',
          used: 1.2345,
          'current-month': ' 2026-10 ',
          'key-hash': ' abc123 ',
        },
        { name: 'missing key' },
        null,
      ])
    ).toEqual([
      { key: 'fixture-legacy' },
      {
        key: 'fixture-structured',
        name: 'self',
        quota: 20.5,
        used: 1.2345,
        'current-month': '2026-10',
        'key-hash': 'abc123',
      },
    ]);
  });

  test('treats null quota as unlimited and rejects negative or invalid values', () => {
    expect(normalizeClientApiKeys([{ key: 'a', quota: null }])).toEqual([{ key: 'a', quota: null }]);
    expect(normalizeClientApiKeys([{ key: 'a', quota: -1 }])).toEqual([{ key: 'a' }]);
    expect(normalizeClientApiKeys([{ key: 'a', quota: 'unlimited' }])).toEqual([{ key: 'a' }]);
  });

  test('ignores non-array payloads', () => {
    expect(normalizeClientApiKeys(undefined)).toEqual([]);
    expect(normalizeClientApiKeys({ key: 'a' })).toEqual([]);
  });
});

describe('client API key write payload', () => {
  test('strips backend-owned fields and omits empty name/quota', () => {
    const entries: ClientApiKeyEntry[] = [
      {
        key: ' fixture-a ',
        name: ' self ',
        quota: 20,
        used: 1.2345,
        'current-month': '2026-10',
        'key-hash': 'abc123',
      },
      { key: ' fixture-b ', name: '   ', quota: null, used: 2 },
      { key: '   ' },
    ];

    expect(clientApiKeyWritePayload(entries)).toEqual([
      { key: 'fixture-a', name: 'self', quota: 20 },
      { key: 'fixture-b' },
    ]);
  });

  test('equality ignores read-only usage refreshes', () => {
    const before: ClientApiKeyEntry[] = [
      { key: 'a', name: 'self', quota: 20, used: 1, 'current-month': '2026-10', 'key-hash': 'h1' },
    ];
    const refreshed: ClientApiKeyEntry[] = [
      { key: 'a', name: 'self', quota: 20, used: 9, 'current-month': '2026-10', 'key-hash': 'h1' },
    ];
    expect(areClientApiKeysEqual(before, refreshed)).toBe(true);

    const edited: ClientApiKeyEntry[] = [{ key: 'a', name: 'self', quota: 25 }];
    expect(areClientApiKeysEqual(before, edited)).toBe(false);
  });

  test('merges billing state by full key without taking editable fields from usage', () => {
    const configured: ClientApiKeyEntry[] = [
      { key: 'a', name: 'local-name', quota: 10 },
      { key: 'b' },
    ];
    const usage: ClientApiKeyEntry[] = [
      {
        key: 'a',
        name: 'server-name',
        quota: 999,
        used: 1.2345,
        'current-month': '2026-10',
        'key-hash': 'h1',
      },
      { key: 'unknown', used: 3 },
    ];
    expect(mergeClientApiKeyUsage(configured, usage)).toEqual([
      {
        key: 'a',
        name: 'local-name',
        quota: 10,
        used: 1.2345,
        'current-month': '2026-10',
        'key-hash': 'h1',
      },
      { key: 'b' },
    ]);
  });
});

describe('client API key usage', () => {
  test('tracks quota thresholds', () => {
    expect(summarizeClientApiKeyUsage({ key: 'a', used: 1, quota: 100 })).toMatchObject({
      quota: 100,
      percent: 1,
      tone: 'normal',
    });
    expect(summarizeClientApiKeyUsage({ key: 'a', used: 8, quota: 10 }).tone).toBe('warning');
    expect(summarizeClientApiKeyUsage({ key: 'a', used: 10, quota: 10 })).toMatchObject({
      percent: 100,
      tone: 'danger',
    });
    expect(summarizeClientApiKeyUsage({ key: 'a', used: 15, quota: 10 }).percent).toBe(100);
  });

  test('treats missing or null quota as unlimited', () => {
    for (const quota of [undefined, null]) {
      expect(
        summarizeClientApiKeyUsage({ key: 'a', used: 1.5, quota, 'current-month': '2026-10' })
      ).toEqual({
        used: 1.5,
        month: '2026-10',
        ratio: null,
        percent: null,
        tone: 'unlimited',
      });
    }
  });

  test('a zero quota reports any spend as fully consumed', () => {
    expect(summarizeClientApiKeyUsage({ key: 'a', used: 0.1, quota: 0 })).toMatchObject({
      percent: 100,
      tone: 'danger',
    });
    expect(summarizeClientApiKeyUsage({ key: 'a', quota: 0 })).toMatchObject({
      percent: 0,
      tone: 'normal',
    });
  });

  test('formats USD with at least two and at most four decimals', () => {
    expect(formatUsd(20)).toBe('$20.00');
    expect(formatUsd(1.2345)).toBe('$1.2345');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('client API key locale coverage', () => {
  test('every supported language translates quota fields', () => {
    for (const locale of LANGUAGE_ORDER) {
      const translation = (i18n.getResource(locale, 'translation') ?? {}) as Record<string, unknown>;
      const resolve = (path: string): unknown =>
        path.split('.').reduce<unknown>((node, part) => {
          if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
          return undefined;
        }, translation);
      for (const key of [
        'config_management.visual.api_keys.quota_label',
        'config_management.visual.api_keys.quota_placeholder',
        'config_management.visual.api_keys.quota_hint',
        'config_management.visual.api_keys.error_quota_invalid',
        'config_management.visual.api_keys.quota.usage',
        'config_management.visual.api_keys.quota.unlimited',
        'config_management.visual.api_keys.quota.aria_label',
        'config_management.visual.api_keys.quota.month_label',
      ]) {
        expect(typeof resolve(key)).toBe('string');
      }
    }
  });
});

describe('ApiKeysCardEditor rendering', () => {
  test('shows names, masked keys, quota progress and unlimited usage', async () => {
    await i18n.changeLanguage('en');
    const markup = renderToStaticMarkup(
      createElement(ApiKeysCardEditor, {
        value: [
          {
            key: 'sk-quota-first-secret',
            name: 'self',
            quota: 20,
            used: 1.2345,
            'current-month': '2026-10',
          },
          { key: 'sk-quota-second-secret', used: 0.5 },
        ],
        onChange: () => {},
      })
    );

    expect(markup).toContain('self');
    expect(markup).toContain('2026-10');
    expect(markup).not.toContain('sk-quota-first-secret');
    expect(markup).not.toContain('sk-quota-second-secret');
    expect(markup).toContain('$1.2345');
    expect(markup).toContain('$20.00');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain(i18n.t('config_management.visual.api_keys.quota.unlimited', { used: '$0.50' }));
  });
});
