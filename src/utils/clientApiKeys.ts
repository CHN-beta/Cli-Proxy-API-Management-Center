/**
 * 客户端 API 密钥（access.api-keys）的纯逻辑：
 * 读取归一化、写回裁剪、脏值比较与额度进度计算。
 *
 * used / current-month / key-hash 由后端维护，不参与写回与脏值判断。
 */
import type { ClientApiKeyEntry, ClientApiKeyWriteEntry } from '@/types/config';

const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 空 / 非法值返回 undefined；显式 null 表示「不限额度」。 */
const readQuota = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  let numeric: number;
  if (typeof value === 'number') numeric = value;
  else if (typeof value === 'string' && value.trim()) numeric = Number(value);
  else return undefined;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
};

const readNonNegative = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
};

/**
 * 接受字符串（旧版仅存密钥）或对象；缺少密钥的条目直接丢弃，避免空行进入表单。
 */
export function normalizeClientApiKeyEntry(entry: unknown): ClientApiKeyEntry | null {
  if (typeof entry === 'string') {
    const key = entry.trim();
    return key ? { key } : null;
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const record = entry as Record<string, unknown>;
  const key = trimmed(record.key);
  if (!key) return null;

  const result: ClientApiKeyEntry = { key };

  const name = trimmed(record.name);
  if (name) result.name = name;

  const quota = readQuota(record.quota);
  if (quota !== undefined) result.quota = quota;

  const used = readNonNegative(record.used);
  if (used !== undefined) result.used = used;

  const month = trimmed(record['current-month']);
  if (month) result['current-month'] = month;

  const keyHash = trimmed(record['key-hash']);
  if (keyHash) result['key-hash'] = keyHash;

  return result;
}

export function normalizeClientApiKeys(entries: unknown): ClientApiKeyEntry[] {
  if (!Array.isArray(entries)) return [];
  const normalized: ClientApiKeyEntry[] = [];
  for (const entry of entries) {
    const value = normalizeClientApiKeyEntry(entry);
    if (value) normalized.push(value);
  }
  return normalized;
}

/** 仅保留可写字段；空名称与空额度（null/undefined/负数）一律省略。 */
export function toClientApiKeyWriteEntry(entry: ClientApiKeyEntry): ClientApiKeyWriteEntry | null {
  const key = trimmed(entry.key);
  if (!key) return null;

  const result: ClientApiKeyWriteEntry = { key };
  const name = trimmed(entry.name);
  if (name) result.name = name;

  const quota = readQuota(entry.quota);
  if (typeof quota === 'number') result.quota = quota;

  return result;
}

export function clientApiKeyWritePayload(
  entries: readonly ClientApiKeyEntry[]
): ClientApiKeyWriteEntry[] {
  const payload: ClientApiKeyWriteEntry[] = [];
  for (const entry of entries) {
    const value = toClientApiKeyWriteEntry(entry);
    if (value) payload.push(value);
  }
  return payload;
}

/**
 * 将专用接口返回的只读计费字段合并到配置条目上，供表单展示。
 * 可写字段永远以配置条目为准；匹配键为完整密钥。
 */
export function mergeClientApiKeyUsage(
  entries: readonly ClientApiKeyEntry[],
  usageEntries: readonly ClientApiKeyEntry[]
): ClientApiKeyEntry[] {
  const usageByKey = new Map<string, ClientApiKeyEntry>();
  for (const usage of usageEntries) {
    const key = usage.key.trim();
    if (key) usageByKey.set(key, usage);
  }

  return entries.map((entry) => {
    const usage = usageByKey.get(entry.key.trim());
    if (!usage) return entry;
    const merged: ClientApiKeyEntry = { ...entry };
    if (usage.used !== undefined) merged.used = usage.used;
    if (usage['current-month']) merged['current-month'] = usage['current-month'];
    if (usage['key-hash']) merged['key-hash'] = usage['key-hash'];
    return merged;
  });
}

/** 只比较可写内容：后端刷新 used / current-month 不应把表单标记为已修改。 */
export function areClientApiKeysEqual(
  left: readonly ClientApiKeyEntry[] | undefined,
  right: readonly ClientApiKeyEntry[] | undefined
): boolean {
  const leftPayload = clientApiKeyWritePayload(left ?? []);
  const rightPayload = clientApiKeyWritePayload(right ?? []);
  if (leftPayload.length !== rightPayload.length) return false;
  return leftPayload.every(
    (entry, index) => JSON.stringify(entry) === JSON.stringify(rightPayload[index])
  );
}

export type ClientApiKeyUsageTone = 'normal' | 'warning' | 'danger' | 'unlimited';

export interface ClientApiKeyUsageSummary {
  used: number;
  month?: string;
  /** 未设置额度时为 undefined（不限额）。 */
  quota?: number;
  /** used / quota；不限额时为 null。 */
  ratio: number | null;
  /** 0–100 的展示百分比；不限额时为 null。 */
  percent: number | null;
  tone: ClientApiKeyUsageTone;
}

const WARNING_RATIO = 0.8;

export function summarizeClientApiKeyUsage(entry: ClientApiKeyEntry): ClientApiKeyUsageSummary {
  const used = readNonNegative(entry.used) ?? 0;
  const month = entry['current-month'] || undefined;
  const quota = readQuota(entry.quota);

  if (typeof quota !== 'number') {
    return { used, month, ratio: null, percent: null, tone: 'unlimited' };
  }

  const ratio = quota === 0 ? (used > 0 ? Number.POSITIVE_INFINITY : 0) : used / quota;
  const percent = Math.min(100, Math.max(0, ratio * 100));
  const tone: ClientApiKeyUsageTone =
    ratio >= 1 ? 'danger' : ratio >= WARNING_RATIO ? 'warning' : 'normal';

  return { used, month, quota, ratio, percent, tone };
}
