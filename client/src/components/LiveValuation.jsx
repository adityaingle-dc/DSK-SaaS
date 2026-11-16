import { useEffect, useRef, useState } from 'react';
import ResultsPanel from './ResultsPanel.jsx';
import Modal from './Modal.jsx';
import { inr } from './StatusBadge.jsx';
import { IconChevron, IconChevronDown } from './Icons.jsx';

// Remembers the last fair market value and reports how much it just moved (cleared after a few seconds)
function useDelta(value) {
  const prev = useRef(value);
  const [delta, setDelta] = useState(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before == null || value == null || before === value) return undefined;
    setDelta({ amount: value - before, key: Date.now() });
    const t = setTimeout(() => setDelta(null), 2600);
    return () => clearTimeout(t);
  }, [value]);
  return delta;
}

const signed = (n) => `${n > 0 ? '+' : '−'}${inr(Math.abs(n))}`;

// Full panel: headline value first, then warnings to act on, then the breakdown (collapsed by default)
export function LivePanel({ results, delta, onWarningClick, showHead = true }) {
  if (!results?.summary) return null;
  const s = results.summary;
  const warnings = results.warnings || [];
  const hasValue = s.fairMarketValue > 0;

  return (
    <div className="live">
      {showHead && (
        <div className="live-head">
          <span className="live-dot" />
          <strong>Live valuation</strong>
          {s.reportTemplate && <span className="badge" title={results.context?.report?.title}>{s.reportTemplate}</span>}
        </div>
      )}

      {hasValue ? (
        <div className="live-hero">
          <span className="live-label">Fair market value</span>
          <div className="live-value-row">
            <strong key={delta?.key} className={`live-value${delta ? ' flash' : ''}`}>{inr(s.fairMarketValue)}</strong>
            {delta && <span key={`d${delta.key}`} className={`live-delta ${delta.amount > 0 ? 'up' : 'down'}`}>{signed(delta.amount)}</span>}
          </div>
          {s.words?.fairMarketValue && <span className="live-words">{s.words.fairMarketValue}</span>}
          <div className="live-stats">
            <div><small>Realizable · {Math.round(s.realizablePct * 100)}%</small><strong>{inr(s.realizableValue)}</strong></div>
            <div><small>Distress · {Math.round(s.distressPct * 100)}%</small><strong>{inr(s.distressValue)}</strong></div>
            <div><small>Book value (GLR)</small><strong>{inr(s.bookValue)}</strong></div>
          </div>
        </div>
      ) : (
        <div className="live-empty">
          <strong>No value yet</strong>
          <span>Enter the site area and rates, and the valuation appears here as you type.</span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="live-warnings">
          <div className="live-warnings-title">{warnings.length} to check</div>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>
                <button type="button" onClick={() => onWarningClick?.(w.field)}>
                  <span>{w.message}</span>
                  <IconChevron size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasValue && (
        <div className="live-breakdown">
          <div className="live-breakdown-title">Breakdown</div>
          <ResultsPanel results={results} hideHeadline collapsible hideWarnings compact />
        </div>
      )}
    </div>
  );
}

// Shared state for the side panel (wide screens) and the action-bar summary + sheet (everywhere else)
export function useLiveValuation(results, onWarningClick) {
  const [open, setOpen] = useState(false);
  const fmv = results?.summary?.fairMarketValue ?? null;
  const delta = useDelta(fmv);
  const warnCount = results?.warnings?.length || 0;
  const goTo = (field) => {
    setOpen(false);
    onWarningClick?.(field);
  };
  return { delta, open, setOpen, warnCount, fmv, goTo };
}

// Compact summary shown inside the sticky action bar on narrower screens
export function LiveSummaryButton({ live, onOpen }) {
  const { fmv, warnCount, delta } = live;
  return (
    <button type="button" className="live-summary" onClick={onOpen} aria-label="Show live valuation">
      <span className="live-dot" />
      <span className="live-summary-text">
        <small>Fair market value</small>
        <strong key={delta?.key} className={delta ? 'flash' : ''}>{fmv > 0 ? inr(fmv) : '—'}</strong>
      </span>
      {warnCount > 0 && <span className="live-summary-warn">{warnCount}</span>}
      <IconChevronDown size={16} className="live-summary-caret" />
    </button>
  );
}

export function LiveSheet({ results, live }) {
  if (!live.open) return null;
  return (
    <Modal title="Live valuation" onClose={() => live.setOpen(false)}>
      <LivePanel results={results} delta={live.delta} onWarningClick={live.goTo} showHead={false} />
    </Modal>
  );
}
