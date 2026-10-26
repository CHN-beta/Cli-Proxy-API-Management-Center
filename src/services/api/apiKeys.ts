/** Client access keys are a direct config list, not upstream provider groups. */
import type { ClientApiKeyEntry } from '@/types/config';
import { clientApiKeyWritePayload, normalizeClientApiKeys } from '@/utils/clientApiKeys';
import { apiClient } from './client';
import { getConfigValue, guardConfigConnection } from './configValue';

const PATH = '/config/access/api-keys';

const assertIndex = (keys: ClientApiKeyEntry[], index: number): void => {
  if (!Number.isInteger(index) || index < 0 || index >= keys.length) {
    throw new RangeError('API key index out of range');
  }
};

export const apiKeysApi = {
  async list(): Promise<ClientApiKeyEntry[]> {
    const data = await getConfigValue<unknown>(PATH, []);
    return normalizeClientApiKeys(data);
  },

  /** PUT accepts only key/name/quota; usage fields belong to the backend. */
  replace: (keys: ClientApiKeyEntry[]) => apiClient.put(PATH, clientApiKeyWritePayload(keys)),

  async update(index: number, value: string) {
    const assertConnection = guardConfigConnection();
    const keys = await apiKeysApi.list();
    assertConnection();
    assertIndex(keys, index);
    keys[index] = { ...keys[index], key: value };
    return apiKeysApi.replace(keys);
  },

  async delete(index: number) {
    const assertConnection = guardConfigConnection();
    const keys = await apiKeysApi.list();
    assertConnection();
    assertIndex(keys, index);
    keys.splice(index, 1);
    return apiKeysApi.replace(keys);
  },
};
