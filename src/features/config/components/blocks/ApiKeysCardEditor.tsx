import { memo, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ClientApiKeyEntry } from '@/types/config';
import { apiKeysApi } from '@/services/api/apiKeys';
import {
  areClientApiKeysEqual,
  mergeClientApiKeyUsage,
  summarizeClientApiKeyUsage,
} from '@/utils/clientApiKeys';
import { copyToClipboard } from '@/utils/clipboard';
import { generateSecureApiKey } from '@/utils/apiKey';
import { formatPercent, formatUsd, maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import { ApiKeyStrengthMeter } from './ApiKeyStrengthMeter';
import styles from './Blocks.module.scss';

interface ApiKeysCardEditorProps {
  value: ClientApiKeyEntry[];
  disabled?: boolean;
  onChange: (nextValue: ClientApiKeyEntry[]) => void;
}

/** 单条密钥的当月消费 / 额度状态；不限额时不渲染进度条。 */
function ApiKeyQuotaStatus({ entry }: { entry: ClientApiKeyEntry }) {
  const { t } = useTranslation();
  const usage = summarizeClientApiKeyUsage(entry);
  const used = formatUsd(usage.used);
  const quota = usage.quota === undefined ? undefined : formatUsd(usage.quota);
  const percent = usage.percent ?? 0;
  const usageText =
    quota === undefined
      ? t('config_management.visual.api_keys.quota.unlimited', { used })
      : t('config_management.visual.api_keys.quota.usage', { used, quota });

  return (
    <span className={styles.apiKeyQuota} data-tone={usage.tone}>
      {usage.month && (
        <span
          className={styles.apiKeyQuotaMonth}
          aria-label={t('config_management.visual.api_keys.quota.month_label', {
            month: usage.month,
          })}
        >
          {usage.month}
        </span>
      )}
      <span className={styles.apiKeyQuotaText}>{usageText}</span>
      {quota !== undefined && (
        <>
          <span className={styles.apiKeyQuotaPercent}>{formatPercent(percent)}</span>
          <span
            className={styles.apiKeyQuotaTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={`${formatPercent(percent)} — ${usageText}`}
            aria-label={t('config_management.visual.api_keys.quota.aria_label')}
          >
            <span
              className={styles.apiKeyQuotaFill}
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </span>
        </>
      )}
    </span>
  );
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: ApiKeysCardEditorProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiBase = useAuthStore((state) => state.apiBase);
  const apiKeys = value;

  // 专用接口会返回当月消费；完整配置只含可写字段，因此仅用于展示，不进入表单脏值。
  const [usageEntries, setUsageEntries] = useState<ClientApiKeyEntry[]>([]);
  useEffect(() => {
    setUsageEntries([]);
    if (!apiBase) return;
    let cancelled = false;
    apiKeysApi
      .list()
      .then((entries) => {
        if (!cancelled) setUsageEntries(entries);
      })
      .catch(() => {
        // 旧后端没有该接口时保持配置中的字段即可。
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const displayApiKeys = useMemo(
    () => mergeClientApiKeyUsage(apiKeys, usageEntries),
    [apiKeys, usageEntries]
  );

  const nameInputId = useId();
  const nameHintId = `${nameInputId}-hint`;
  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const quotaInputId = useId();
  const quotaHintId = `${quotaInputId}-hint`;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [nameValue, setNameValue] = useState('');
  const [quotaValue, setQuotaValue] = useState('');
  const [formError, setFormError] = useState('');

  const openAddModal = () => {
    setEditingIndex(null);
    setInputValue('');
    setNameValue('');
    setQuotaValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (index: number) => {
    const entry = displayApiKeys[index];
    if (!entry) return;
    setEditingIndex(index);
    setInputValue(entry.key);
    setNameValue(entry.name ?? '');
    setQuotaValue(entry.quota === undefined || entry.quota === null ? '' : String(entry.quota));
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingIndex(null);
    setInputValue('');
    setNameValue('');
    setQuotaValue('');
    setFormError('');
  };

  const handleDelete = (index: number) => {
    onChange(apiKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmedKey = inputValue.trim();
    if (!trimmedKey) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmedKey)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }

    const trimmedQuota = quotaValue.trim();
    let quota: number | undefined;
    if (trimmedQuota) {
      const parsedQuota = Number(trimmedQuota);
      if (!Number.isFinite(parsedQuota) || parsedQuota < 0) {
        setFormError(t('config_management.visual.api_keys.error_quota_invalid'));
        return;
      }
      quota = parsedQuota;
    }

    // 只写可写字段；used / current-month / key-hash 由展示层的专用接口提供。
    const nextEntry: ClientApiKeyEntry = { key: trimmedKey };
    const trimmedName = nameValue.trim();
    if (trimmedName) nextEntry.name = trimmedName;
    if (quota !== undefined) nextEntry.quota = quota;

    const nextKeys =
      editingIndex === null
        ? [...apiKeys, nextEntry]
        : apiKeys.map((entry, index) => (index === editingIndex ? nextEntry : entry));

    if (!areClientApiKeysEqual(nextKeys, apiKeys)) onChange(nextKeys);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <div className={styles.apiKeys}>
      <div className={styles.apiKeysHeader}>
        <div className={styles.apiKeysCopy}>
          <span className={styles.apiKeysTitle}>
            {t('config_management.visual.api_keys.label')}
          </span>
          <span className={styles.apiKeysHint}>{t('config_management.visual.api_keys.hint')}</span>
        </div>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <ol className={styles.apiKeyList}>
          {displayApiKeys.map((entry, index) => (
            <li key={index} className={styles.apiKeyRow}>
              <span className={styles.apiKeyIndex}>#{index + 1}</span>
              <span className={styles.apiKeyMeta}>
                <span className={styles.apiKeyIdentity}>
                  {entry.name && <span className={styles.apiKeyName}>{entry.name}</span>}
                  <span className={styles.apiKeyValue}>{maskApiKey(entry.key)}</span>
                </span>
                <ApiKeyQuotaStatus entry={entry} />
              </span>
              <span className={styles.apiKeyActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(entry.key)}
                  disabled={disabled}
                >
                  {t('common.copy')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(index)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.apiKeyDelete}
                  onClick={() => handleDelete(index)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editingIndex !== null
            ? t('config_management.visual.api_keys.edit_title')
            : t('config_management.visual.api_keys.add_title')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingIndex !== null
                ? t('config_management.visual.common.update')
                : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={nameInputId}>
            {t('config_management.visual.api_keys.name_label')}
          </label>
          <input
            id={nameInputId}
            className="input"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            placeholder={t('config_management.visual.api_keys.name_placeholder')}
            aria-describedby={nameHintId}
            disabled={disabled}
          />
          <div id={nameHintId} className="hint">
            {t('config_management.visual.api_keys.name_hint')}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={apiKeyInputId}>
            {t('config_management.visual.api_keys.input_label')}
          </label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={apiKeyInputId}
              className="input"
              placeholder={t('config_management.visual.api_keys.input_placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
              aria-invalid={Boolean(formError)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={disabled}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          </div>
          <ApiKeyStrengthMeter value={inputValue} />
          <div id={apiKeyHintId} className="hint">
            {t('config_management.visual.api_keys.input_hint')}
          </div>
          {formError && (
            <div id={apiKeyErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor={quotaInputId}>
            {t('config_management.visual.api_keys.quota_label')}
          </label>
          <input
            id={quotaInputId}
            className="input"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder={t('config_management.visual.api_keys.quota_placeholder')}
            value={quotaValue}
            onChange={(event) => setQuotaValue(event.target.value)}
            aria-describedby={quotaHintId}
            disabled={disabled}
          />
          <div id={quotaHintId} className="hint">
            {t('config_management.visual.api_keys.quota_hint')}
          </div>
        </div>
      </Modal>
    </div>
  );
});
