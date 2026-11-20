import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Sheet } from './sheets.jsx';
import { AddedBlocks } from './Field.jsx';

// Lays the report out as real A4 pages, like a document editor: when a section's content is longer than
// one page (long wording edits, many rows, photos), the rest flows onto a new page with its own footer,
// and the footer numbers count the printed pages. What is shown on screen is exactly what prints.
//
// How: each section is rendered once per page it needs. Every copy shows a window of the same content
// (shifted up and clipped), and the windows end at clean break points (between table rows, paragraphs,
// list items...) so no line is cut in half. Headings stay with what follows them.

// blocks that must not be split across pages (unless one alone is taller than a page)
const ATOMIC = 'tr, p, li, h1, h3, h4, figure, img, .f-block, .sign, .ref-line, .annex-head, .bank-box, .keyplan, .placeholder, .doc-title, .doc-sub, .encl, .note, .added-tools, .added-add';
// blocks that should not be left alone at the bottom of a page
const KEEP_WITH_NEXT = 'h1, h3, h4, .annex-head, .doc-title, .doc-sub, thead tr, tr.sec, tr.sub-head';
const SLACK = 6; // px left free at the bottom of each page, so printer rounding never clips a line
const MIN_FILL = 0.35; // a clean break leaving the page less full than this tries a line break instead
const MAX_PAGES = 30;

function paginate(flow, firstAvail, restAvail) {
  const flowRect = flow.getBoundingClientRect();
  const scale = flow.offsetWidth ? flowRect.width / flow.offsetWidth : 1;
  const top0 = flowRect.top;
  const box = (r) => [(r.top - top0) / scale, (r.bottom - top0) / scale];
  const total = flow.offsetHeight;
  const atoms = [...flow.querySelectorAll(ATOMIC)].map((el) => [...box(el.getBoundingClientRect()), el]).filter(([t, b]) => b - t > 0.5);
  const keeps = [...flow.querySelectorAll(KEEP_WITH_NEXT)].map((el) => box(el.getBoundingClientRect()));
  const cands = [...new Set([...atoms.map((a) => a[0]), ...[...flow.children].map((el) => box(el.getBoundingClientRect())[0])])].sort((a, b) => a - b);
  const inside = (y, list) => list.some(([t, b]) => t < y - 0.5 && b > y + 0.5);

  let lines = null; // text line boxes, only needed when a single block is taller than a page
  const lineBoxes = () => {
    if (lines) return lines;
    lines = [];
    const walker = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.height > 1) lines.push(box(r));
    }
    return lines;
  };

  // manual page breaks (added in the report editor): the content after one starts on a new page
  const breaks = [...flow.querySelectorAll('.page-break')].map((el) => box(el.getBoundingClientRect())[1]).sort((a, b) => a - b);

  const windows = [];
  let start = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const avail = (i === 0 ? firstAvail : restAvail) - SLACK;
    const forced = breaks.find((y) => y > start + 2 && y <= start + avail && y < total - 2);
    if (forced !== undefined) { windows.push([start, forced, false]); start = forced; continue; }
    if (total - start <= avail) break;
    const limit = start + avail;
    const floor = start + 20;
    let best = null;
    for (const y of cands) {
      if (y > limit) break;
      if (y > floor && !inside(y, atoms)) best = y;
    }
    if (best !== null) {
      // a heading just above the break moves to the next page with its content
      const h = keeps.filter(([t, b]) => b <= best + 1 && b >= best - 16 && t > floor && !inside(t, atoms)).sort((a, b) => a[0] - b[0])[0];
      if (h) best = h[0];
    }
    // the block that didn't fit is tall (a long description row, a long paragraph) and moving it whole would
    // leave a big gap: let it break across the pages, like a table row in a word processor
    const big = atoms.filter(([t, b]) => t < limit && b > limit).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
    const gapTooBig = best !== null && big && big[1] - big[0] > avail * 0.2 && limit - best > avail * 0.15;
    // where this page's window ends and the next one starts: around a clean break they overlap by 1px so a
    // table border on the break shows on both pages
    let end = best === null ? null : best + 1;
    let next = best === null ? null : best - 1;
    let tableCut = false; // a table row split across the pages: close it with a rule on both sides
    if (best === null || best - start < avail * MIN_FILL || gapTooBig) {
      // break inside the block, after the last whole line that fits; cut in the gap between the two lines
      const ls = lineBoxes();
      let lb = null;
      for (const [t] of ls) if (t > floor && t <= limit && !inside(t, ls) && (lb === null || t > lb)) lb = t;
      if (lb !== null && (best === null || lb > best)) {
        const above = Math.max(start, ...ls.filter(([, b]) => b <= lb + 0.5).map(([, b]) => b));
        best = lb;
        end = Math.min(lb, above + 1);
        next = Math.max(above, lb - 1);
        tableCut = !!atoms.find(([t, b, el]) => t < lb && b > lb && el.closest('table'));
      }
    }
    if (best === null) { best = limit; end = limit; next = limit; }
    windows.push([start, end, tableCut]);
    start = next;
  }
  windows.push([start, null, false]);
  return windows.map(([a, b, cut]) => [Math.round(a * 10) / 10, b === null ? null : Math.round(b * 10) / 10, cut]);
}

// one report section, split into as many A4 pages as its content needs
function PagedSheet({ sheet, c, first, total, onCount }) {
  const rootRef = useRef(null);
  const [windows, setWindows] = useState([[0, null]]);
  const last = useRef('');

  // copies of the content outside a page's window can't be focused or clicked (keyboard Tab in edit mode)
  const syncInert = useCallback(() => {
    rootRef.current?.querySelectorAll('.sheet-window').forEach((win) => {
      const w = win.getBoundingClientRect();
      win.querySelectorAll('.f-editable').forEach((el) => {
        const r = el.getBoundingClientRect();
        el.inert = r.bottom <= w.top + 1 || r.top >= w.bottom - 1;
      });
    });
  }, []);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const flow = root?.querySelector('.sheet-flow');
    const page = root?.querySelector('.sheet');
    if (!flow || !page || !flow.offsetWidth) return;
    const scale = flow.getBoundingClientRect().width / flow.offsetWidth || 1;
    const body = page.querySelector('.sheet-body');
    const firstAvail = body.getBoundingClientRect().height / scale;
    const lh = page.querySelector('.letterhead');
    const lhSpace = lh ? lh.getBoundingClientRect().height / scale + parseFloat(getComputedStyle(lh).marginBottom || 0) : 0;
    const next = paginate(flow, firstAvail, firstAvail + lhSpace);
    const key = JSON.stringify(next);
    if (key !== last.current) {
      last.current = key;
      setWindows(next);
      onCount(sheet.id, next.length);
    }
    syncInert();
  }, [sheet.id, onCount, syncInert]);

  // re-measure when the content changes size: edits, photos and the map loading, fonts arriving
  useLayoutEffect(() => {
    const flow = rootRef.current?.querySelector('.sheet-flow');
    if (!flow) return undefined;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(flow);
    document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  // the content itself may change without changing size (e.g. a wording edit of the same length)
  useLayoutEffect(() => { measure(); });

  return (
    <div className="sheet-group" ref={rootRef} data-section={sheet.id}>
      {windows.map(([from, to, cutBottom], i) => (
        <Sheet key={i} n={first + i} total={total} c={c} letterhead={sheet.letterhead && i === 0} continued={i > 0}>
          <div
            className={`sheet-window${cutBottom ? ' cut-bottom' : ''}${windows[i - 1]?.[2] ? ' cut-top' : ''}`}
            style={to === null ? undefined : { height: to - from }}
          >
            <div className="sheet-flow" style={from ? { marginTop: -from } : undefined}>{sheet.el}<AddedBlocks section={sheet.id} /></div>
          </div>
        </Sheet>
      ))}
    </div>
  );
}

// the whole report: sections in order, page numbers counted across the printed pages
export default function Pages({ sheets, c }) {
  const [counts, setCounts] = useState({});
  const onCount = useCallback((id, n) => setCounts((cur) => (cur[id] === n ? cur : { ...cur, [id]: n })), []);
  const total = sheets.reduce((sum, s) => sum + (counts[s.id] || 1), 0);
  let n = 1;
  return sheets.map((s) => {
    const first = n;
    n += counts[s.id] || 1;
    return <PagedSheet key={s.id} sheet={s} c={c} first={first} total={total} onCount={onCount} />;
  });
}
