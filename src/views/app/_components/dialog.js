import { makeElement } from '../../../utils/dom.js';

// Slightly longer than the CSS fade so the transitionend listener normally wins.
const DIALOG_FADE_FALLBACK_MS = 320;

/** The one modal host shared by the details and settings dialogs. */
export function createDialogHost(state) {
  function presentDialog(...children) {
    const dialog = state.refs.dialog;
    const panel = makeElement('div', 'whtv-dialogpanel');
    panel.append(...children);
    dialog.replaceChildren(panel);
    delete dialog.dataset.closing;
    if (!dialog.open) dialog.showModal();
    panel.scrollTop = 0;
  }

  function closeDialog() {
    const dialog = state.refs.dialog;
    if (!dialog?.open || dialog.dataset.closing) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close();
      return;
    }
    dialog.dataset.closing = 'true';
    const finish = () => {
      clearTimeout(fallbackTimer);
      dialog.removeEventListener('transitionend', handleTransitionEnd);
      if (dialog.open) dialog.close();
    };
    const handleTransitionEnd = (event) => {
      if (event.target === dialog && event.propertyName === 'opacity') finish();
    };
    dialog.addEventListener('transitionend', handleTransitionEnd);
    // Fallback in case the browser drops the transitionend event, for example when the tab is hidden.
    const fallbackTimer = setTimeout(finish, DIALOG_FADE_FALLBACK_MS);
  }

  /** Attach to the dialog element of a freshly mounted shell. */
  function installDialogListeners() {
    const dialog = state.refs.dialog;
    dialog.addEventListener('click', (event) => {
      // The dialog element is the full-viewport dim layer, so a click on it is a click outside the panel.
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener('cancel', (event) => {
      if (dialog.dataset.closing) return;
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('close', () => {
      delete dialog.dataset.closing;
      state.detailId = '';
      state.settingsOpen = false;
      const target = state.dialogTrigger;
      if (target?.isConnected && !target.closest('[hidden]')) target.focus({ preventScroll: true });
    });
  }

  return { presentDialog, closeDialog, installDialogListeners };
}
