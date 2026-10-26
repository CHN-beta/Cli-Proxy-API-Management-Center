/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from './provider';

export interface QuotaExceededConfig {
  antigravityCredits?: boolean;
}

/**
 * Client access key at `access.api-keys`.
 * `used`, `current-month` and `key-hash` are backend-owned and never written back.
 */
export interface ClientApiKeyEntry {
  key: string;
  name?: string;
  /** Monthly USD quota; `null`/absent means unlimited. */
  quota?: number | null;
  /** Current-month USD spend. */
  used?: number;
  /** Billing month, e.g. `"2026-10"`. */
  'current-month'?: string;
  /** SHA-256 hex digest of the key. */
  'key-hash'?: string;
}

/** Writable subset accepted by `PUT /config/access/api-keys`. */
export interface ClientApiKeyWriteEntry {
  key: string;
  name?: string;
  quota?: number;
}

export interface Config {
  providerGroups?: Record<string, unknown>;
  debug?: boolean;
  proxyUrl?: string;
  requestRetry?: number;
  quotaExceeded?: QuotaExceededConfig;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
  routingStrategy?: string;
  apiKeys?: ClientApiKeyEntry[];
  geminiApiKeys?: GeminiKeyConfig[];
  interactionsApiKeys?: GeminiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  metaApiKeys?: ProviderKeyConfig[];
  xaiApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'quota-exceeded'
  | 'request-log'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'force-model-prefix'
  | 'routing/strategy'
  | 'api-keys'
  | 'gemini-api-key'
  | 'interactions-api-key'
  | 'codex-api-key'
  | 'meta-api-key'
  | 'xai-api-key'
  | 'claude-api-key'
  | 'vertex-api-key'
  | 'openai-compatibility'
  | 'oauth-excluded-models';
