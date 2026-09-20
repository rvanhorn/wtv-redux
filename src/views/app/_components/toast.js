import { setText } from '../../../components/icons.js';

const TOAST_VISIBLE_MS = 6500;

export function createToast(state) {
  function showToast(message, undo = null) {
    const refs = state.refs;
    if (!refs.toast) return;
    clearTimeout(state.toastTimer);
    state.undoAction = undo;
    setText(refs.toastText, message);
    refs.toastUndo.hidden = !undo;
    refs.toast.hidden = false;
    state.toastTimer = setTimeout(() => {
      if (state.refs.toast) state.refs.toast.hidden = true;
      state.undoAction = null;
    }, TOAST_VISIBLE_MS);
  }

  return { showToast };
}
