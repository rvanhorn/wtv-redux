/**
 * Accent colors the user can choose in Settings. Each `text` value is a near-black tint of the
 * same hue so primary buttons keep readable labels. Every `color` reaches at least 6.5:1 against
 * the dark surfaces, which lets the accent also serve as small text and focus rings.
 */
export const ACCENT_OPTIONS = [
  { id: 'gold', label: 'Gold', color: '#f4ce68', text: '#17140d' },
  { id: 'ember', label: 'Ember', color: '#ff9d4d', text: '#1a0f07' },
  { id: 'crimson', label: 'Crimson', color: '#ff6b6b', text: '#1c0a0a' },
  { id: 'verdant', label: 'Verdant', color: '#4fd1a1', text: '#07170f' },
  { id: 'ultramarine', label: 'Ultramarine', color: '#7aa2ff', text: '#0a1024' },
  { id: 'amethyst', label: 'Amethyst', color: '#c39bff', text: '#130b1f' },
];

export const DEFAULT_ACCENT_ID = ACCENT_OPTIONS[0].id;

export function isAccentId(value) {
  return ACCENT_OPTIONS.some((option) => option.id === value);
}

export function accentOption(id) {
  return ACCENT_OPTIONS.find((option) => option.id === id) || ACCENT_OPTIONS[0];
}

export function applyAccent(appElement, id) {
  if (!appElement) return;
  const option = accentOption(id);
  appElement.dataset.accent = option.id;
  appElement.style.setProperty('--accent', option.color);
  appElement.style.setProperty('--accent-text', option.text);
}
