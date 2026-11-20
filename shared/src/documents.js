// Documents produced: the three detail fields (detail1–3) mean different things per document type.
// The input sheet labels them accordingly, and the report words them as a sentence.

const DEED = { labels: ['Executed by (seller)', 'In favour of (buyer)', 'Registered at (SRO)'], words: ['executed by', 'in favour of', 'registered at'] };
export const DOCUMENT_DETAILS = {
  'Sale Deed': DEED,
  'Gift Deed': { labels: ['Executed by (donor)', 'In favour of (donee)', 'Registered at (SRO)'], words: ['executed by', 'in favour of', 'registered at'] },
  'Agreement of Sale': { labels: ['Seller', 'Buyer', 'Registered / notarised at'], words: ['between', 'and', 'registered at'] },
  'Building Permission': { labels: ['Issued by (authority)', 'In the name of', 'Permit / file no.'], words: ['issued by', 'in the name of', 'file no.'] },
  'Legal opinion': { labels: ['Given by (advocate)', 'For (bank / branch)', 'Opinion in brief'], words: ['given by', 'for', '–'] },
};
const OTHER = { labels: ['Issued / executed by', 'In favour of / in the name of', 'Remarks'], words: ['issued by', 'in favour of', '–'] };
export const documentDetails = (type) => DOCUMENT_DETAILS[type] || OTHER;

// "Sale Deed executed by A in favour of B, registered at SRO Wakad" · "Legal opinion given by Adv. X: clear title"
export function documentDescription(doc = {}) {
  const { words } = documentDetails(doc.type);
  let text = doc.type || 'Document';
  let remark = '';
  [doc.detail1, doc.detail2, doc.detail3].forEach((raw, i) => {
    const v = String(raw || '').trim();
    if (!v) return;
    const w = words[i];
    if (w === '–') remark = v; // free remarks go at the end, after a colon
    else if (i === 2) text += `, ${w} ${v}`; // place / number: after a comma
    else text += ` ${w} ${v}`;
  });
  return remark ? `${text}: ${remark}` : text;
}
