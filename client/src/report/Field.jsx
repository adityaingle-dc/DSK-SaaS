import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { amountInWords } from '@dsk/shared';

// Report-wide state: saved overrides, current draft edits, and whether edit mode is on (superadmin only).
// beginEdit(): called just before a change, so Undo can go back to the state before it
export const ReportCtx = createContext({ overrides: {}, editing: false, set: () => {}, beginEdit: () => {} });

// Multi-line text: lines starting with "-" or "•" print as bullet points, "1." / "1)" as numbered points
const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
export function RichText({ text }) {
  const lines = String(text).split('\n');
  if (!lines.some((l) => BULLET.test(l) || NUMBER.test(l))) return text;
  const out = [];
  let list = null;
  lines.forEach((line, i) => {
    const kind = BULLET.test(line) ? 'ul' : NUMBER.test(line) ? 'ol' : null;
    if (kind) {
      if (!list || list.kind !== kind) { list = { kind, items: [] }; out.push(list); }
      list.items.push(line.replace(kind === 'ul' ? BULLET : NUMBER, ''));
    } else {
      list = null;
      out.push({ kind: 'line', text: line, i });
    }
  });
  return out.map((b, i) => (b.kind === 'line'
    ? <span key={i} className="f-line">{b.text}{'\n'}</span>
    : b.kind === 'ul'
      ? <ul key={i} className="f-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
      : <ol key={i} className="f-list">{b.items.map((t, j) => <li key={j}>{t}</li>)}</ol>));
}

const toText = (v) => (v === undefined || v === null || v === '' ? '' : String(v));
const clean = (s) => s.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n');
const LIVE_DELAY = 180; // ms: typed text reaches the rest of the report (and the page flow) after this pause

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
  const { overrides, editing, set, beginEdit } = useContext(ReportCtx);
  const def = toText(v);
  const has = Object.prototype.hasOwnProperty.call(overrides, k);
  const text = has ? overrides[k] : def;
  const Tag = block ? 'div' : 'span';
  const cls = `f${block ? ' f-block' : ''}${has ? ' f-edited' : ''}${className ? ` ${className}` : ''}`;

  // While this spot is being typed in, its own DOM text is left alone (re-rendering it would move the caret);
  // the text is still passed on as you type, so pages re-flow live and other copies of the page stay in step.
  const [frozen, setFrozen] = useState(null);
  const before = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (raw, final) => {
    const next = final ? clean(raw).trim() : clean(raw);
    if (next !== text) set(k, next === def ? undefined : next);
  };

  if (!editing) return <Tag className={cls}>{block ? <RichText text={text} /> : text}</Tag>;

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
      onFocus={() => {
        beginEdit?.();
        before.current = { has, value: overrides[k] };
        setFrozen(text);
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(el.innerText, false), LIVE_DELAY);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !block) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          // put back what was there before this edit started
          clearTimeout(timer.current);
          const b = before.current;
          e.currentTarget.innerText = b?.has ? b.value : def;
          set(k, b?.has ? b.value : undefined);
          before.current = null;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        clearTimeout(timer.current);
        if (before.current) commit(e.currentTarget.innerText, true);
        before.current = null;
        setFrozen(null);
      }}
    >
      {frozen ?? text}
    </Tag>
  );
}

// Amount in words that follows the figure: if the figure (amountKey) was edited, the words are re-derived.
export function Words({ k, amountKey, value }) {
  const { overrides } = useContext(ReportCtx);
  const edited = amountKey && Object.prototype.hasOwnProperty.call(overrides, amountKey) ? parseAmount(overrides[amountKey]) : null;
  return <F k={k} v={amountInWords(edited ?? value)} className="words-i" />;
}

// ---------- text added to a report section (paragraphs, bullet / numbered points, page breaks) ----------
// Stored with the other report edits: "x.<section>" = the list of blocks, "x.<section>.<block>" = each one's text.
const BLOCK_LABEL = { p: 'Paragraph', ul: 'Bullet points', ol: 'Numbered points', br: 'Page break' };
const newId = () => Math.random().toString(36).slice(2, 7);
const readBlocks = (raw) => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.filter((b) => b && BLOCK_LABEL[b.kind] && /^[a-z0-9]{1,12}$/.test(b.id)) : []; } catch { return []; } };

export function AddedBlocks({ section }) {
  const { overrides, editing, set, beginEdit } = useContext(ReportCtx);
  const listKey = `x.${section}`;
  const blocks = readBlocks(overrides[listKey]);
  if (!blocks.length && !editing) return null;
  const save = (next) => { beginEdit?.(); set(listKey, next.length ? JSON.stringify(next) : undefined); };
  const add = (kind) => save([...blocks, { id: newId(), kind }]);
  const remove = (b) => { save(blocks.filter((x) => x.id !== b.id)); set(`${listKey}.${b.id}`, undefined); };
  const move = (i, d) => { const next = [...blocks]; const [b] = next.splice(i, 1); next.splice(i + d, 0, b); save(next); };
  return (
    <div className="added-blocks">
      {blocks.map((b, i) => {
        const k = `${listKey}.${b.id}`;
        const text = overrides[k] || '';
        let body;
        if (b.kind === 'br') body = editing ? <div className="added-break-mark">Page break – what follows starts on a new page</div> : null;
        else if (!editing && (b.kind === 'ul' || b.kind === 'ol')) {
          const items = text.split('\n').map((t) => t.replace(BULLET, '').replace(NUMBER, '').trim()).filter(Boolean);
          const L = b.kind === 'ul' ? 'ul' : 'ol';
          body = <L className="f-list">{items.map((t, j) => <li key={j}>{t}</li>)}</L>;
        } else {
          body = <F k={k} v="" block placeholder={b.kind === 'p' ? 'Type the paragraph' : 'One point per line'} className={b.kind !== 'p' ? `f-points f-${b.kind}` : ''} />;
        }
        return (
          <div key={b.id} className={`added-block added-${b.kind}${b.kind === 'br' ? ' page-break' : ''}`}>
            {body}
            {editing && (
              <span className="added-tools no-print">
                <span className="added-kind">{BLOCK_LABEL[b.kind]}</span>
                {i > 0 && <button type="button" title="Move up" onClick={() => move(i, -1)}>↑</button>}
                {i < blocks.length - 1 && <button type="button" title="Move down" onClick={() => move(i, 1)}>↓</button>}
                <button type="button" className="added-remove" title={`Remove this ${BLOCK_LABEL[b.kind].toLowerCase()}`} onClick={() => remove(b)}>✕</button>
              </span>
            )}
          </div>
        );
      })}
      {editing && (
        <div className="added-add no-print" role="group" aria-label="Add to this section">
          <span>Add here:</span>
          <button type="button" onClick={() => add('p')}>+ Paragraph</button>
          <button type="button" onClick={() => add('ul')}>+ Bullet points</button>
          <button type="button" onClick={() => add('ol')}>+ Numbered points</button>
          <button type="button" onClick={() => add('br')}>+ Page break</button>
        </div>
      )}
    </div>
  );
}
