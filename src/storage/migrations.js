import { CURRENT_SCHEMA_VERSION, normalizeStore } from './schema.js';

export function migrateStore(value) {
  const normalized = normalizeStore(value);
  if (normalized.schemaVersion > CURRENT_SCHEMA_VERSION) return normalizeStore({});
  return normalized;
}
