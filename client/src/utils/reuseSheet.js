import { api } from '../api/client.js';
import { alertDialog, confirmDialog } from '../components/ConfirmDialog.jsx';

// "Use for another report": a new drafting sheet with the same site inspection (no new site visit). Opens it.
export async function reuseSheet(v, navigate) {
  if (!(await confirmDialog({
    title: 'Use this site inspection for another report?',
    message: `A new sheet is started with everything from ${v.referenceNo}: the site inspection, photos, documents and what was drafted. Change what the new report needs (bank, purpose…) and generate it. ${v.referenceNo} and its reports stay as they are.`,
    confirmLabel: 'Start new sheet',
  }))) return;
  try {
    const r = await api.reuseValuation(v._id);
    navigate(`/valuations/${r._id}/edit`);
  } catch (e) {
    alertDialog({ title: "Couldn't start the new sheet", message: e.message });
  }
}
