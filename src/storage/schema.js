import { defaultStore } from '../constants.js';

export const CURRENT_SCHEMA_VERSION = 2;

export function normalizeStore(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saved: source.saved && typeof source.saved === 'object' && !Array.isArray(source.saved) ? source.saved : {},
    watched:
      source.watched && typeof source.watched === 'object' && !Array.isArray(source.watched) ? source.watched : {},
    prefs: {
      ...defaultStore.prefs,
      ...(source.prefs && typeof source.prefs === 'object' ? source.prefs : {}),
    },
  };
}
