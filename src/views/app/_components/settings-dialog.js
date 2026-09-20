import { actionButton, icon, iconButton } from '../../../components/icons.js';
import { ACCENT_OPTIONS } from '../../../features/accent.js';
import { readImportFile } from '../../../features/import-export.js';
import { makeElement } from '../../../utils/dom.js';
import { SETTINGS_CHANGELOG_URL, SETTINGS_REPOSITORY_URL, SETTINGS_VERSION } from '../../settings.js';

function settingsSection(heading, description, ...rows) {
  const section = makeElement('section', 'whtv-settings-section');
  const label = makeElement('div', 'whtv-settings-label');
  label.append(makeElement('h3', '', heading));
  if (description) label.append(makeElement('p', '', description));
  const list = makeElement('div', 'whtv-settings-rows');
  list.append(...rows);
  section.append(label, list);
  return section;
}

function settingsRow(title, description, control, { labelFor = '', titleId = '' } = {}) {
  const row = makeElement('div', 'whtv-setting');
  const text = makeElement(labelFor ? 'label' : 'div', 'whtv-setting-text');
  if (labelFor) text.htmlFor = labelFor;
  const heading = makeElement('span', 'whtv-setting-title', title);
  if (titleId) heading.id = titleId;
  text.append(heading, makeElement('span', 'whtv-setting-description', description));
  const slot = makeElement('div', 'whtv-setting-control');
  slot.append(control);
  row.append(text, slot);
  return row;
}

function accentPicker(titleId, currentAccent) {
  const group = makeElement('div', 'whtv-accent-options');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', titleId);
  ACCENT_OPTIONS.forEach((option) => {
    const label = makeElement('label', 'whtv-accent-option');
    label.style.setProperty('--swatch', option.color);
    label.style.setProperty('--swatch-text', option.text);
    label.title = option.label;
    const input = makeElement('input');
    input.type = 'radio';
    input.name = 'whtv-accent';
    input.value = option.id;
    input.checked = option.id === currentAccent;
    input.dataset.preference = 'accent';
    input.setAttribute('aria-label', option.label);
    const swatch = makeElement('span', 'whtv-accent-swatch');
    swatch.append(icon('check'));
    label.append(input, swatch);
    group.append(label);
  });
  return group;
}

function preferenceSwitch(name, checked, id) {
  const input = makeElement('input', 'whtv-switch');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.dataset.preference = name;
  return input;
}

function footerLink(label, href) {
  const link = makeElement('a', 'whtv-textbutton');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(icon('external'), makeElement('span', '', label));
  return link;
}

function keyHint(key, description) {
  const hint = makeElement('span', 'whtv-keyhint');
  hint.append(makeElement('kbd', '', key), makeElement('span', '', description));
  return hint;
}

/** The settings dialog. Reads the dialog host and `context.showToast` at call time. */
export function createSettingsDialog(context) {
  const { state } = context;

  function openSettings(trigger) {
    state.detailId = '';
    state.settingsOpen = true;
    state.pendingImport = null;
    state.dialogTrigger = trigger || document.activeElement;
    const body = makeElement('div', 'whtv-dialogbody whtv-settings');

    const head = makeElement('header', 'whtv-settings-head');
    const heading = makeElement('div', 'whtv-settings-heading');
    const title = makeElement('h2', '', 'Settings');
    title.id = 'whtv-dialog-title';
    heading.append(title, makeElement('p', '', 'Make Redux yours. Everything here is stored in this browser only.'));
    head.append(heading, iconButton('close-dialog', 'Close Settings', 'close', 'whtv-dialogclose'));
    body.append(head);

    body.append(
      settingsSection(
        'Appearance',
        'How the overlay looks. Changes apply immediately.',
        settingsRow(
          'Accent Color',
          'Colors the primary buttons, focus rings and highlights.',
          accentPicker('whtv-setting-accent', state.accent),
          { titleId: 'whtv-setting-accent' },
        ),
        settingsRow(
          'Featured Banner',
          'Spotlight a rotating pick for the current tab or one recommended item for the current collection.',
          preferenceSwitch('showHero', state.showHero, 'whtv-setting-hero'),
          { labelFor: 'whtv-setting-hero' },
        ),
      ),
    );

    const file = makeElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.hidden = true;
    file.dataset.importFile = 'true';
    file.addEventListener('change', () => readImportFile(state, file.files?.[0], { showToast: context.showToast }));
    const preview = makeElement('div', 'whtv-import-preview');
    preview.dataset.importPreview = 'true';
    preview.hidden = true;
    preview.setAttribute('role', 'status');
    body.append(
      settingsSection(
        'Your Lists',
        'Your watchlist and watched history never leave this browser unless you export them.',
        settingsRow(
          'Export',
          'Save both lists as a JSON file you can keep or move to another browser.',
          actionButton('export', 'Export Lists', 'download'),
        ),
        settingsRow(
          'Import',
          'Merge a file from a previous export. You see a preview first, and nothing already in your lists is removed.',
          actionButton('import', 'Choose File', 'upload'),
        ),
        file,
        preview,
      ),
    );

    body.append(
      settingsSection(
        'Catalog Data',
        state.sourceMessage,
        settingsRow(
          'Refresh Catalog',
          'Homepage data loads once per session. Reload it to pick up new releases.',
          actionButton('refresh', 'Refresh', 'refresh'),
        ),
        settingsRow(
          'Series Counts',
          'Episode counts are cached for six hours. Clear the cache to check visible series again.',
          actionButton('clear-count-cache', 'Recount', 'refresh'),
        ),
        settingsRow(
          'Artwork',
          'Episode artwork is stored with the learned catalog. Clear it when cards show missing images, so each series loads its artwork again when opened.',
          actionButton('refresh-artwork', 'Refresh', 'refresh'),
        ),
      ),
    );

    const foot = makeElement('footer', 'whtv-settings-foot');
    const hints = makeElement('div', 'whtv-keyhints');
    hints.append(keyHint('/', 'Search'), keyHint('Esc', 'Close'));
    const about = makeElement('div', 'whtv-settings-about');
    about.append(
      makeElement('span', 'whtv-settings-version', `WTV Redux v${SETTINGS_VERSION}`),
      footerLink('GitHub', SETTINGS_REPOSITORY_URL),
      footerLink('Changelog', SETTINGS_CHANGELOG_URL),
    );
    foot.append(hints, about);
    body.append(foot);

    context.presentDialog(body);
  }

  return { openSettings };
}
