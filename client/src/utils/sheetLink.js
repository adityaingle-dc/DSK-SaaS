import { DRAFTING_STATUSES, EVALUATOR_EDITABLE } from '@dsk/shared';

const idOf = (x) => String(x?._id || x || '');

// Where a click on a sheet goes, for the signed-in user:
//  - evaluator: their sheet to fill in while it is with them, else its page
//  - drafter / superadmin: the drafting screen (sheet + report) while it is with the drafters, else its page
//    (a drafter clicking a sheet another drafter has gets its page)
export function sheetLink(v, auth) {
  const id = v._id;
  if (!auth?.isOffice) {
    const drafting = DRAFTING_STATUSES.includes(v.status) && (v.draftingMine || (v.drafter && idOf(v.drafter) === idOf(auth.user)));
    return EVALUATOR_EDITABLE.includes(v.status) || drafting ? `/valuations/${id}/edit` : `/valuations/${id}`;
  }
  if (DRAFTING_STATUSES.includes(v.status)) {
    const me = idOf(auth.user);
    if (auth.isDrafter && v.drafter && idOf(v.drafter) !== me) return `/valuations/${id}`;
    return `/valuations/${id}/edit`;
  }
  return `/valuations/${id}`;
}
