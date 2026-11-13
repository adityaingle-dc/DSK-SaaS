import { inr } from './StatusBadge.jsx';

const n2 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 }));

// Live calculation output (same engine on server, web and mobile)
export default function ResultsPanel({ results, compact = false, hideHeadline = false, onWarningClick }) {
  if (!results?.summary) return null;
  const { summary: s, land, building, flat, progress, proposed, fee, warnings = [], context } = results;

  return (
    <div className="results">
      {!hideHeadline && (
      <>
      <div className="results-head">
        <span className="badge">{s.reportTemplate}</span> {context?.report?.title}
      </div>

      <div className="headline">
        <Line big k="Fair market value" v={inr(s.fairMarketValue)} />
        {!compact && <div className="words">{s.words.fairMarketValue}</div>}
        <Line k={`Realizable (${Math.round(s.realizablePct * 100)}%)`} v={inr(s.realizableValue)} />
        <Line k={`Distress (${Math.round(s.distressPct * 100)}%)`} v={inr(s.distressValue)} />
        <Line k="Book value (GLR)" v={inr(s.bookValue)} />
      </div>
      </>
      )}

      {land && (
        <Group title="Land">
          <Line k="Site area considered" v={`${n2(land.siteArea)} sq.yd (${n2(land.siteAreaSqm)} sq.m)`} />
          <Line k="Value @ GLR" v={inr(land.glrValue)} />
          <Line k="Value @ PMR" v={inr(land.pmrValue)} />
          {land.extras > 0 && <Line k="Extra items" v={inr(land.extras)} />}
          {(land.plus > 0 || land.minus > 0) && <Line k="Add / less factors" v={`+${inr(land.plus)} / −${inr(land.minus)}`} />}
          <Line k="Land value (rounded)" v={inr(land.fairMarketValue)} strong />
        </Group>
      )}

      {building && (
        <Group title="Building">
          <Line k="Age / life" v={building.age == null ? '—' : `${building.age} / ${building.life} yrs`} />
          <Line k="Depreciation" v={`${n2(building.depreciationPct)}%`} />
          <Line k="Plinth area" v={`${n2(building.plinthTotal)} sq.ft`} />
          <Line k="Replacement cost" v={inr(building.replacementTotal)} />
          <Line k="Less depreciation" v={inr(building.depreciationTotal)} />
          <Line k="Net building value" v={inr(building.netTotal)} strong />
          <Line k="Amenities" v={inr(building.amenities.total)} />
          <Line k="Services" v={inr(building.services.total)} />
        </Group>
      )}

      {flat && (
        <Group title="Flat">
          {flat.underConstruction ? (
            <>
              <Line k="Value on completion" v={inr(flat.completionValue)} />
              <Line k="Stage value" v={inr(flat.stageValue)} strong />
            </>
          ) : (
            <>
              <Line k="Age / life" v={flat.age == null ? '—' : `${flat.age} / ${flat.life} yrs`} />
              <Line k="Depreciation" v={`${n2(flat.depreciationPct)}%`} />
              <Line k="Depreciated building rate" v={`${inr(flat.depreciatedRate)}/sq.ft`} />
              <Line k="Building cost" v={inr(flat.buildingCost)} />
            </>
          )}
          <Line k="Land (UDS) cost" v={inr(flat.landCost)} />
          <Line k="Composite rate" v={`${inr(flat.compositeRate)}/sq.ft`} strong />
          {flat.extras > 0 && <Line k="Extra items" v={inr(flat.extras)} />}
        </Group>
      )}

      {progress && (
        <Group title="Construction progress">
          <Line k="Work completed" v={`${n2(progress.completionPct)}%`} />
          <Line k="Value of work done" v={inr(progress.workDoneValue)} strong />
        </Group>
      )}

      {proposed && (
        <Group title="Proposed building (GO 168)">
          <Line k="Setbacks front / side" v={`${proposed.setbacks.frontFt} ft / ${proposed.setbacks.sideFt} ft`} />
          <Line k="Max floors permitted" v={proposed.maxFloors ?? '—'} />
          <Line k="Buildable L × B" v={`${n2(proposed.buildableLength)} × ${n2(proposed.buildableBreadth)} ft`} />
          <Line k="Built-up / floor" v={`${n2(proposed.builtupPerFloor)} sq.ft`} />
          <Line k="Slab area" v={`${n2(proposed.slabArea)} sq.ft`} />
          {proposed.roomsTotal > 0 && <Line k="Rooms total" v={`${n2(proposed.roomsTotal)} sq.ft`} />}
        </Group>
      )}

      {fee && !compact && (
        <Group title="Professional fee">
          <Line k="As per slab" v={inr(fee.fee)} />
          <Line k="Payable" v={inr(fee.payable)} strong />
        </Group>
      )}

      {warnings.length > 0 && (
        <div className="warnings">
          <strong>Check these</strong>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>
                {onWarningClick ? <button type="button" className="linklike" onClick={() => onWarningClick(w.field)}>{w.message}</button> : w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="group">
      <div className="group-title">{title}</div>
      {children}
    </div>
  );
}

function Line({ k, v, strong, big }) {
  return (
    <div className={`line${strong ? ' strong' : ''}${big ? ' big' : ''}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
