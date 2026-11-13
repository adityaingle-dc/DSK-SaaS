import { createContext, useContext } from 'react';
import { amountInWords } from '@dsk/shared';

// Report-wide state: saved overrides, current draft edits, and whether edit mode is on (superadmin only).
export const ReportCtx = createContext({ overrides: {}, editing: false, set: () => {} });

const toText = (v) => (v === undefined || v === null || v === '' ? '' : String(v));

export const rs = (n) => (n === undefined || n === null || n === '' || Number.isNaN(Number(n)) ? '' : `Rs. ${Math.round(Number(n)).toLocaleString('en-IN')}`);

// Parse an edited amount like "Rs. 45,57,000" back to a number (for words that follow an edited figure)
export const parseAmount = (s) => {
  // drop the currency prefix first – the dot in "Rs." must not be read as a decimal point
  const cleaned = String(s ?? '').replace(/^\s*(rs\.?|inr|₹)\s*/i, '').replace(/[,\s/-]+$/g, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

/**
 * Editable report text.
 *  k     – stable key used to store an override for this spot
 *  v     – computed default value
 *  block – render as a block (paragraphs / multi-line cells)
 */
export function F({ k, v, block = false, className = '', placeholder = '' }) {
  const { overrides, editing, set } = useContext(ReportCtx);
  const def = toText(v);
  const has = Object.prototype.hasOwnProperty.call(overrides, k);
  const text = has ? overrides[k] : def;
  const Tag = block ? 'div' : 'span';
  const cls = `f${block ? ' f-block' : ''}${has ? ' f-edited' : ''}${className ? ` ${className}` : ''}`;

  if (!editing) return <Tag className={cls}>{text}</Tag>;

  return (
    <Tag
      className={`${cls} f-editable`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder || (def ? '' : 'Click to add')}
      title={has ? `Edited · original: ${def || '(empty)'}` : 'Click to edit'}
      onPaste={(e) => {
        // keep it plain text – no pasted formatting in the bank report
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !block) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.currentTarget.innerText = text;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const next = e.currentTarget.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (next !== text) set(k, next === def ? undefined : next);
      }}
    >
      {text}
    </Tag>
  );
}

// Amount in words that follows the figure: if the figure (amountKey) was edited, the words are re-derived.
export function Words({ k, amountKey, value }) {
  const { overrides } = useContext(ReportCtx);
  const edited = amountKey && Object.prototype.hasOwnProperty.call(overrides, amountKey) ? parseAmount(overrides[amountKey]) : null;
  return <F k={k} v={amountInWords(edited ?? value)} className="words-i" />;
}
