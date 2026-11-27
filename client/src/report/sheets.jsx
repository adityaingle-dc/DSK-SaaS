import { useEffect, useState } from 'react';
import { catalog, documentDescription, FLOORS, sideRoles, REPORT_TEMPLATES, personName, personRelation, phones, SQFT_PER_SQM, SQYD_PER_SQM } from '@dsk/shared';
import { api } from '../api/client.js';
import { printSized, PRINT_PX } from '../utils/printImage.js';

// the valuer's signature / seal image (loaded once per session, signed-in users only); only on an approved report
function useBrand(name, on) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    api.brandUrl(name).then((u) => printSized(u, name === 'signature' ? PRINT_PX.signature : PRINT_PX.seal, true)).then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [name, on]);
  return on ? url : null;
}

const floorName = (f) => (FLOORS.includes(f) ? `${f} Floor` : f || '');
import { F, Words, rs } from './Field.jsx';
import { LocationMaps, SitePlanMap } from './KeyPlanMap.jsx';
import PhotoGrid, { FullPagePhoto } from './PhotoGrid.jsx';
import {
  FIRM, FOOTER_NOTE, OPINION_INTRO, CERTIFICATE_POINTS, ENCLOSURES, SRO_REMARKS, COURT_JUDGEMENTS, APPROACH_NOTE,
  DECLARATION_POINTS, DECLARATION_TABLE, CODE_OF_CONDUCT, RELATIVE_NOTE,
} from './boilerplate.js';

// ---------- helpers ----------
const dmy = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
};
// joins the non-empty parts on separate lines; skips `false` from `cond && value` parts (it used to print "false")
const lines = (...xs) => xs.filter((x) => x !== undefined && x !== null && x !== false && String(x).trim() !== '').join('\n');
const num = (n, d = 2) => (n === undefined || n === null || n === '' ? '' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d }));
const amt = (n) => (n ? rs(n) : '');

const EXTRA_KEYS = ['portico', 'poojaDoor', 'sitOut', 'collapsibleGates', 'openStaircase'];
const AMENITY_KEYS = ['wardrobes', 'glazedTiles', 'extraSinks', 'marbleFlooring', 'interiorDecorations', 'elevationWorks', 'panellingWorks', 'aluminiumWorks', 'aluminiumHandRails', 'falseCeiling'];
const MISC_KEYS = ['lumberRoom', 'toiletRoom', 'waterTankSump', 'gardening', 'other'];

// Everything the sheets need, derived once from the stored valuation + engine results
export function buildContext(v) {
  const d = v.data || {};
  const r = v.results || {};
  const g = d.general || {};
  const a = d.applicant || {};
  const p = d.property || {};
  const s = r.summary || {};
  const kind = s.kind || r.context?.kind || 'land';
  const tpl = REPORT_TEMPLATES[s.reportTemplate] || REPORT_TEMPLATES.BV;
  const bankRef = `Branch Manager: ${g.bankName || ''}, ${g.branch || ''}`;
  const propertyAddress = lines(
    p.description,
    [p.numberType && p.number ? `${p.numberType} ${p.number}` : p.number].filter(Boolean).join(' '),
    p.surveyNo && `Sy.No. ${p.surveyNo}${p.street ? `, ${p.street}` : ''}`,
    !p.surveyNo && p.street,
    [p.village, p.localBodyName].filter(Boolean).join(', '),
    p.district,
    p.pincode,
    p.landmark
  );
  const amenityLines = Object.fromEntries((r.building?.amenities?.lines || []).map((l) => [l.key, l]));
  const docs = d.documents?.items || [];
  const titleDoc = docs.find((x) => /deed/i.test(x.type || '')) || docs[0];

  return {
    v, d, r, g, a, p, s, kind, tpl, bankRef,
    // the valuer's signature and seal print only once the superadmin has approved the report
    signed: !!v.signed,
    // Bank of Baroda: same report, data arranged as in the bank's formats (BCC:BR:114:694) — Annexure II-a for land &
    // building, II-b for flats
    bob: /baroda/i.test(g.bankName || ''),
    // Punjab National Bank: same report, data arranged as in PNB's formats — Appendix I (immovable properties),
    // II (flats), III (agricultural land). Not Punjab & Sind Bank.
    pnb: /punjab national/i.test(g.bankName || '') || /^\s*pnb\s*$/i.test(g.bankName || ''),
    agri: /agri/i.test(g.propertyType || ''),
    place: g.place || FIRM.defaultPlace,
    valuationDate: dmy(g.valuationDate),
    inspectionDate: dmy(g.inspectionDate),
    appointmentDate: dmy(g.inspectionDate ? new Date(new Date(g.inspectionDate).getTime() - 864e5) : ''),
    owner: personName(a),
    ownerRelation: personRelation(a),
    ownerPhones: phones(a),
    ownerAddress: lines(a.houseNo, a.street, a.locality, a.district, a.pincode),
    propertyAddress,
    propertyType: [g.loanType, g.propertyType, g.loanCategory].filter(Boolean).join(' - '),
    purpose: g.purpose || 'For Bank Loan / Mortgage Purpose',
    docs,
    titleDeed: titleDoc ? `${titleDoc.type || ''}${titleDoc.number ? ` with ${titleDoc.number}` : ''}${titleDoc.date ? ` Dated: ${dmy(titleDoc.date)}` : ''}` : '—',
    amenityLines,
    background: `The Subject Property comprises ${p.description || 'the property'}, ${[p.number, p.street, p.village, p.district, p.pincode].filter(Boolean).join(', ')}\nBelongs to: ${[personName(a), personRelation(a)].filter(Boolean).join(', ')}. The Valuation is carried out based on physical inspection, documents furnished by the client/bank and prevailing market conditions as on the valuation date`,
    procedures: kind === 'flat' ? 'IVS are followed\nComposite Rate Method was used for Flat valuation' : kind === 'building' ? 'IVS are followed\nMarket Value Approach was used for Plot valuation\nPlinth Area rate for RCC Building' : 'IVS are followed\nMarket Value Approach was used for Plot valuation',
  };
}

// ---------- layout primitives ----------
export function Sheet({ n, total, c, children, letterhead = false, continued = false }) {
  return (
    <section className={`sheet${continued ? ' sheet-cont' : ''}`}>
      {['draft', 'rejected'].includes(c.v.status) && <div className="watermark">DRAFT</div>}
      {letterhead && <Letterhead />}
      <div className="sheet-body">{children}</div>
      <footer className="sheet-foot">
        <FooterSeal c={c} />
        <span className="foot-note">{FOOTER_NOTE.map((l) => <span key={l}>{l}</span>)}</span>
        <span className="foot-page">
          <span>{n} of {total}</span>
          <span>{c.v.referenceNo} / {c.s.reportTemplate}</span>
        </span>
      </footer>
    </section>
  );
}

// every page's footer: the valuer's seal once approved (before that, the small drawn "DSK" mark)
function FooterSeal({ c }) {
  const stamp = useBrand('stamp', c.signed);
  if (stamp) return <img className="seal-image" src={stamp} alt="Seal of the approved valuer" />;
  return <span className="seal">{FIRM.seal.map((l) => <span key={l}>{l}</span>)}</span>;
}

function Letterhead() {
  return (
    <header className="letterhead">
      <div>
        <div className="lh-name"><F k="firm.name" v={FIRM.name} /></div>
        <div><F k="firm.qual" v={FIRM.qualifications} /></div>
        <div className="lh-title"><F k="firm.title" v={FIRM.title} /></div>
        {FIRM.registrations.map((x, i) => <div key={i}><F k={`firm.reg.${i}`} v={x} /></div>)}
      </div>
      <div className="lh-right">
        {FIRM.address.map((x, i) => <div key={i}><F k={`firm.addr.${i}`} v={x} /></div>)}
        <div className="lh-phone"><F k="firm.phone" v={FIRM.phone} /></div>
        <div><F k="firm.email" v={FIRM.email} /></div>
      </div>
    </header>
  );
}

const Row = ({ label, k, v, n, block = true, bold }) => (
  <tr>
    {n !== undefined && <td className="c-n">{n}</td>}
    <th>{label}</th>
    <td className={bold ? 'b' : ''}><F k={k} v={v} block={block} /></td>
  </tr>
);

function Signature({ c, label = 'Approved Valuer', title = 'Signature' }) {
  const sign = useBrand('signature', c.signed);
  const stamp = useBrand('stamp', c.signed);
  return (
    <div className="sign">
      <div>
        <div>Place: <F k="sig.place" v={c.place} /></div>
        <div>Date: <F k="sig.date" v={c.valuationDate} /></div>
      </div>
      {/* seal on the left; the signature with its caption centred right under it (same space before approval) */}
      <div className="sign-right">
        <div className="sign-seal">{stamp && <img className="sign-stamp" src={stamp} alt="Seal of the approved valuer" />}</div>
        <div className="sign-col">
          <div className="sign-space">
            {sign ? <img className="sign-image" src={sign} alt="Signature of the approved valuer" /> : !c.signed && <span className="sign-pending">Signature and seal are added when the report is approved</span>}
          </div>
          <strong>{title}</strong>
          <div>{label}</div>
        </div>
      </div>
    </div>
  );
}

// someone else who signs on paper (e.g. the Branch Manager): blank space for their signature and seal, caption under it
function OtherSignature({ lines }) {
  return (
    <div className="sign-right">
      <div className="sign-seal sign-blank" aria-hidden="true" />
      <div className="sign-col">
        <div className="sign-space sign-blank" aria-hidden="true" />
        <strong>Signature</strong>
        {lines.map((l) => <div key={l}>{l}</div>)}
      </div>
    </div>
  );
}

function ValueLines({ c, prefix }) {
  const s = c.s;
  const items = [
    ['fmv', `The Fair Market value of the above property as of ${c.valuationDate} is`, s.fairMarketValue],
    ['book', `The book value / Govt Guidelines value of the above property as of ${c.valuationDate} is`, s.bookValue],
    ['distress', 'The Distress Market Value of the Said Property is', s.distressValue],
    ['realizable', 'The Realisable Market Value of the Said Property is', s.realizableValue],
  ];
  return (
    <table className="t values">
      <tbody>
        {items.map(([key, label, value]) => [
          <tr key={key}>
            <td><F k={`${prefix}.${key}.label`} v={label} /></td>
            <td className="r b"><F k={`${prefix}.${key}`} v={rs(value)} /></td>
          </tr>,
          <tr key={`${key}w`}>
            <td colSpan={2} className="words-row"><Words k={`${prefix}.${key}.words`} amountKey={`${prefix}.${key}`} value={value} /></td>
          </tr>,
        ])}
      </tbody>
    </table>
  );
}

// ---------- sheets ----------
function Certificate({ c }) {
  const site = c.r.land?.siteArea;
  return (
    <>
      <h1 className="doc-title">Valuation Certificate</h1>
      <div className="doc-sub">(<F k="cert.subtitle" v={c.tpl.title} />)</div>
      <table className="t tkv">
        <tbody>
          <tr>
            <th>To</th>
            <td><F k="cert.to" v={`Branch Manager: ${c.g.bankName || ''}\nBranch : ${c.g.branch || ''}`} block /></td>
            <th className="w-date">Date:</th>
            <td className="w-date"><F k="cert.date" v={c.valuationDate} /></td>
          </tr>
          <tr>
            <th>Reference:</th>
            <td colSpan={3}><F k="cert.ref" v={`Pursuant to the Request from Branch Manager: ${c.g.bankName || ''} Branch : ${c.g.branch || ''} To ascertain present market value of the ${c.kind === 'land' ? 'Property' : c.kind === 'flat' ? 'Flat' : 'Existing Building'}`} block /></td>
          </tr>
          <tr><th>Purpose of Valuation</th><td colSpan={3}><F k="cert.purpose" v={c.purpose} /></td></tr>
        </tbody>
      </table>
      <table className="t tkv">
        <tbody>
          <tr><th>a. Name of the Owner of the Property</th><td><strong><F k="cert.owner" v={c.owner} /></strong><F k="cert.ownerRel" v={lines(c.ownerRelation, c.ownerPhones)} block /></td></tr>
          <tr><th>b. Type of Property</th><td className="b"><F k="cert.type" v={c.propertyType} /></td></tr>
          <tr><th>c. Location of the Property</th><td><F k="cert.location" v={c.propertyAddress} block /></td></tr>
          {c.kind !== 'flat' && (
            <tr><th>d. Extent of Site</th><td className="b"><F k="cert.extent" v={`${num(site)} Sq.Yds  @  Rs.${num(c.d.land?.marketRate, 0)} Rs/Sq.Yd`} /></td></tr>
          )}
          {c.kind === 'flat' && (
            <tr><th>d. Plinth Area / UDS</th><td className="b"><F k="cert.extent" v={`${num(c.d.flat?.plinthArea)} Sq.ft  /  UDS ${num(c.d.flat?.uds)} Sq.Yds`} /></td></tr>
          )}
        </tbody>
      </table>
      <F k="cert.intro" v={OPINION_INTRO} block />
      <p>As a result of my appraisal and analysis, it is my considered opinion that</p>
      <ValueLines c={c} prefix="cert" />
      <Signature c={c} />
    </>
  );
}

function BasicData({ c, part = 1 }) {
  const sides = c.d.boundaries?.sides || {};
  const loc = c.p.location;
  if (part === 2) return c.bob ? <BobBasicData2 c={c} sides={sides} loc={loc} /> : <BasicData2 c={c} sides={sides} loc={loc} />;
  return (
    <>
      <div className="annex-head">
        <div><F k="annex.no" v={c.tpl.annexure.toUpperCase().replace('ANNEXURE', 'ANNEXURE -')} /></div>
        <div className="annex-title"><F k="annex.title" v={c.kind === 'land' ? 'VALUATION OF VACANT SITES/RESIDENTAL PLOT/COMMERCIAL SITE/ LAND REPORT ON VALUATION' : c.kind === 'flat' ? 'VALUATION OF FLAT BY COMPOSITE RATE METHOD' : 'VALUATION OF PROPERTY (LAND & BUILDING)'} block /></div>
        <div><F k="annex.bank" v={`${c.g.bankName || ''} : ${c.g.branch || ''} Branch`} /></div>
      </div>
      <div className="ref-line"><span>Ref. No. <F k="annex.ref" v={c.v.referenceNo} /></span><span>Date: <F k="annex.date" v={c.valuationDate} /></span></div>
      <h3 className="u ctr">PART A - BASIC DATA</h3>
      <h4>I. GENERAL</h4>
      <table className="t grid">
        <tbody>
          <Row n="1" label="Purpose of Valuation:" k="a.purpose" v={c.purpose} />
          <tr><td className="c-n" rowSpan={2}>2</td><th>a) Date of inspection</th><td><F k="a.inspection" v={c.inspectionDate} /></td></tr>
          <tr><th>b) Date on which the valuation is made</th><td><F k="a.valuation" v={c.valuationDate} /></td></tr>
          <tr><td className="c-n" rowSpan={c.docs.length + 2}>3</td><th colSpan={2}>List of documents produced for perusal</th></tr>
          <tr className="sub-head"><th>Description of Document</th><th className="split"><span>Document No</span><span className="sp-r">Date &nbsp; Original/Copy</span></th></tr>
          {c.docs.map((doc, i) => (
            <tr key={i}>
              <td><F k={`doc.${i}.desc`} v={documentDescription(doc)} /></td>
              <td className="split"><F k={`doc.${i}.no`} v={doc.number || 'NA'} /><span className="sp-r"><F k={`doc.${i}.date`} v={`${dmy(doc.date) || 'NA'} ${doc.copy || 'Copy'}`} /></span></td>
            </tr>
          ))}
          <Row n="4" label="Name of the Owner(s) and his/their address with Phone no." k="a.owner" v={lines(c.owner, c.ownerRelation, c.ownerAddress, c.ownerPhones)} />
          <Row n="5" label="Brief description of the property" k="a.brief" v={`The Property is ${c.p.description || ''} over ${c.p.numberType || ''} ${c.p.number || ''}, ${[c.p.street, c.p.village, c.p.localBodyName, c.p.district, c.p.pincode].filter(Boolean).join(', ')}.${c.p.landmark ? ` Land Mark ${c.p.landmark}` : ''}${c.r.land ? ` with total site area of ${num(c.r.land.siteArea)} Sq.Yds` : ''} Belongs to Applicant : ${c.owner}${c.ownerRelation ? `, ${c.ownerRelation}` : ''}${c.bob && c.d.site?.landTenure ? `\nTenure: ${c.d.site.landTenure}` : ''}`} />
          {c.bob ? <BobLocation c={c} /> : (
            <>
              <tr><td className="c-n" rowSpan={7}>6</td><th>Location of property</th><td><F k="a.loc" v={c.p.description} /></td></tr>
              <tr><th>a) {c.p.numberType || 'Plot No. / H.No.'}</th><td><F k="a.loc.no" v={c.p.number} /></td></tr>
              <tr><th>b) Name of Nagar / Layout</th><td><F k="a.loc.layout" v="NA" /></td></tr>
              <tr><th>c) S.F. No / T.S. No. / R.S. No.</th><td><F k="a.loc.sy" v={c.p.surveyNo || 'NA'} /></td></tr>
              <tr><th>d) Village / Block</th><td><F k="a.loc.village" v={c.p.village} /></td></tr>
              <tr><th>e) Taluk / Ward</th><td><F k="a.loc.taluk" v={c.p.localBodyName} /></td></tr>
              <tr><th>f) Mandal / District / Municipality</th><td><F k="a.loc.district" v={[c.p.localBodyType && c.p.localBodyName ? `${c.p.localBodyName} ${c.p.localBodyType}` : '', c.p.district].filter(Boolean).join(', ')} /></td></tr>
            </>
          )}
          <Row n="7" label="Postal address of the property with pin code" k="a.postal" v={c.propertyAddress} />
          <tr><td className="c-n" rowSpan={3}>8</td><th>Residential Area</th><td><F k="a.resArea" v={c.d.site?.classificationLocality || ''} /></td></tr>
          <tr><th>Commercial Area</th><td><F k="a.comArea" v="" /></td></tr>
          <tr><th>Industrial Area</th><td><F k="a.indArea" v="" /></td></tr>
          <tr><td className="c-n" rowSpan={3}>9</td><th colSpan={2}>Classification of the area</th></tr>
          <tr><th>i) High / Middle / Poor</th><td><F k="a.classHMP" v="Middle" /></td></tr>
          <tr><th>ii) Urban / Semi Urban / Rural</th><td><F k="a.classUSR" v="Semi Urban" /></td></tr>
          <Row n="10" label="Coming under Corporation limit / Village Panchayat / Municipality" k="a.localBody" v={c.p.localBodyType || ''} />
        </tbody>
      </table>
    </>
  );
}

function BasicData2({ c, sides, loc }) {
  // Front / Rear / Side (from the facing) and Road, after each side's name
  const b = c.d.boundaries || {};
  const roles = sideRoles(b.facing);
  const roads = Array.isArray(b.roadSides) ? b.roadSides : [];
  const tag = (side) => {
    const d = side[0].toUpperCase() + side.slice(1);
    const t = [roles[d], roads.includes(d) && 'Road'].filter(Boolean).join(', ');
    return t ? <small className="side-role"> ({t})</small> : null;
  };
  return (
    <table className="t grid">
      <tbody>
          <Row n="11" label="Whether covered under any State / Central Govt. enactment's (e.g., Urban Land Ceiling Act) or notified under agency area / scheduled area / cantonment area." k="a.enactment" v="No" />
          <Row n="12" label="In case it is an agricultural land, any conversion to house site plots is contemplated" k="a.agri" v="No" />
          {b.facing && <Row n="" label="Facing of the plot" k="a.facing" v={`${b.facing} facing${roads.length ? ` · Road on ${roads.join(' & ')}${Number(b.roadWidthFt) > 0 ? ` (${Number(b.roadWidthFt)} ft wide)` : ''}` : ''}`} />}
          <tr className="sub-head"><td className="c-n">13</td><th>Boundaries of the property</th><th className="split"><span>As per the Deed</span><span className="sp-r">As per Actuals</span></th></tr>
          {['north', 'south', 'east', 'west'].map((side) => (
            <tr key={side}>
              <td className="c-n" />
              <th className="cap">{side}{tag(side)}</th>
              <td className="split"><F k={`b.${side}.deed`} v={sides[side]?.deed} /><span className="sp-r"><F k={`b.${side}.actual`} v={sides[side]?.actual || sides[side]?.deed} /></span></td>
            </tr>
          ))}
          <tr className="sub-head"><td className="c-n">14.1</td><th>Dimensions of the site</th><th className="split"><span>A – As per title deed</span><span className="sp-r">B – Actuals</span></th></tr>
          {['north', 'south', 'east', 'west'].map((side) => (
            <tr key={side}>
              <td className="c-n" />
              <th className="cap">{side}</th>
              <td className="split"><F k={`dim.${side}.deed`} v={sides[side]?.dimDeed} /><span className="sp-r"><F k={`dim.${side}.actual`} v={sides[side]?.dimActual || sides[side]?.dimDeed} /></span></td>
            </tr>
          ))}
          <tr><td className="c-n">14.2</td><th>Latitude, Longitude and Coordinates of the site</th><td className="split"><F k="a.lat" v={loc ? `Latitude: ${loc.lat}` : ''} /><span className="sp-r"><F k="a.lon" v={loc ? `Longitude: ${loc.lon}` : ''} /></span></td></tr>
          {c.r.land && (
            <>
              <tr><td className="c-n">15</td><th>Extent of the site</th><td className="split"><F k="a.extentDoc" v={num(c.d.land?.siteAreaDocument)} /><span className="sp-r"><F k="a.extentAct" v={c.d.land?.siteAreaActual ? `${num(c.d.land.siteAreaActual)} Sq. Yds` : ''} /></span></td></tr>
              <Row n="16" label="Extent of the site considered for valuation (least of 8A & 8B)" k="a.extentConsidered" v={`${num(c.r.land.siteArea)} Sq. Yds`} />
            </>
          )}
          <Row n="17" label="Whether occupied by the owner / tenant? Rent received per month." k="a.occupancy" v={c.d.land?.rentalValue || (c.d.flat?.monthlyRent ? `Rs.${num(c.d.flat.monthlyRent, 0)} Per month` : 'Owner occupied')} />
      </tbody>
    </table>
  );
}

function SiteCharacteristics({ c }) {
  if (c.bob) return <BobSiteCharacteristics c={c} />;
  const site = c.d.site || {};
  const rows = catalog.siteCharacteristics.filter((x) => site[x.key]);
  return (
    <>
      <h4>II. CHARACTERSTICS OF THE SITE</h4>
      <table className="t grid two">
        <tbody>
          {rows.map((x, i) => (
            <tr key={x.key}><th>{i + 1} {x.label}</th><td><F k={`site.${x.key}`} v={x.key === 'roadWidth' && Number(c.d.boundaries?.roadWidthFt) > 0 ? `${Number(c.d.boundaries.roadWidthFt)} ft wide (${Number(c.d.boundaries.roadWidthFt) < 20 ? 'below' : 'above'} 20 ft)` : site[x.key]} block /></td></tr>
          ))}
          <tr><th>{rows.length + 1} Advantages of the site</th><td><F k="site.advantages" v={(site.advantages || []).map((a, i) => `${i + 1}. ${a}`).join('\n') || 'Nil'} block /></td></tr>
          <tr><th>{rows.length + 2} General remarks</th><td><F k="site.remarks" v={lines(site.specialRemarks, site.disadvantages && site.disadvantages !== 'Nil' ? `Disadvantages: ${site.disadvantages}` : '')} block /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function LandValuation({ c }) {
  const L = c.r.land;
  const land = c.d.land || {};
  const sides = c.d.boundaries?.sides || {};
  const dim = (s) => sides[s]?.dimActual || sides[s]?.dimDeed || '';
  return (
    <>
      {c.pnb && c.agri ? <h3 className="u ctr">III. VALUATION OF AGRICULTURAL LAND</h3> : c.pnb ? <h3 className="u ctr">XIV. VALUATION</h3> : <h3 className="u ctr">III. VALUATION</h3>}
      {!(c.pnb && c.agri) && <h3 className="ctr">PART A - Valuation of Land</h3>}
      <table className="t grid">
        <tbody>
          <Row n="1" label="Size of plot – North & South" k="l.ns" v={`N : ${dim('north')} , S : ${dim('south')}`} />
          <Row n="" label="East & West" k="l.ew" v={`E : ${dim('east')} , W : ${dim('west')}`} />
          <Row n="2" label="Total extent of the plot" k="l.extent" v={`${num(L.siteArea)} Sq. Yds`} bold />
          <tr className="sec"><td colSpan={3}>A – Value on adopting GLR (Guideline Rate)</td></tr>
          <Row n="(i)" label="Guideline rate obtained from the Registrar's Office" k="l.glr" v={`Rs. ${num(land.glr, 0)} /Sq. Yd`} />
          <tr><td className="c-n">(ii)</td><th>Value of Land by adopting GLR &nbsp; {num(L.siteArea)} Sq.Yds x {num(land.glr, 0)} Rs/Sq.Yd</th><td className="r b"><F k="l.glrValue" v={rs(L.glrValue)} /></td></tr>
          <tr className="sec"><td colSpan={3}>B – Value by adopting PMR (Prevailing Market Rate)</td></tr>
          <Row n="(i)" label="Prevailing market rate (Along with details/reference of at least two latest deals/transactions)" k="l.pmrRange" v={L.marketRateRange ? `Rs.${num(L.marketRateRange[0], 0)} to Rs.${num(L.marketRateRange[1], 0)} /Sq. Yd${land.marketReference ? `\n${land.marketReference}` : ''}` : ''} />
          <Row n="(ii)" label="Unit rate adopted in this valuation after considering the characteristics of the subject plot" k="l.pmr" v={`Rs. ${num(land.marketRate, 0)} /Sq. Yd`} />
          <tr><td className="c-n">(iii)</td><th>Value of Land by adopting PMR &nbsp; {num(L.siteArea)} Sq.Yds x {num(land.marketRate, 0)} Rs/Sq.Yd</th><td className="r b"><F k="l.pmrValue" v={rs(L.pmrValue)} /></td></tr>
          <tr className="sec"><td colSpan={3}>C – Extra items</td></tr>
          {(L.extraItems || []).filter((x) => !(bobWallInServices(c) && x.key === 'compoundWall')).map((x, i) => (
            <Row key={x.key} n={`(${['i', 'ii', 'iii'][i]})`} label={x.key === 'compoundWall' ? 'Compound wall/fencing' : x.key === 'gate' ? 'Gate' : 'Power supply'} k={`l.${{ compoundWall: 'cw', gate: 'gate', powerSupply: 'power' }[x.key]}`}
              v={x.amount ? (x.qty != null ? `${num(x.qty)} ${x.unit} x Rs. ${num(x.rate, 0)} /${x.unit === 'No.' ? 'No.' : x.unit} = ${rs(x.amount)}` : rs(x.amount)) : ''} />
          ))}
          {(land.plusFactors || []).map((f, i) => <Row key={`p${i}`} n="+" label={f.description} k={`l.plus.${i}`} v={rs(f.amount)} />)}
          {(land.minusFactors || []).map((f, i) => <Row key={`m${i}`} n="−" label={f.description} k={`l.minus.${i}`} v={rs(f.amount)} />)}
        </tbody>
      </table>
    </>
  );
}

function BuildingTech({ c }) {
  const b = c.d.building || {};
  const B = c.r.building;
  const floorNames = (b.floors || []).map((f) => f.floor).filter(Boolean);
  const floorsLabel = floorNames.every((f) => FLOORS.includes(f)) ? floorNames.join(' and ') : floorNames.map(floorName).join(' and ');
  // our extra details (not in the Bank of Baroda list): between a)–d) normally; after j) for Bank of Baroda
  const techExtras = [
    <Row key="q" label="Quality of construction" k="bt.quality" v={b.constructionQuality} />,
    <Row key="ap" label="Appearance of Building" k="bt.appearance" v={b.appearance} />,
  ];
  const lifeRows = [
    <Row key="age" label="Age of Building" k="bt.age" v={B.age} />,
    <Row key="fl" label="Expected future life of building" k="bt.future" v={B.age == null ? '' : Math.max(B.life - B.age, 0)} />,
    <Row key="tl" label="Total life of Building" k="bt.life" v={B.life} />,
  ];
  return (
    <>
      <h3 className="ctr">PART B - Valuation of Building</h3>
      <h4>1 Technical details of the building</h4>
      <table className="t grid two">
        <tbody>
          <Row label="a) Type of Building" k="bt.type" v={b.buildingType} />
          <Row label="b) Type of construction" k="bt.construction" v={b.constructionType} />
          {!c.bob && techExtras}
          <Row label="c) Year of Construction" k="bt.year" v={b.yearOfConstruction} />
          {!c.bob && lifeRows}
          <Row label="d) Number of floors and height of each floor including basement, if any" k="bt.floors" v={`${floorsLabel ? `${floorsLabel}${floorNames.every((f) => FLOORS.includes(f)) ? ' Floor' : ''} Building` : ''}, Roof Height = 11' each floor`} />
        </tbody>
      </table>
      <h4>e) Plinth Area <small>As per IS 3861-1975</small></h4>
      <table className="t list">
        <thead><tr><th>Floor</th><th>Year of Construction</th><th>Roof of</th><th>Main Portion A</th><th>Cantilevered Portion B</th><th>Total A+50%B</th></tr></thead>
        <tbody>
          {(b.floors || []).map((f, i) => (
            <tr key={i}>
              <td><F k={`pl.${i}.floor`} v={floorName(f.floor)} /></td>
              <td><F k={`pl.${i}.year`} v={b.yearOfConstruction} /></td>
              <td><F k={`pl.${i}.roof`} v="RCC" /></td>
              <td><F k={`pl.${i}.main`} v={num(f.mainArea)} /></td>
              <td><F k={`pl.${i}.cant`} v={num(f.cantileverArea || 0)} /></td>
              <td><F k={`pl.${i}.total`} v={num(B.floors[i]?.plinthArea, 3)} /></td>
            </tr>
          ))}
          <tr className="total"><td colSpan={5}>Total</td><td><F k="pl.total" v={num(B.plinthTotal, 3)} /></td></tr>
        </tbody>
      </table>
      <table className="t grid three">
        <tbody>
          <tr><th rowSpan={2}>f) Maintenance / Condition of the Building</th><th>i) Exterior:</th><td><F k="bt.ext" v={b.maintenanceExterior} block /></td></tr>
          <tr><th>ii) Interior:</th><td><F k="bt.int" v={b.maintenanceInterior} block /></td></tr>
          <tr><th rowSpan={3}>g) Drawing Approval</th><th>Date of issue and validity of the layout of approved map / plan</th><td><F k="bt.appDate" v={b.layoutApprovalDate} block /></td></tr>
          <tr><th>h) Approved Map/Plan issuing authority</th><td><F k="bt.appAuth" v={b.approvalAuthority} block /></td></tr>
          <tr><th>i) Whether genuineness or authentic of approved map/plan is verified?</th><td><F k="bt.appVerified" v={b.approvalVerified} block /></td></tr>
          <tr><th>j) Any other comments by our empanelled valuer on authentic of approved plan?</th><td colSpan={2}><F k="bt.appComments" v={lines(b.approvalComments, b.approvalDeviations)} block /></td></tr>
        </tbody>
      </table>
      {c.bob && (
        <table className="t grid two">
          <tbody>{techExtras}{lifeRows}</tbody>
        </table>
      )}
      <div className="note"><F k="bt.method" v="Value of building is estimated by adopting suitable unit plinth area rate depending upon the specifications. Depreciation is calculated by straight-line method assuming a salvage value of 10%" block /></div>
    </>
  );
}

function BuildingSpecs({ c }) {
  const cwItem = (c.r.land?.extraItems || []).find((x) => x.key === 'compoundWall');
  const b = c.d.building || {};
  const B = c.r.building;
  const spec = [
    ['Foundation', 'spec.foundation', 'Random rubble masonry foundation in cement mortar below plinth level; standard PCC bed.'],
    ['Basement', 'spec.basement', ''],
    ['Super structure', 'spec.super', b.superStructure],
    ['Joinery / Doors & Windows', 'spec.joinery', b.joinery],
    ['RCC Works', 'spec.rcc', b.rccWorks],
    ['Plastering', 'spec.plaster', ''],
    ['Flooring, Skirting, Dadoing', 'spec.floor', b.floorFinish],
    ['Special finish as marble, granite, wooden paneling, grills, etc.', 'spec.special', ''],
    ['Roofing including weather proof course', 'spec.roof', lines(b.roof, b.weatheringCourse)],
    ['Drainage', 'spec.drain', c.bob ? (bobLines(c, BOB_DRAINAGE).map((x) => x.label).join(', ') || 'NA') : 'NA'],
  ];
  // Bank of Baroda numbers compound wall, electrical and plumbing on after the 10 specification rows
  const n = c.bob ? { cw: 11, el: 12 } : { cw: 2, el: 3 };
  const elec = [['a) Type of wiring', 'wiring'], ['b) Class of fittings', 'fittingsClass'], ['c) Number of light points', 'lightPoints'], ['d) Fan points', 'fanPoints'], ['e) Spare plug points', 'sparePlugPoints'], ['f) Any other item', 'otherProvisions']];
  const ePct = Number(b.electricalLumpsumPct || 5);
  return (
    <>
      <h4>Specifications of construction (floor-wise) in respect of</h4>
      <table className="t list spec">
        <thead><tr><th>S. No.</th><th>Description</th><th>Ground floor</th></tr></thead>
        <tbody>
          {spec.map(([label, k, v], i) => <tr key={k}><td>{i + 1}</td><th>{label}</th><td><F k={k} v={v} block /></td></tr>)}
        </tbody>
      </table>
      <table className="t grid">
        <tbody>
          <tr><td className="c-n" rowSpan={4}>{n.cw}</td><th>Compound Wall (R.ft)</th><td><F k="cw.amount" v={cwItem?.amount ? rs(cwItem.amount) : ''} /></td></tr>
          <tr><th>Height</th><td><F k="cw.height" v={c.d.land?.compoundWallHeight ? `${c.d.land.compoundWallHeight}${/['"]|ft/.test(c.d.land.compoundWallHeight) ? '' : ' ft'}` : "4'6\""} /></td></tr>
          <tr><th>Length</th><td><F k="cw.length" v={cwItem?.qty ? `${num(cwItem.qty)} Rft` : ''} /></td></tr>
          <tr><th>Type of construction</th><td><F k="cw.type" v="Brick Masonary with Cement Motor plaster" /></td></tr>
        </tbody>
      </table>
      <table className="t grid">
        <tbody>
          <tr><td className="c-n" rowSpan={8}>{n.el}</td><th>Electrical Installation</th><td /></tr>
          {elec.map(([label, key]) => <tr key={key}><th>{label}</th><td><F k={`el.${key}`} v={b[key] || catalog.electrical.find((e) => e.key === key)?.options[0] || ''} block /></td></tr>)}
          <tr><th>Total Lumsum @ {ePct}% of Civil Works (Part C)</th><td className="r b"><F k="el.total" v={rs(B.services.electricalLumpsum)} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

// part: 'plumbing' or 'details' prints only that half (PNB puts plumbing under Engineering, details under Valuation)
function BuildingValuationTable({ c, part }) {
  const b = c.d.building || {};
  const B = c.r.building;
  const pPct = Number(b.plumbingLumpsumPct || 5);
  return (
    <>
      {part !== 'details' && <table className="t grid">
        <tbody>
          <tr><td className="c-n" rowSpan={8}>{c.bob ? 13 : 4}</td><th>Plumbing Installation</th><td /></tr>
          <tr><th>a) No. of water closets and their type</th><td><F k="pb.closets" v={[b.closets, b.closetType].filter(Boolean).join(' – ') || 'Attached full bathroom & toilets'} /></td></tr>
          <tr><th>b) No. of wash basins</th><td><F k="pb.basins" v={b.washBasins ?? 'Available'} /></td></tr>
          <tr><th>c) No. of urinals</th><td><F k="pb.urinals" v="NA" /></td></tr>
          <tr><th>d) No. of bath tubs</th><td><F k="pb.tubs" v="NA" /></td></tr>
          <tr><th>e) Water meters, taps etc.</th><td><F k="pb.taps" v="NA" /></td></tr>
          <tr><th>f) Any other fixtures</th><td><F k="pb.other" v={b.otherFixtures} /></td></tr>
          <tr><th>Total Lumsum @ {pPct}% of Civil Works (Part C)</th><td className="r b"><F k="pb.total" v={rs(B.services.plumbingLumpsum)} /></td></tr>
        </tbody>
      </table>}
      {part !== 'plumbing' && <h4 className="ctr">{c.pnb ? 'PART B - Valuation of Building: Details of Valuation' : 'Details of Valuation'}</h4>}
      {part !== 'plumbing' && <table className="t list">
        <thead><tr><th>Particulars of item</th><th>Plinth Area</th><th>Estimated replacement rate of construction Rs./Sq.ft</th><th>Age of Building</th><th>Replacement cost Rs.</th><th>Net Value after depreciations Rs.</th></tr></thead>
        <tbody>
          {B.floors.map((f, i) => [
            <tr key={`f${i}`}>
              <td><F k={`dv.${i}.label`} v={`${FLOORS.includes(f.floor) ? `${f.floor} floor` : f.floor || ''} (Roof Height 11')`} /></td>
              <td><F k={`dv.${i}.area`} v={num(f.plinthArea)} /></td>
              <td><F k={`dv.${i}.rate`} v={num(f.rate, 0)} /></td>
              <td><F k={`dv.${i}.age`} v={B.age} /></td>
              <td><F k={`dv.${i}.rc`} v={rs(f.replacementCost)} /></td>
              <td />
            </tr>,
            <tr key={`d${i}`}>
              <td className="indent">Depreciation (-) {B.depreciationPct}%</td><td /><td /><td>(-)</td>
              <td><F k={`dv.${i}.dep`} v={rs(f.depreciation)} /></td>
              <td><F k={`dv.${i}.net`} v={rs(f.netValue)} /></td>
            </tr>,
          ])}
          <tr className="total"><td colSpan={5}>Total</td><td><F k="dv.total" v={rs(B.netTotal)} /></td></tr>
        </tbody>
      </table>}
    </>
  );
}

function TierTable({ c, title, sub, keys, prefix, startNo = 1 }) {
  const items = catalog.amenities.filter((x) => keys.includes(x.key));
  const total = items.reduce((s, x) => s + (c.amenityLines[x.key]?.amount || 0), 0);
  return (
    <>
      <h3 className="ctr">{title}</h3>
      {sub && <div className="ctr muted-s">{sub}</div>}
      <table className="t grid amounts">
        <tbody>
          {items.map((x, i) => {
            const l = c.amenityLines[x.key];
            return (
              <tr key={x.key}>
                <td className="c-n">{startNo + i}</td><th>{x.label}</th>
                <td className="r"><F k={`${prefix}.${x.key}`} v={l ? `${l.qty && !l.custom ? `${num(l.qty)}  Rs.${num(l.rate, 0)} /${l.unit}  ` : l.qty && l.unit ? `${num(l.qty)} ${l.unit}  ` : ''}${rs(l.amount)}` : ''} /></td>
              </tr>
            );
          })}
          <tr className="total"><th colSpan={2}>Total</th><td className="r"><F k={`${prefix}.total`} v={rs(total)} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function Services({ c }) {
  const S = c.r.building.services;
  const water = Object.fromEntries(S.water.lines.map((l) => [l.key, l]));
  return (
    <>
      <h3 className="ctr">PART E – SERVICES (Value after depreciation)</h3>
      <table className="t grid amounts">
        <tbody>
          <tr><td className="c-n" rowSpan={catalog.waterServices.length + 1}>1</td><th>Water supply & sanitation arrangements</th><td /></tr>
          {catalog.waterServices.map((x) => (
            <tr key={x.key}><th>{x.label}</th><td className="r"><F k={`sv.${x.key}`} v={water[x.key] ? rs(water[x.key].amount) : ''} /></td></tr>
          ))}
          <tr><td className="c-n">2</td><th>Electrical installation lumpsum</th><td className="r"><F k="sv.elec" v={rs(S.electricalLumpsum)} /></td></tr>
          <tr><td className="c-n">3</td><th>Plumbing installation lumpsum</th><td className="r"><F k="sv.plumb" v={rs(S.plumbingLumpsum)} /></td></tr>
          <tr className="total"><th colSpan={2}>Total</th><td className="r"><F k="sv.total" v={rs(S.total)} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

// ---------- Bank of Baroda arrangement (our report, data placed as in the bank's Annexure II-a) ----------
const BOB_C = ['portico', 'poojaDoor', 'sitOut', 'w:overheadTank', 'collapsibleGates'];
const BOB_D = AMENITY_KEYS;
const BOB_E = ['toiletRoom', 'lumberRoom', 'waterTankSump', 'gardening', 'openStaircase', 'other'];
const BOB_WATER = ['openWell', 'deepBore', 'handPump', 'motor', 'corporationTap', 'sump'];
const BOB_DRAINAGE = ['drainage', 'septicTank', 'undergroundSewerage'];
// the compound wall moves from Land to F Services only when there is a Part F (building)
const bobWallInServices = (c) => c.bob && c.kind === 'building';
// keys → [{ key, label, amount }] with an amount: amenities, or water services when prefixed "w:"
function bobLines(c, keys) {
  const water = Object.fromEntries((c.r.building?.services?.water?.lines || []).map((l) => [l.key, l]));
  return keys.map((k) => {
    const isWater = k.startsWith('w:') || BOB_WATER.includes(k) || BOB_DRAINAGE.includes(k);
    const key = k.replace(/^w:/, '');
    const item = (isWater ? catalog.waterServices : catalog.amenities).find((x) => x.key === key);
    const l = isWater ? water[key] : c.amenityLines[key];
    return item && l ? { key, label: item.label, amount: l.amount || 0, line: l } : null;
  }).filter(Boolean);
}
function bobParts(c) {
  const sum = (xs) => xs.reduce((t, x) => t + (x.amount || 0), 0);
  const S = c.r.building?.services || {};
  const wallItem = bobWallInServices(c) ? (c.r.land?.extraItems || []).find((x) => x.key === 'compoundWall') : null;
  const wall = wallItem?.amount || 0;
  const C = bobLines(c, BOB_C), D = bobLines(c, BOB_D), E = bobLines(c, BOB_E);
  const water = bobLines(c, BOB_WATER), drainage = bobLines(c, BOB_DRAINAGE);
  const F = {
    water, drainage, wall, wallItem,
    plumbing: S.plumbingLumpsum || 0, electrical: S.electricalLumpsum || 0,
  };
  F.total = sum(water) + F.plumbing + sum(drainage) + wall + F.electrical;
  return { wall, C: { items: C, total: sum(C) }, D: { items: D, total: sum(D) }, E: { items: E, total: sum(E) }, F };
}

function BobLocation({ c }) {
  const p = c.p;
  const isPlot = !p.numberType || /plot/i.test(p.numberType);
  const rows = [
    ['Plot No. / Survey No.', 'a.loc.no', [isPlot && p.number, p.surveyNo && `Sy.No. ${p.surveyNo}`].filter(Boolean).join(', ')],
    ['Door No.', 'a.loc.door', !isPlot && p.number ? `${p.numberType} ${p.number}` : ''],
    ['T. S. No. / Village', 'a.loc.village', p.village],
    ['Ward / Taluka', 'a.loc.taluk', p.localBodyName],
    ['Mandal / District', 'a.loc.district', [p.localBodyType && p.localBodyName ? `${p.localBodyName} ${p.localBodyType}` : '', p.district].filter(Boolean).join(', ')],
  ].filter((x) => x[2]);
  return (
    <>
      <tr><td className="c-n" rowSpan={rows.length + 1}>6</td><th>Location of property</th><td><F k="a.loc" v={p.description} /></td></tr>
      {rows.map(([label, k, v], i) => <tr key={k}><th>{'abcde'[i]}) {label}</th><td><F k={k} v={v} /></td></tr>)}
    </>
  );
}

function BobBasicData2({ c, sides, loc }) {
  const b = c.d.boundaries || {};
  const roles = sideRoles(b.facing);
  const roads = Array.isArray(b.roadSides) ? b.roadSides : [];
  const tag = (side) => {
    const d = side[0].toUpperCase() + side.slice(1);
    const t = [roles[d], roads.includes(d) && 'Road'].filter(Boolean).join(', ');
    return t ? <small className="side-role"> ({t})</small> : null;
  };
  // boundary and its dimension together, as per the deed and as per actuals
  const cell = (s, actual) => {
    const x = sides[s] || {};
    const bound = actual ? x.actual || x.deed : x.deed;
    const dim = actual ? x.dimActual || x.dimDeed : x.dimDeed;
    return lines(bound, dim && `Dimension: ${dim}`);
  };
  return (
    <table className="t grid">
      <tbody>
        <Row n="11" label="Whether covered under any State / Central Govt. enactment's (e.g., Urban Land Ceiling Act) or notified under agency area / scheduled area / cantonment area." k="a.enactment" v="No" />
        <Row n="12" label="In case it is an agricultural land, any conversion to house site plots is contemplated" k="a.agri" v="No" />
        <tr className="sub-head"><td className="c-n">13</td><th>Dimensions / Boundaries of the property</th><th className="split"><span>A – As per the Deed</span><span className="sp-r">B – Actuals</span></th></tr>
        {['north', 'south', 'east', 'west'].map((side) => (
          <tr key={side}>
            <td className="c-n" />
            <th className="cap">{side}{tag(side)}</th>
            <td className="split"><F k={`b.${side}.deed`} v={cell(side, false)} block /><span className="sp-r"><F k={`b.${side}.actual`} v={cell(side, true)} block /></span></td>
          </tr>
        ))}
        <tr><td className="c-n">13.2</td><th>Latitude, Longitude and Coordinates of the site</th><td className="split"><F k="a.lat" v={loc ? `Latitude: ${loc.lat}` : ''} /><span className="sp-r"><F k="a.lon" v={loc ? `Longitude: ${loc.lon}` : ''} /></span></td></tr>
        {c.r.land && (
          <>
            <tr><td className="c-n">14</td><th>Extent of the site</th><td className="split"><F k="a.extentDoc" v={num(c.d.land?.siteAreaDocument)} /><span className="sp-r"><F k="a.extentAct" v={c.d.land?.siteAreaActual ? `${num(c.d.land.siteAreaActual)} Sq. Yds` : ''} /></span></td></tr>
            <Row n="15" label="Extent of the site considered for valuation (least of 13A & 13B)" k="a.extentConsidered" v={`${num(c.r.land.siteArea)} Sq. Yds`} />
          </>
        )}
        {c.kind === 'flat' && (
          <>
            {c.d.flat?.apartmentSiteArea ? <Row n="14" label="Extent of the site (apartment)" k="a.extentDoc" v={`${num(c.d.flat.apartmentSiteArea)} Sq. Yds`} /> : null}
            {c.d.flat?.uds ? <Row n="15" label="Extent of the site considered for valuation (undivided share of land)" k="a.extentConsidered" v={`${num(c.d.flat.uds)} Sq. Yds`} /> : null}
          </>
        )}
        <Row n="16" label="Whether occupied by the owner / tenant? If occupied by tenant, since how long? Rent received per month." k="a.occupancy"
          v={c.kind === 'flat' ? lines(c.d.flat?.occupancy || 'Owner occupied', c.d.flat?.monthlyRent && `Rent Rs.${num(c.d.flat.monthlyRent, 0)} per month`) : c.d.land?.rentalValue || 'Owner occupied'} />
      </tbody>
    </table>
  );
}

function BobSiteCharacteristics({ c }) {
  const site = c.d.site || {};
  const b = c.d.boundaries || {};
  const label = (k) => catalog.siteCharacteristics.find((x) => x.key === k)?.label || k;
  const roads = Array.isArray(b.roadSides) ? b.roadSides : [];
  const facing = b.facing ? `${b.facing} facing${roads.length ? ` · Road on ${roads.join(' & ')}` : ''}` : '';
  const width = Number(b.roadWidthFt) > 0 ? `${Number(b.roadWidthFt)} ft wide (${Number(b.roadWidthFt) < 20 ? 'below' : 'above'} 20 ft)` : site.roadWidth;
  // the bank's order; our extra answers folded into the nearest item
  const rows = [
    ['classificationLocality', label('classificationLocality'), lines(site.classificationLocality, site.characterLocality)],
    ['surroundingDevelopment', label('surroundingDevelopment'), site.surroundingDevelopment],
    ['flooding', label('flooding'), site.flooding],
    ['civicAmenities', label('civicAmenities'), site.civicAmenities],
    ['landLevel', label('landLevel'), site.landLevel],
    ['landShape', label('landShape'), site.landShape],
    ['permittedUse', label('permittedUse'), site.permittedUse],
    ['usageRestriction', label('usageRestriction'), site.usageRestriction],
    ['approvedLayout', label('approvedLayout'), site.approvedLayout],
    ['plotPosition', label('plotPosition'), site.plotPosition],
    ['roadFacilities', label('roadFacilities'), lines(site.roadFacilities, facing)],
    ['roadType', label('roadType'), site.roadType],
    ['roadWidth', label('roadWidth'), width],
    ['landLocked', label('landLocked'), site.landLocked],
    ['waterPotentiality', label('waterPotentiality'), site.waterPotentiality],
    ['sewerage', label('sewerage'), site.sewerage],
    ['powerSupply', label('powerSupply'), site.powerSupply],
  ].filter((x) => x[2]);
  const remarks = lines(site.specialRemarks, site.drawingApprovalIssue && `Drawing approval: ${site.drawingApprovalIssue}`, site.disadvantages && site.disadvantages !== 'Nil' ? `Disadvantages: ${site.disadvantages}` : '');
  return (
    <>
      <h4>II. CHARACTERSTICS OF THE SITE</h4>
      <table className="t grid two">
        <tbody>
          {rows.map(([k, l, v], i) => <tr key={k}><th>{i + 1} {l}</th><td><F k={`site.${k}`} v={v} block /></td></tr>)}
          <tr><th>{rows.length + 1} Advantages of the site</th><td><F k="site.advantages" v={(site.advantages || []).map((a, i) => `${i + 1}. ${a}`).join('\n') || 'Nil'} block /></td></tr>
          <tr><th>{rows.length + 2} Special remarks, if any, like threat of acquisition of land for public service purposes, road widening or applicability of CRZ provisions etc.</th><td><F k="site.remarks" v={remarks || 'Nil'} block /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function BobPartTable({ title, sub, part, prefix }) {
  return (
    <>
      <h3 className="ctr">{title}</h3>
      {sub && <div className="ctr muted-s">{sub}</div>}
      <table className="t grid amounts">
        <tbody>
          {part.items.map((x, i) => (
            <tr key={x.key}><td className="c-n">{i + 1}</td><th>{x.label}</th><td className="r"><F k={`${prefix}.${x.key}`} v={rs(x.amount)} /></td></tr>
          ))}
          {!part.items.length && <tr><td className="c-n" /><th>Nil</th><td /></tr>}
          <tr className="total"><th colSpan={2}>Total</th><td className="r"><F k={`${prefix}.total`} v={rs(part.total)} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function BobServices({ part: F_ }) {
  const sub = (xs, prefix) => xs.map((x) => <tr key={x.key}><th className="indent">{x.label}</th><td className="r"><F k={`sv.${x.key}`} v={rs(x.amount)} /></td></tr>);
  const rows = [];
  let n = 0;
  if (F_.water.length || F_.plumbing) {
    n += 1;
    rows.push(<tr key="w"><td className="c-n" rowSpan={F_.water.length + 2}>{n}</td><th>Water supply arrangements</th><td /></tr>, ...sub(F_.water), <tr key="pl"><th className="indent">Plumbing installation lumpsum</th><td className="r"><F k="sv.plumb" v={rs(F_.plumbing)} /></td></tr>);
  }
  if (F_.drainage.length) {
    n += 1;
    rows.push(<tr key="d"><td className="c-n" rowSpan={F_.drainage.length + 1}>{n}</td><th>Drainage arrangements</th><td /></tr>, ...sub(F_.drainage));
  }
  if (F_.wall) {
    n += 1;
    rows.push(<tr key="cw"><td className="c-n">{n}</td><th>Compound wall{F_.wallItem?.qty ? ` (${num(F_.wallItem.qty)} ${F_.wallItem.unit || 'Rft'})` : ''}</th><td className="r"><F k="sv.wall" v={rs(F_.wall)} /></td></tr>);
  }
  if (F_.electrical) {
    n += 1;
    rows.push(<tr key="el"><td className="c-n">{n}</td><th>C. B. deposits, fittings etc. (Electrical installation lumpsum)</th><td className="r"><F k="sv.elec" v={rs(F_.electrical)} /></td></tr>);
  }
  return (
    <>
      <h3 className="ctr">PART F – SERVICES (Value after depreciation)</h3>
      <table className="t grid amounts">
        <tbody>
          {rows}
          <tr className="total"><th colSpan={2}>Total</th><td className="r"><F k="sv.total" v={rs(F_.total)} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function Abstract({ c }) {
  const { r, s } = c;
  const group = (keys) => keys.reduce((sum, k) => sum + (c.amenityLines[k]?.amount || 0), 0);
  const rows = [['A', 'Land', r.land?.glrValue, r.land?.fairMarketValue]];
  if (c.kind === 'building' && c.bob) {
    // Bank of Baroda parts: compound wall under F Services (out of Land), overhead tank under C Extra items (out of F)
    const P = bobParts(c);
    rows[0] = ['A', 'Land', r.land?.glrValue, (r.land?.fairMarketValue || 0) - P.wall];
    rows.push(['B', 'Building', r.building.bookValue, r.building.netTotal]);
    rows.push(['C', 'Extra Items', null, P.C.total]);
    rows.push(['D', 'Amenities', null, P.D.total]);
    rows.push(['E', 'Miscellaneous', null, P.E.total]);
    rows.push(['F', 'Services', null, P.F.total]);
  } else if (c.kind === 'building') {
    rows.push(['B', 'Building', r.building.bookValue, r.building.netTotal]);
    rows.push(['C', 'Extra Items', null, group(EXTRA_KEYS)]);
    rows.push(['D', 'Amenities', null, group(AMENITY_KEYS)]);
    rows.push(['E', 'Miscellaneous', null, group(MISC_KEYS)]);
    rows.push(['F', 'Services', null, r.building.services.total]);
  }
  if (c.kind === 'flat') {
    rows.length = 0;
    rows.push(['A', 'Undivided share of land', null, r.flat.landCost]);
    rows.push(['B', r.flat.underConstruction ? 'Building (stage value)' : 'Building (depreciated)', null, r.flat.underConstruction ? r.flat.stageValue - r.flat.landCost : r.flat.buildingCost]);
    if (r.flat.extras) rows.push(['C', 'Extra items', null, r.flat.extras]);
  }
  const glrTotal = rows.reduce((t, x) => t + (x[2] || 0), 0);
  const pmrTotal = rows.reduce((t, x) => t + (x[3] || 0), 0);
  return (
    <>
      <h3 className="ctr">{c.bob ? 'ABSTRACT VALUE' : 'PART F - ABSTRACT VALUE'}</h3>
      <h4>Total abstract of the entire property</h4>
      <table className="t list abstract">
        <thead>
          <tr><th rowSpan={2}>Part</th><th rowSpan={2}>Description</th><th colSpan={2}>Value of adopting</th></tr>
          <tr><th>GLR</th><th>PMR</th></tr>
        </thead>
        <tbody>
          {rows.map(([p, label, glr, pmr]) => (
            <tr key={p}><td>{p}</td><td>{label}</td><td className="r"><F k={`ab.${p}.glr`} v={glr ? rs(glr) : ''} /></td><td className="r"><F k={`ab.${p}.pmr`} v={rs(pmr)} /></td></tr>
          ))}
          <tr className="total"><td colSpan={2}>Total</td><td className="r"><F k="ab.glrTotal" v={rs(glrTotal)} /></td><td className="r"><F k="ab.pmrTotal" v={rs(pmrTotal)} /></td></tr>
          <tr className="total"><td colSpan={2}>Say</td><td className="r"><F k="ab.glrSay" v={rs(s.bookValue)} /></td><td className="r"><F k="ab.pmrSay" v={rs(s.fairMarketValue)} /></td></tr>
          <tr className="total"><td colSpan={3}>{c.bob ? 'Present market value' : 'Present market value (F)'}</td><td className="r"><F k="ab.pmv" v={rs(s.fairMarketValue)} /></td></tr>
        </tbody>
      </table>
      <h4>ANY OTHER DETAILS:</h4>
      <div className="note"><F k="ab.otherDetails" v={lines('(Valuation: Here the approved valuer should discuss in detail his approach to valuation of property and Indicate how the value has been arrived at, supported by necessary calculations. Also such aspects as i) Saleability ii) likely rental values in future and iii) any likely income it may generate may be discussed).', c.d.land?.saleability && `Saleability: ${c.d.land.saleability}`, c.d.land?.rentalValue && `Likely rental value: ${c.d.land.rentalValue}`)} block /></div>
      <p>As a result of my appraisal and analysis it is my considered opinion that the present fair market value of the above property in the prevailing condition with aforesaid specifications as of {c.valuationDate} is</p>
      <ValueLines c={c} prefix="ab.final" />
      {c.pnb && <PnbOtherDetails c={c} />}
      <Signature c={c} label="Name and official seal of the Approved Valuer" />
      <div className="encl">Encl: 1 Declaration from the valuer in Format (Annexure - 6)<br />2 Model Code of conduct for valuer (Annexure - 7)</div>
    </>
  );
}

function PartG({ c }) {
  const points = CERTIFICATE_POINTS({ titleDeed: c.titleDeed, inspectionDate: c.inspectionDate, bankRef: c.bankRef });
  return (
    <>
      <h3 className="ctr">PART G - CERTIFICATE</h3>
      <ol className="cert-list">
        <li>
          <F k="g.1" v={points[0]} />
          <div className="sub-li">i) <F k="g.1i" v={`The Present market value of the property discussed in the report (above) by adopting prevailing market rate for land${c.kind === 'building' ? ' and Building' : ''} is Rs.${Math.round(c.s.fairMarketValue || 0).toLocaleString('en-IN')}/-`} /></div>
          <div className="sub-li">ii) <F k="g.1ii" v={`The forced sale value of the property estimated as ${Math.round((c.s.distressPct || 0.8) * 100)}% of the present market value.`} /></div>
        </li>
        {points.slice(1).map((t, i) => <li key={i}><F k={`g.${i + 2}`} v={t} block /></li>)}
      </ol>
      <Signature c={c} title="(Panel Valuer)" label="Name and official seal of the Approved Valuer" />
      <h4>Enclosures:</h4>
      <ul className="arrow-list">{ENCLOSURES.map((e, i) => <li key={i}><F k={`encl.${i}`} v={e} /></li>)}</ul>
      <p className="note">(Note: The valuer may add any number of additional sheets for providing any vital data and relevant information)</p>
    </>
  );
}

function BankUse({ c }) {
  return (
    <>
      <h3 className="ctr">For Bank Use Only</h3>
      <div className="bank-box">
        <p>The undersigned has inspected the property detailed in the Valuation Report dated {c.valuationDate} on</p>
        <p className="blank-line" />
        <p>Whether satisfied with the description of the property, boundaries of the property, characteristic of the site and specification of the construction given in the report - Yes/No</p>
        <p>Property is directly accessible : Yes / No</p>
      </div>
      <div className="sign">
        <div><div>Date:</div><div>Place:</div></div>
        <OtherSignature lines={['Name of the Branch Manager', 'with Office Seal']} />
      </div>
    </>
  );
}

function Remarks() {
  return (
    <>
      <div className="ref-line"><strong className="u">Remarks:</strong><span>(Annexure-III)</span></div>
      <h4 className="u">Difference between SRO guide line rates and present market rates.</h4>
      <h4 className="u">There is a vast difference between the SRO values and present market values by more than 20%.</h4>
      <ol className="num-list">{SRO_REMARKS.map((t, i) => <li key={i} className={i === SRO_REMARKS.length - 1 ? 'b' : ''}><F k={`sro.${i}`} v={t} block /></li>)}</ol>
      <h4>Judgements of honorable courts clarifying market rate and guideline rates.</h4>
      {COURT_JUDGEMENTS.map((t, i) => <p key={i}>{['i', 'ii', 'iii'][i]}. <F k={`court.${i}`} v={t} /></p>)}
      {APPROACH_NOTE.map((t, i) => <div key={i}><F k={`approach.${i}`} v={t} /></div>)}
    </>
  );
}

function Declaration({ c, part }) {
  const info = { valuationDate: c.valuationDate, inspectionDate: c.inspectionDate, appointmentDate: c.appointmentDate, purpose: c.purpose, bankRef: `Branch Manager: ${c.g.bankName || ''} : ${c.g.branch || ''}`, background: c.background, procedures: c.procedures };
  const table = DECLARATION_TABLE(info);
  const rows = part === 1 ? table.slice(0, 7) : table.slice(7);
  return (
    <>
      {part === 1 && (
        <>
          <div className="annex-head"><div>Annexure 6</div><div>FORMAT – E</div><div>DECLARATION FROM VALUERS</div></div>
          <p>I hereby declare that-</p>
          {DECLARATION_POINTS(info).map((t, i) => <p key={i} className="decl"><strong>{'abcdefghijk'[i]}.</strong> <F k={`decl.${i}`} v={t} /></p>)}
        </>
      )}
      <table className="t list decl-table">
        <thead><tr><th>Sl.No.</th><th>Particulars</th><th>Valuer comment</th></tr></thead>
        <tbody>
          {rows.map(([label, value], i) => {
            const no = part === 1 ? i + 1 : i + 8;
            return <tr key={no}><td>{no}</td><td>{label}</td><td><F k={`declt.${no}`} v={value} block /></td></tr>;
          })}
        </tbody>
      </table>
      <Signature c={c} />
    </>
  );
}

function CodeOfConduct({ c, part }) {
  let n = 0;
  const sections = CODE_OF_CONDUCT.map(([title, items]) => [title, items.map((t) => [++n, t])]);
  const shown = part === 1 ? sections.slice(0, 3) : sections.slice(3);
  return (
    <>
      {part === 1 && (
        <div className="annex-head">
          <div>ANNEXURE - 7</div><div>MODEL CODE OF CONDUCT FOR VALUERS</div>
          <div className="i">{'{Adopted in line with companies (Registered Valuers and Valuation Rules, 2017)}'}</div>
        </div>
      )}
      {part === 1 && <p>All valuers empanelled with bank shall strictly adhere to the following code of conduct:</p>}
      {shown.map(([title, items]) => (
        <div key={title} className="coc">
          <h4>{title}</h4>
          <ol className="num-list" start={items[0][0]}>
            {items.map(([no, t]) => <li key={no} value={no}><F k={`coc.${no}`} v={t} block /></li>)}
          </ol>
          {title.startsWith('Gifts') && <div className="note i"><F k="coc.relative" v={RELATIVE_NOTE} block /></div>}
        </div>
      ))}
      {part === 2 && (
        <>
          <Signature c={c} />
          <div className="ctr">*****</div>
        </>
      )}
    </>
  );
}

function KeyPlan({ c }) {
  const loc = c.p.location;
  return (
    <>
      <h3 className="ctr">Key Plan Showing the Location of the Property (Google Map Extract)</h3>
      <div className="ref-line"><span>Google Coordinates</span><span>Lat: <F k="kp.lat" v={loc?.lat ?? ''} /></span><span>Lon: <F k="kp.lon" v={loc?.lon ?? ''} /></span></div>
      {/* a zoomed-out location map and a close-up of the property */}
      {loc?.lat !== undefined ? <LocationMaps lat={loc.lat} lon={loc.lon} boundary={loc.boundary} /> : <div className="placeholder">GPS location not captured in the input sheet.</div>}
    </>
  );
}

// satellite view of the area under the pinned points + every point's coordinates and the centre
const coord = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : '');
function SitePlan({ c }) {
  const loc = c.p.location || {};
  const pts = (loc.boundary || []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)));
  const half = Math.ceil(pts.length / 2);
  const rows = Array.from({ length: half }, (_, i) => [i, i + half < pts.length ? i + half : null]);
  const sqm = Number(loc.areaSqm) || 0;
  const cell = (i) => (i === null
    ? <><td /><td /><td /></>
    : <><td className="ctr"><b>{i + 1}</b></td><td className="ctr">{coord(pts[i].lat)}</td><td className="ctr">{coord(pts[i].lon)}</td></>);
  return (
    <>
      <h3 className="ctr">Site Plan Showing the Area Under the Marked Points (Satellite View)</h3>
      <SitePlanMap lat={loc.lat} lon={loc.lon} boundary={pts} />
      <h4>Coordinates of the points marked at site</h4>
      <table className="t grid coords">
        <thead>
          <tr><th>Point</th><th>Latitude</th><th>Longitude</th>{pts.length > 1 && <><th>Point</th><th>Latitude</th><th>Longitude</th></>}</tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => <tr key={a}>{cell(a)}{pts.length > 1 && cell(b)}</tr>)}
          <tr className="coords-centre">
            <td className="ctr"><b>Centre</b></td><td className="ctr"><b><F k="sp.lat" v={coord(loc.lat)} /></b></td><td className="ctr"><b><F k="sp.lon" v={coord(loc.lon)} /></b></td>
            {pts.length > 1 && <td colSpan={3} className="ctr">{sqm ? <>Area enclosed ≈ <F k="sp.area" v={`${Math.round(sqm * SQYD_PER_SQM).toLocaleString('en-IN')} Sq.Yds (${Math.round(sqm * SQFT_PER_SQM).toLocaleString('en-IN')} Sq.ft)`} /></> : ''}</td>}
          </tr>
        </tbody>
      </table>
    </>
  );
}

// the page printed for a document: its "first page" image, else (older sheets) its first photo
export const documentFirstPage = (doc = {}) => (doc.firstPage || []).find(printable) || (doc.files || []).find(printable) || null;
// Land valuation → "Value details": the image alone, one full page each, at the very end
function LastPageImage({ file }) {
  return <FullPagePhoto file={file} />;
}
function DocumentPage({ doc, n, file }) {
  const pdfs = (doc.files || []).filter((f) => f.type === 'application/pdf').length;
  return (
    <>
      <h3 className="ctr">Document {n}: {doc.type || 'Document'} – first page</h3>
      <p className="doc-page-desc">{documentDescription(doc)}{doc.number ? ` · No. ${doc.number}` : ''}{pdfs ? ' · full copy on file' : ''}</p>
      <FullPagePhoto file={file} />
    </>
  );
}

const PHOTOS_PER_PAGE = 6;
const printable = (f) => f.type?.startsWith('image/') && !/hei[cf]/.test(f.type);
export function reportPhotos(c) {
  const order = ['north', 'south', 'east', 'west'];
  const b = c.d.boundaries || {};
  const roles = sideRoles(b.facing);
  const roads = Array.isArray(b.roadSides) ? b.roadSides : [];
  const sidePhotos = [...(b.photos || [])].sort((x, y) => order.indexOf(x.side) - order.indexOf(y.side)).map((f) => {
    if (!f.side) return f;
    const d = f.side[0].toUpperCase() + f.side.slice(1);
    const tags = [roles[d], roads.includes(d) && 'Road'].filter(Boolean).join(', ');
    return { ...f, caption: `${d} side${tags ? ` (${tags})` : ''}` };
  });
  return [...(c.p.photos || []), ...sidePhotos].filter(printable);
}

function Photos({ c, page = 0, pages = 1 }) {
  const images = reportPhotos(c).slice(page * PHOTOS_PER_PAGE, (page + 1) * PHOTOS_PER_PAGE);
  return (
    <>
      <h3 className="ctr">Site Photos{pages > 1 ? ` (Page ${page + 1} of ${pages})` : ''}</h3>
      {images.length ? <PhotoGrid files={images} /> : <div className="placeholder">No site photos uploaded.<small>Add photos in the input sheet (Property location → Site photos).</small></div>}
    </>
  );
}


// Ordered list of sheets for this valuation (mirrors the 17–19 page bank format)
export function sheetsFor(c) {
  if (c.pnb) return pnbSheets(c);
  const list = [
    { id: 'cert', letterhead: true, el: <Certificate c={c} /> },
    { id: 'basic1', el: <BasicData c={c} part={1} /> },
    { id: 'basic2', el: <><BasicData c={c} part={2} />{c.kind !== 'flat' && <SiteCharacteristics c={c} />}</> },
  ];
  if (c.kind !== 'flat') list.push({ id: 'land', el: <LandValuation c={c} /> });
  if (c.kind === 'building' && c.bob) {
    const P = bobParts(c);
    list.push({ id: 'bld1', el: <BuildingTech c={c} /> });
    list.push({ id: 'bld2', el: <BuildingSpecs c={c} /> });
    list.push({ id: 'bld3', el: <><BuildingValuationTable c={c} /><BobPartTable title="PART C – EXTRA ITEMS" sub="(Value after Depreciation)" part={P.C} prefix="ex" /></> });
    list.push({ id: 'amen', el: <><BobPartTable title="PART D – AMENITIES" part={P.D} prefix="am" /><BobPartTable title="PART E – MISCELLANEOUS" part={P.E} prefix="mi" /></> });
    list.push({ id: 'services', el: <BobServices c={c} part={P.F} /> });
  } else if (c.kind === 'building') {
    list.push({ id: 'bld1', el: <BuildingTech c={c} /> });
    list.push({ id: 'bld2', el: <BuildingSpecs c={c} /> });
    list.push({ id: 'bld3', el: <><BuildingValuationTable c={c} /><TierTable c={c} title="PART C – EXTRA ITEMS" sub="(Value after Depreciation)" keys={EXTRA_KEYS} prefix="ex" /></> });
    list.push({ id: 'amen', el: <><TierTable c={c} title="PART D – AMENITIES" keys={AMENITY_KEYS} prefix="am" /><TierTable c={c} title="PART E – MISCELLANEOUS" keys={MISC_KEYS} prefix="mi" /></> });
    list.push({ id: 'services', el: <Services c={c} /> });
  }
  if (c.kind === 'flat' && c.bob) {
    list.push({ id: 'flat', el: <BobFlatBuilding c={c} /> });
    list.push({ id: 'flat2', el: <BobFlatValuation c={c} /> });
  } else if (c.kind === 'flat') list.push({ id: 'flat', el: <FlatValuation c={c} /> });
  return [...list, ...tailSheets(c)];
}

// the pages every report ends with: abstract, certificate, bank use, declarations, maps, photos, documents
function tailSheets(c) {
  const list = [];
  list.push(
    { id: 'abstract', el: <Abstract c={c} /> },
    { id: 'partg', el: <PartG c={c} /> },
    { id: 'bank', el: <BankUse c={c} /> },
    { id: 'remarks', el: <Remarks /> },
    { id: 'decl1', el: <Declaration c={c} part={1} /> },
    { id: 'decl2', el: <Declaration c={c} part={2} /> },
    { id: 'coc1', el: <CodeOfConduct c={c} part={1} /> },
    { id: 'coc2', el: <CodeOfConduct c={c} part={2} /> },
    { id: 'map', el: <KeyPlan c={c} /> },
  );
  // the satellite site plan, once the plot's corners are pinned on the map
  if ((c.p.location?.boundary || []).length >= 3) list.push({ id: 'siteplan', el: <SitePlan c={c} /> });
  const pages = Math.max(1, Math.ceil(reportPhotos(c).length / PHOTOS_PER_PAGE));
  for (let i = 0; i < pages; i++) list.push({ id: i ? `photos${i + 1}` : 'photos', el: <Photos c={c} page={i} pages={pages} /> });
  // documents produced: the first page of each, as a full page (older sheets: the first photo of the document)
  c.docs.forEach((doc, i) => {
    const first = documentFirstPage(doc);
    if (first) list.push({ id: `docpage${i}`, el: <DocumentPage doc={doc} n={i + 1} file={first} /> });
  });
  // last: the value details image(s) attached in Land valuation
  (c.d.land?.reportImages || []).filter(printable).forEach((file, i) => list.push({ id: `lastpage${i}`, el: <LastPageImage file={file} /> }));
  return list;
}

// ---------- Punjab National Bank: our report, data arranged as in PNB's Appendix I / II / III ----------
const hasV = (v) => v !== undefined && v !== null && v !== false && String(v).trim() !== '';
const SIDES = ['north', 'south', 'east', 'west'];

// numbered rows from parts: { label, k, v } · { label, subs: [[label, k, v]] } · { label, sides: (side, actual) => text }
// rows without data are left out and the numbering runs on over what is shown
function pnbRows(parts, prefix) {
  let n = 0;
  const out = [];
  parts.filter(Boolean).forEach((it, idx) => {
    const key = `${prefix}${idx}`;
    if (it.sides) {
      n += 1;
      out.push(<tr key={key} className="sub-head"><td className="c-n">{n}</td><th>{it.label}</th><th className="split"><span>A – As per the Deed</span><span className="sp-r">B – Actuals</span></th></tr>);
      SIDES.forEach((s) => out.push(
        <tr key={`${key}${s}`}><td className="c-n" /><th className="cap">{s}</th><td className="split"><F k={`${prefix}.${idx}.${s}.d`} v={it.sides(s, false)} block /><span className="sp-r"><F k={`${prefix}.${idx}.${s}.a`} v={it.sides(s, true)} block /></span></td></tr>,
      ));
      return;
    }
    if (it.subs) {
      const subs = it.subs.filter((s) => hasV(s[2]));
      if (!subs.length) return;
      n += 1;
      out.push(<tr key={key}><td className="c-n" rowSpan={subs.length + 1}>{n}</td><th colSpan={2}>{it.label}</th></tr>);
      subs.forEach(([label, k, v]) => out.push(<tr key={k}><th className="indent">{label}</th><td><F k={k} v={String(v)} block /></td></tr>));
      return;
    }
    if (!hasV(it.v)) return;
    n += 1;
    out.push(<tr key={key}><td className="c-n">{n}</td><th>{it.label}</th><td className={it.bold ? 'b' : ''}><F k={it.k} v={String(it.v)} block /></td></tr>);
  });
  return out;
}
// a section: its rows, or "NA" when the sheet has nothing for it
function PnbSection({ title, parts, prefix, children }) {
  const rows = pnbRows(parts || [], prefix);
  return (
    <>
      <h4>{title}</h4>
      <table className="t grid">
        <tbody>
          {rows.length ? rows : <tr><td className="c-n">–</td><th>—</th><td><F k={`${prefix}.na`} v="NA" /></td></tr>}
        </tbody>
      </table>
      {children}
    </>
  );
}

function pnbLocation(c, prefix) {
  const p = c.p;
  const isPlot = !p.numberType || /plot/i.test(p.numberType);
  return [
    ['Plot No. / Survey No.', `${prefix}.plot`, [isPlot && p.number, p.surveyNo && `Sy.No. ${p.surveyNo}`].filter(Boolean).join(', ')],
    ['Door No.', `${prefix}.door`, !isPlot && p.number ? `${p.numberType} ${p.number}` : ''],
    ['T. S. No. / Village', `${prefix}.village`, p.village],
    ['Ward / Taluka', `${prefix}.ward`, p.localBodyName],
    ['Mandal / District', `${prefix}.district`, [p.localBodyType && p.localBodyName ? `${p.localBodyName} ${p.localBodyType}` : '', p.district].filter(Boolean).join(', ')],
  ];
}
const pnbDocs = (c, prefix) => c.docs.map((doc, i) => [documentDescription(doc), `${prefix}.doc${i}`, [doc.number || 'NA', dmy(doc.date), doc.copy || 'Copy'].filter(Boolean).join(' · ')]);
const pnbSide = (c) => (s, actual) => {
  const x = (c.d.boundaries?.sides || {})[s] || {};
  return actual ? x.actual || x.deed : x.deed;
};
const pnbDim = (c) => (s, actual) => {
  const x = (c.d.boundaries?.sides || {})[s] || {};
  return actual ? x.dimActual || x.dimDeed : x.dimDeed;
};
const pnbBoundDim = (c) => (s, actual) => lines(pnbSide(c)(s, actual), pnbDim(c)(s, actual) && `Dimension: ${pnbDim(c)(s, actual)}`);
const pnbLatLon = (c) => (c.p.location?.lat ? `Latitude: ${c.p.location.lat}, Longitude: ${c.p.location.lon}` : '');
const pnbRoads = (c) => {
  const b = c.d.boundaries || {};
  const site = c.d.site || {};
  const roads = Array.isArray(b.roadSides) ? b.roadSides : [];
  return lines(
    b.facing && `${b.facing} facing${roads.length ? ` · Road on ${roads.join(' & ')}` : ''}`,
    Number(b.roadWidthFt) > 0 && `${Number(b.roadWidthFt)} ft wide (${Number(b.roadWidthFt) < 20 ? 'below' : 'above'} 20 ft)`,
    site.roadType, site.roadFacilities,
  );
};
const pnbBrief = (c) => `The Property is ${c.p.description || ''} over ${c.p.numberType || ''} ${c.p.number || ''}, ${[c.p.street, c.p.village, c.p.localBodyName, c.p.district, c.p.pincode].filter(Boolean).join(', ')}.${c.p.landmark ? ` Land Mark ${c.p.landmark}` : ''}`;

// Appendix I — immovable properties (land, buildings)
function PnbIntroPhysical({ c }) {
  const site = c.d.site || {};
  const b = c.d.building || {};
  const B = c.r.building;
  const floorsText = c.kind === 'building' ? lines(
    ...(b.floors || []).map((f, i) => `${floorName(f.floor)}: plinth area ${num(B?.floors?.[i]?.plinthArea)} Sq.ft`),
    b.yearOfConstruction && `Year of construction: ${b.yearOfConstruction}`,
    (b.floors || []).length && "Roof height 11' each floor",
  ) : '';
  return (
    <>
      <PnbSection title="I. INTRODUCTION" prefix="pi" parts={[
        { label: 'Name of Valuer', k: 'pi.valuer', v: FIRM.name },
        { label: 'Dates and title deed', subs: [
          ['Date of inspection', 'pi.insp', c.inspectionDate],
          ['Title Deed Number and Date', 'pi.deed', c.titleDeed !== '—' ? c.titleDeed : ''],
          ['Date of Valuation', 'pi.val', c.valuationDate],
        ] },
        { label: 'Purpose of Valuation', k: 'pi.purpose', v: c.purpose },
        { label: 'Name of Property Owner/s', k: 'pi.owner', v: lines(c.owner, c.ownerRelation, c.ownerAddress, c.ownerPhones) },
        { label: 'Name of Bank/FI as applicable', k: 'pi.bank', v: [c.g.bankName, c.g.branch && `${c.g.branch} Branch`].filter(Boolean).join(', ') },
        { label: 'Whether occupied by the owner / tenant? If occupied by tenant, since how long?', k: 'pi.occ', v: c.d.land?.rentalValue || 'Owner occupied' },
      ]} />
      <PnbSection title="II. PHYSICAL CHARACTERISTICS OF THE ASSET" prefix="pp" parts={[
        { label: 'Location of the property in the city', subs: pnbLocation(c, 'pp.loc') },
        { label: 'City / Town and area', subs: [
          ['City / Town', 'pp.city', c.p.village],
          ['Residential Area / Commercial Area / Industrial Area', 'pp.area', site.classificationLocality],
        ] },
        { label: 'Classification of the area', subs: [
          ['High / Middle / Poor', 'pp.hmp', 'Middle'],
          ['Metro / Urban / Semi Urban / Rural', 'pp.usr', 'Semi Urban'],
        ] },
        { label: 'Coming under Corporation limit / Village Panchayat / Municipality', k: 'pp.localBody', v: c.p.localBodyType },
        { label: 'Postal address of the property', k: 'pp.postal', v: c.propertyAddress },
        { label: 'Latitude, Longitude and Coordinates of the site', k: 'pp.latlon', v: pnbLatLon(c) },
        { label: 'Area of the plot / land', k: 'pp.area2', v: c.r.land ? `${num(c.r.land.siteArea)} Sq. Yds` : '' },
        { label: 'Layout plan of the area in which the property is located', k: 'pp.layout', v: site.approvedLayout },
        { label: 'Development of surrounding areas', k: 'pp.dev', v: site.surroundingDevelopment },
        { label: 'Details of Roads abutting the property', k: 'pp.roads', v: pnbRoads(c) },
        { label: 'Whether covered under any State / Central Govt. enactments (e.g. Urban Land Ceiling Act) or notified under agency area / scheduled area / cantonment area', k: 'pp.enact', v: 'No' },
        { label: 'In case it is an agricultural land, any conversion to house site plots is contemplated', k: 'pp.agri', v: 'No' },
        { label: 'Boundaries of the property', sides: pnbBoundDim(c) },
        { label: 'Extent of the site considered for valuation (least of A & B)', k: 'pp.extent', v: c.r.land ? `${num(c.r.land.siteArea)} Sq. Yds` : '' },
        { label: 'Description of Adjoining properties', subs: SIDES.map((s) => [s[0].toUpperCase() + s.slice(1), `pp.adj.${s}`, pnbSide(c)(s, true)]) },
        { label: 'Survey no. if any', k: 'pp.survey', v: c.p.surveyNo },
        { label: 'Type of Building (Residential / Commercial / Industrial)', k: 'pp.btype', v: c.kind === 'building' ? b.buildingType : '' },
        { label: 'Details of the building / buildings and other improvements (area, height, no. of floors, plinth area floor wise, year of construction)', k: 'pp.bdetails', v: floorsText },
        { label: 'Plinth area, Carpet area and Saleable area', k: 'pp.plinth', v: c.kind === 'building' && B?.plinthTotal ? `Plinth area: ${num(B.plinthTotal, 3)} Sq.ft` : '' },
      ]} />
    </>
  );
}

function PnbAspects({ c }) {
  const site = c.d.site || {};
  const b = c.kind === 'building' ? c.d.building || {} : {};
  const land = c.d.land || {};
  const L = c.r.land;
  const water = bobLines(c, BOB_WATER).map((x) => x.label);
  const drain = bobLines(c, BOB_DRAINAGE).map((x) => x.label);
  return (
    <>
      <PnbSection title="III. TOWN PLANNING PARAMETERS" prefix="pt" parts={[
        { label: 'Master plan provisions related to the property in terms of land use', k: 'pt.master', v: site.permittedUse },
        { label: 'Date of issue and validity of layout of approved map / plan', k: 'pt.date', v: b.layoutApprovalDate },
        { label: 'Approved map / plan issuing authority', k: 'pt.auth', v: b.approvalAuthority },
        { label: 'Whether genuineness or authenticity of approved map / plan is verified', k: 'pt.verified', v: b.approvalVerified },
        { label: 'Any other comments by our empanelled valuers on authenticity of approved plan', k: 'pt.comments', v: b.approvalComments },
        { label: 'Planning area / zone', k: 'pt.zone', v: site.classificationLocality },
        { label: 'Comment on unauthorized constructions if any', k: 'pt.unauth', v: b.approvalDeviations },
      ]} />
      <PnbSection title="IV. LEGAL ASPECTS" prefix="pl" parts={[
        { label: 'Ownership documents', subs: pnbDocs(c, 'pl') },
        { label: 'Names of Owner/s', k: 'pl.owner', v: lines(c.owner, c.ownerRelation) },
        { label: 'Comment on whether the IP is independently accessible?', k: 'pl.access', v: site.landLocked },
        { label: 'Ordinary status of freehold or leasehold including restriction on transfer', k: 'pl.tenure', v: site.landTenure },
        { label: 'Possibility of frequent flooding / sub-merging', k: 'pl.flood', v: site.flooding },
        { label: 'Special remarks, if any, like threat of acquisition of land for public service purposes, road widening or applicability of CRZ provisions etc.', k: 'pl.remarks', v: site.specialRemarks },
        { label: 'Building plan sanction, illegal constructions if any done without plan sanction / violations', k: 'pl.sanction', v: site.drawingApprovalIssue },
      ]} />
      <PnbSection title="V. ECONOMIC ASPECTS" prefix="pe" parts={[
        { label: 'Details of monthly rents being received if any', k: 'pe.rent', v: land.rentalValue },
      ]} />
      <PnbSection title="VI. SOCIO-CULTURAL ASPECTS" prefix="ps" parts={[
        { label: 'Description of the location of property in terms of the social structure of the area', k: 'ps.social', v: site.characterLocality },
      ]} />
      <PnbSection title="VII. FUNCTIONAL AND UTILITARIAN ASPECTS" prefix="pf" parts={[]} />
      <PnbSection title="VIII. INFRASTRUCTURE AVAILABILITY" prefix="pa" parts={[
        { label: 'Aqua infrastructure', subs: [
          ['Water supply', 'pa.water', lines(site.waterPotentiality, water.join(', '))],
          ['Sewerage / sanitation', 'pa.sewer', lines(site.sewerage, drain.join(', '))],
        ] },
        { label: 'Other physical infrastructure', subs: [
          ['Electricity', 'pa.elec', site.powerSupply],
          ['Roads & Public transportation connectivity', 'pa.roads', lines(site.roadType, site.roadFacilities)],
          ['Availability of other public utilities nearby', 'pa.civic', site.civicAmenities],
        ] },
      ]} />
      <PnbSection title="IX. MARKETABILITY" prefix="pm" parts={[
        { label: 'Locational attributes', k: 'pm.loc', v: lines(site.plotPosition, (site.advantages || []).join('; ')) },
        { label: 'Demand and supply of the kind of subject property', k: 'pm.demand', v: land.saleability },
        { label: 'Comparable sale prices in the locality', k: 'pm.sales', v: lines(L?.marketRateRange && `Rs.${num(L.marketRateRange[0], 0)} to Rs.${num(L.marketRateRange[1], 0)} /Sq. Yd`, land.marketReference) },
      ]} />
    </>
  );
}

function PnbEngineering({ c }) {
  const isB = c.kind === 'building';
  const b = isB ? c.d.building || {} : {};
  const B = c.r.building;
  return (
    <>
      <PnbSection title="X. ENGINEERING AND TECHNOLOGY ASPECTS" prefix="px" parts={isB ? [
        { label: 'Type of construction', k: 'px.type', v: b.constructionType },
        { label: 'Materials and technology used', k: 'px.materials', v: b.superStructure },
        { label: 'Specifications', k: 'px.spec', v: 'As per the specifications of construction below' },
        { label: 'Maintenance issues', k: 'px.maint', v: lines(b.maintenanceExterior && `Exterior: ${b.maintenanceExterior}`, b.maintenanceInterior && `Interior: ${b.maintenanceInterior}`) },
        { label: 'Age of the building', k: 'px.age', v: B?.age != null ? `${B.age} years` : '' },
        { label: 'Total life of the building', k: 'px.life', v: B?.life ? `${B.life} years` : '' },
      ] : []}>
        {isB && <BuildingSpecs c={c} />}
        {isB && <BuildingValuationTable c={c} part="plumbing" />}
      </PnbSection>
      <PnbSection title="XI. ENVIRONMENTAL FACTORS" prefix="pn" parts={[]} />
      <PnbSection title="XII. ARCHITECTURAL AND AESTHETIC QUALITY" prefix="pq" parts={isB ? [
        { label: 'Descriptive account of the building (modern / old fashioned, plain / decorative)', k: 'pq.arch', v: lines(b.appearance, b.constructionQuality) },
      ] : []} />
      {/industrial/i.test(c.g.propertyType || '') && <PnbSection title="XIII. IN CASE OF VALUATION OF INDUSTRIAL PROPERTY" prefix="pi2" parts={[]} />}
    </>
  );
}

// Appendix II — flats: General (then our II–VI flat sections, as for Bank of Baroda)
function PnbFlatGeneral({ c }) {
  const f = c.d.flat || {};
  return (
    <PnbSection title="I. GENERAL" prefix="pg" parts={[
      { label: 'Name & address of the Valuer', k: 'pg.valuer', v: lines(FIRM.name, FIRM.address.join(', ')) },
      { label: 'Purpose for which the valuation is made', k: 'pg.purpose', v: c.purpose },
      { label: 'Dates and title deed', subs: [
        ['a) Date of inspection', 'pg.insp', c.inspectionDate],
        ['b) Title Deed Number and Date', 'pg.deed', c.titleDeed !== '—' ? c.titleDeed : ''],
        ['c) Date on which the valuation is made', 'pg.val', c.valuationDate],
      ] },
      { label: 'List of documents produced for perusal', subs: pnbDocs(c, 'pg') },
      { label: 'Name of the owner(s) and his / their address (es) with Phone no.', k: 'pg.owner', v: lines(c.owner, c.ownerRelation, c.ownerAddress, c.ownerPhones) },
      { label: 'Brief description of the property', k: 'pg.brief', v: pnbBrief(c) },
      { label: 'Location of property', subs: pnbLocation(c, 'pg.loc') },
      { label: 'Postal address of the property', k: 'pg.postal', v: c.propertyAddress },
      { label: 'City / Town and area', subs: [['City / Town', 'pg.city', c.p.village], ['Residential / Commercial / Industrial Area', 'pg.area', f.usage]] },
      { label: 'Classification of the area', subs: [['i) High / Middle / Poor', 'pg.hmp', 'Middle'], ['ii) Urban / Semi Urban / Rural', 'pg.usr', 'Semi Urban']] },
      { label: 'Coming under Corporation limit / Village Panchayat / Municipality', k: 'pg.localBody', v: c.p.localBodyType },
      { label: 'Whether covered under any State / Central Govt. enactments (e.g. Urban Land Ceiling Act) or notified under agency area / scheduled area / cantonment area', k: 'pg.enact', v: 'No' },
      { label: 'Boundaries of the property', sides: pnbSide(c) },
      { label: 'Dimensions of the site / flat', sides: pnbDim(c) },
      { label: 'Extent of the site', k: 'pg.extent', v: f.apartmentSiteArea ? `${num(f.apartmentSiteArea)} Sq. Yds` : '' },
      { label: 'Latitude, Longitude & Co-ordinates of flat', k: 'pg.latlon', v: pnbLatLon(c) },
      { label: 'Extent of the site considered for valuation (undivided share of land)', k: 'pg.uds', v: f.uds ? `${num(f.uds)} Sq. Yds` : '' },
      { label: 'Whether occupied by the owner / tenant? If occupied by tenant, since how long?', k: 'pg.occ', v: lines(f.occupancy || 'Owner occupied', f.monthlyRent && `Rent Rs.${num(f.monthlyRent, 0)} per month`) },
    ]} />
  );
}

// Appendix III — agricultural land
function PnbAgri({ c, part }) {
  const site = c.d.site || {};
  const land = c.d.land || {};
  if (part === 1) {
    return (
      <PnbSection title="I. GENERAL" prefix="pg" parts={[
        { label: 'Purpose for which the valuation is made', k: 'pg.purpose', v: c.purpose },
        { label: 'Dates and ownership document', subs: [
          ['a) Date of inspection', 'pg.insp', c.inspectionDate],
          ['b) Number and Date of ownership document', 'pg.deed', c.titleDeed !== '—' ? c.titleDeed : ''],
          ['c) Date on which the valuation is made', 'pg.val', c.valuationDate],
        ] },
        { label: 'List of documents produced for perusal', subs: pnbDocs(c, 'pg') },
        { label: 'Name of the owner(s) and his / their address (es) with Phone no.', k: 'pg.owner', v: lines(c.owner, c.ownerRelation, c.ownerAddress, c.ownerPhones) },
        { label: 'Brief description of the property', k: 'pg.brief', v: pnbBrief(c) },
        { label: 'Location of property', subs: pnbLocation(c, 'pg.loc') },
        { label: 'Postal address of the property', k: 'pg.postal', v: c.propertyAddress },
        { label: 'Coming under Corporation limit / Village Panchayat / Municipality', k: 'pg.localBody', v: c.p.localBodyType },
        { label: 'Whether covered under any State / Central Govt. enactments (e.g. Urban Land Ceiling Act) or notified under agency area / scheduled area / cantonment area', k: 'pg.enact', v: 'No' },
        { label: 'Is any conversion to house site plots contemplated?', k: 'pg.conv', v: 'No' },
        { label: 'Boundaries of the property', sides: pnbSide(c) },
        { label: 'Dimensions of the site', sides: pnbDim(c) },
        { label: 'Extent of the site', k: 'pg.extent', v: lines(land.siteAreaDocument && `As per document: ${num(land.siteAreaDocument)} Sq. Yds`, land.siteAreaActual && `As per actual: ${num(land.siteAreaActual)} Sq. Yds`) },
        { label: 'Latitude, Longitude and Coordinates of the site', k: 'pg.latlon', v: pnbLatLon(c) },
        { label: 'Extent of the site considered for valuation (least of A & B)', k: 'pg.considered', v: c.r.land ? `${num(c.r.land.siteArea)} Sq. Yds` : '' },
        { label: 'Whether occupied by the owner / lessee? If cultivated by lessee, since how long and type of tenancy agreement?', k: 'pg.occ', v: land.rentalValue || 'Owner occupied' },
      ]} />
    );
  }
  return (
    <PnbSection title="II. CHARACTERISTICS OF THE SITE" prefix="pc" parts={[
      { label: 'Whether the land under consideration is suitable for cultivation', k: 'pc.cult', v: site.permittedUse },
      { label: 'Irrigation facilities – canal / well / bore / rain-fed', k: 'pc.irr', v: site.waterPotentiality },
      { label: 'Possibility of frequent flooding / sub-merging', k: 'pc.flood', v: site.flooding },
      { label: 'Level of land with topographical conditions', k: 'pc.level', v: site.landLevel },
      { label: 'Shape of land', k: 'pc.shape', v: site.landShape },
      { label: 'Is it a Land – locked land?', k: 'pc.locked', v: site.landLocked },
      { label: 'Whether the land is situated on a Main / National Highway Road? If not, distance from the Main / Highway Road', k: 'pc.road', v: pnbRoads(c) },
      { label: 'Water supply & electricity facilities', k: 'pc.power', v: site.powerSupply },
      { label: 'Advantage of the site', k: 'pc.adv', v: (site.advantages || []).map((a, i) => `${i + 1}. ${a}`).join('\n') },
      { label: 'Disadvantages of the land', k: 'pc.dis', v: site.disadvantages && site.disadvantages !== 'Nil' ? site.disadvantages : '' },
      { label: 'Special remarks, if any, like threat of acquisition of land for public service purposes, road widening or applicability of CRZ provisions etc.', k: 'pc.remarks', v: lines(site.specialRemarks, site.drawingApprovalIssue) },
      { label: 'Comment on whether the IP is independently accessible?', k: 'pc.access', v: site.roadFacilities },
    ]} />
  );
}

// "The other details are as under" — PNB's value list, from our figures (purchase details are not in the sheet)
function PnbOtherDetails({ c }) {
  const s = c.s;
  const f = c.d.flat || {};
  const guideline = c.kind === 'flat' ? (Number(f.glrRate) && Number(f.uds) ? Number(f.glrRate) * Number(f.uds) : null) : c.r.land?.glrValue;
  const rows = [
    ['Book value of immovable property', 'pnb.book', s.bookValue],
    ['Realizable Value of immovable property', 'pnb.realizable', s.realizableValue],
    ['Distress Sale Value of immovable property', 'pnb.distress', s.distressValue],
    ['Guideline Value (value as per Circle Rates) in the area where the property is situated', 'pnb.guideline', guideline],
  ].filter((x) => Number(x[2]) > 0);
  return (
    <>
      <p>The other details are as under:</p>
      <table className="t grid">
        <tbody>
          {rows.map(([label, k, v], i) => <tr key={k}><td className="c-n">{['i', 'ii', 'iii', 'iv'][i]}.</td><th>{label}</th><td className="r"><F k={k} v={rs(v)} /></td></tr>)}
        </tbody>
      </table>
    </>
  );
}

function pnbSheets(c) {
  const list = [{ id: 'cert', letterhead: true, el: <Certificate c={c} /> }];
  if (c.kind === 'flat') {
    list.push({ id: 'pnbflat1', el: <PnbFlatGeneral c={c} /> });
    list.push({ id: 'flat', el: <BobFlatBuilding c={c} /> });
    list.push({ id: 'flat2', el: <BobFlatValuation c={c} /> });
  } else if (c.agri) {
    list.push({ id: 'pnbagri1', el: <PnbAgri c={c} part={1} /> });
    list.push({ id: 'pnbagri2', el: <PnbAgri c={c} part={2} /> });
    list.push({ id: 'land', el: <LandValuation c={c} /> });
  } else {
    list.push({ id: 'pnb1', el: <PnbIntroPhysical c={c} /> });
    list.push({ id: 'pnb2', el: <PnbAspects c={c} /> });
    list.push({ id: 'pnb3', el: <PnbEngineering c={c} /> });
    list.push({ id: 'land', el: <LandValuation c={c} /> });
    if (c.kind === 'building') {
      list.push({ id: 'bld3', el: <><BuildingValuationTable c={c} part="details" /><TierTable c={c} title="PART C – EXTRA ITEMS" sub="(Value after Depreciation)" keys={EXTRA_KEYS} prefix="ex" /></> });
      list.push({ id: 'amen', el: <><TierTable c={c} title="PART D – AMENITIES" keys={AMENITY_KEYS} prefix="am" /><TierTable c={c} title="PART E – MISCELLANEOUS" keys={MISC_KEYS} prefix="mi" /></> });
      list.push({ id: 'services', el: <Services c={c} /> });
    }
  }
  return [...list, ...tailSheets(c)];
}

// ---------- Bank of Baroda flat (Annexure II-b), from the flat sheet only; rows without data are left out ----------
// a numbered item: [label, key, value] or, with `subs`, a heading followed by its sub-rows
function BobItems({ items, prefix }) {
  const shown = items
    .filter(Boolean)
    .map((it) => (it.subs ? { ...it, subs: it.subs.filter((s) => s[2] !== undefined && s[2] !== null && String(s[2]).trim() !== '') } : it))
    .filter((it) => (it.subs ? it.subs.length : it.v !== undefined && it.v !== null && String(it.v).trim() !== ''));
  return shown.flatMap((it, i) => (it.subs
    ? [
        <tr key={`${prefix}${i}`}><td className="c-n" rowSpan={it.subs.length + 1}>{i + 1}</td><th colSpan={2}>{it.label}</th></tr>,
        ...it.subs.map(([label, k, v]) => <tr key={k}><th className="indent">{label}</th><td><F k={k} v={String(v)} block /></td></tr>),
      ]
    : [<tr key={`${prefix}${i}`}><td className="c-n">{i + 1}</td><th>{it.label}</th><td className={it.bold ? 'b' : ''}><F k={it.k} v={String(it.v)} block /></td></tr>]));
}

function BobFlatBuilding({ c }) {
  const f = c.d.flat || {};
  const p = c.p;
  const yn = (v) => v || '';
  return (
    <>
      <h4>II. APARTMENT BUILDING</h4>
      <table className="t grid">
        <tbody>
          <BobItems prefix="ab" items={[
            c.pnb
              ? { label: 'Name of the Apartment', k: 'fb.nature', v: f.apartmentName || p.description }
              : { label: 'Nature of the Apartment', k: 'fb.nature', v: lines(f.apartmentName, p.description) },
            !c.pnb && { label: 'Location', subs: [
              ['T. S. No.', 'fb.ts', p.surveyNo],
              ['Ward No.', 'fb.ward', p.localBodyName],
              ['Village / Municipality / Corporation', 'fb.village', [p.village, p.localBodyType].filter(Boolean).join(', ')],
              ['Door No., Street or Road (Pin Code)', 'fb.door', [p.number && `${p.numberType || ''} ${p.number}`.trim(), p.street, p.pincode].filter(Boolean).join(', ')],
            ] },
            { label: 'Description of the locality Residential / Commercial / Mixed', k: 'fb.locality', v: f.usage },
            { label: 'Year of Construction', k: 'fb.year', v: f.yearOfConstruction },
            { label: 'Number of Floors', k: 'fb.floors', v: f.totalFloors },
            { label: 'Type of Structure', k: 'fb.structure', v: f.structureType },
            { label: 'Number of Dwelling units in the building', k: 'fb.units', v: f.dwellingUnits },
            { label: 'Quality of Construction', k: 'fb.quality', v: f.constructionQuality },
            { label: 'Appearance of the Building', k: 'fb.appearance', v: f.appearance },
            { label: 'Maintenance of the Building', k: 'fb.maint', v: f.buildingMaintenance },
            { label: 'Facilities Available', subs: [
              ['Lift', 'fb.lift', yn(f.lift)],
              ['Protected Water Supply', 'fb.water', yn(f.protectedWaterSupply)],
              ['Underground Sewerage', 'fb.sewer', yn(f.undergroundSewerage)],
              ['Car Parking - Open / Covered', 'fb.parking', yn(f.carParking)],
              ['Is Compound wall existing?', 'fb.wall', yn(f.compoundWall)],
              ['Is pavement laid around the Building', 'fb.pavement', yn(f.pavement)],
              ['Any other facility', 'fb.other', yn(f.otherFacility)],
            ] },
          ]} />
        </tbody>
      </table>
      <h4>III. FLAT</h4>
      <table className="t grid">
        <tbody>
          <BobItems prefix="fl" items={[
            { label: 'The floor on which the flat is situated', k: 'ff.floor', v: f.floorOfFlat },
            { label: 'Door No. of the flat', k: 'ff.door', v: f.flatNo },
            { label: 'Specifications of the flat', subs: [
              ['Flooring', 'ff.flooring', f.flooring],
              ['Doors', 'ff.doors', f.doors],
              ['Windows', 'ff.windows', f.windows],
              ['Fittings', 'ff.fittings', f.fittings],
              ['Finishing', 'ff.finishing', f.finishing],
            ] },
            { label: 'House Tax', subs: [
              ['Assessment No.', 'ff.taxNo', f.houseTaxAssessmentNo],
              ['Tax paid in the name of', 'ff.taxName', f.taxPaidBy],
              ['Tax amount', 'ff.taxAmt', f.taxAmount ? `Rs.${num(f.taxAmount, 0)}` : ''],
            ] },
            { label: 'Electricity Service Connection no.', subs: [
              ['Service connection no.', 'ff.elecNo', f.electricityServiceNo],
              ['Meter Card is in the name of', 'ff.meter', f.meterCardName],
            ] },
            { label: 'How is the maintenance of the flat?', k: 'ff.maint', v: f.flatMaintenance },
            { label: 'Sale Deed executed in the name of', k: 'ff.deed', v: f.saleDeedName },
            { label: 'What is the undivided area of land as per Sale Deed?', k: 'ff.uds', v: f.uds ? `${num(f.uds)} Sq. Yds` : '' },
            { label: 'What is the plinth area of the flat?', k: 'ff.plinth', v: f.plinthArea ? `${num(f.plinthArea)} Sq. ft` : '' },
            { label: 'What is the Carpet Area of the flat?', k: 'ff.carpet', v: f.carpetArea ? `${num(f.carpetArea)} Sq. ft` : '' },
            { label: 'Is it being used for Residential or Commercial purpose?', k: 'ff.use', v: f.usage },
            { label: 'Is it Owner-occupied or let out?', k: 'ff.occ', v: f.occupancy },
            { label: 'If rented, what is the monthly rent?', k: 'ff.rent', v: f.monthlyRent ? `Rs.${num(f.monthlyRent, 0)}` : '' },
          ]} />
        </tbody>
      </table>
    </>
  );
}

function BobFlatValuation({ c }) {
  const f = c.d.flat || {};
  const R = c.r.flat || {};
  const plinth = Number(f.plinthArea) || 0;
  const landPerSqft = plinth ? (R.landCost || 0) / plinth : 0;
  const extras = (f.extras || []).filter((e) => e.description || Number(e.amount));
  const flatValue = R.underConstruction ? R.stageValue : (R.buildingCost || 0) + (R.landCost || 0);
  return (
    <>
      {f.marketability && (
        <>
          <h4>IV. MARKETABILITY</h4>
          <table className="t grid"><tbody><BobItems prefix="mk" items={[{ label: 'How is the marketability?', k: 'fm.market', v: f.marketability }]} /></tbody></table>
        </>
      )}
      <h4>V. RATE</h4>
      <table className="t grid">
        <tbody>
          <BobItems prefix="rt" items={[
            { label: 'Break - up for the rate', subs: [
              ['i) Building + Services', 'fr.bld', f.buildingRate ? `Rs. ${num(f.buildingRate, 0)} /Sq.ft` : ''],
              ['ii) Land + Others', 'fr.land', f.landRate ? `Rs. ${num(f.landRate, 0)} /Sq.Yd of UDS (Rs. ${num(landPerSqft, 0)} /Sq.ft of plinth area)` : ''],
            ] },
            { label: "Guideline rate obtained from the Registrar's office", k: 'fr.glr', v: f.glrRate ? `Rs. ${num(f.glrRate, 0)} /Sq.Yd` : '' },
          ]} />
        </tbody>
      </table>
      {R.underConstruction ? (
        <>
          <h4>VI. VALUE OF THE FLAT UNDER CONSTRUCTION</h4>
          <table className="t grid">
            <tbody>
              <BobItems prefix="uc" items={[
                { label: 'After 100% completion, final value of the flat', k: 'fu.completion', v: rs(R.completionValue) },
                { label: 'Works completed', k: 'fu.pct', v: f.completionPct ? `${num(f.completionPct)}%` : '' },
                { label: 'As per current stage of work completion, the value of the flat', k: 'fu.stage', v: rs(R.stageValue), bold: true },
              ]} />
            </tbody>
          </table>
        </>
      ) : (
        <>
          <h4>VI. COMPOSITE RATE ADOPTED AFTER DEPRECIATION</h4>
          <table className="t grid">
            <tbody>
              <tr><td className="c-n" rowSpan={6}>a.</td><th colSpan={2}>Depreciated building rate</th></tr>
              <tr><th className="indent">Replacement cost of flat with Services (V (3) i)</th><td><F k="fc.repl" v={`Rs. ${num(f.buildingRate, 0)} /Sq.ft`} /></td></tr>
              <tr><th className="indent">Age of the building</th><td><F k="fc.age" v={R.age != null ? `${R.age} years` : ''} /></td></tr>
              <tr><th className="indent">Life of the building estimated</th><td><F k="fc.life" v={R.life ? `${R.life} years` : ''} /></td></tr>
              <tr><th className="indent">Depreciation percentage assuming the salvage value as 10%</th><td><F k="fc.dep" v={`${num(R.depreciationPct)}%`} /></td></tr>
              <tr><th className="indent">Depreciated rate of the building</th><td><F k="fc.drate" v={`Rs. ${num(R.depreciatedRate, 0)} /Sq.ft`} /></td></tr>
              <tr><td className="c-n" rowSpan={4}>b.</td><th colSpan={2}>Total composite rate arrived for valuation</th></tr>
              <tr><th className="indent">Depreciated building rate VI (a)</th><td><F k="fc.drate2" v={`Rs. ${num(R.depreciatedRate, 0)} /Sq.ft`} /></td></tr>
              <tr><th className="indent">Rate for Land & other V (3) ii</th><td><F k="fc.land" v={`Rs. ${num(landPerSqft, 0)} /Sq.ft`} /></td></tr>
              <tr><th className="indent">Total Composite Rate</th><td className="b"><F k="fc.total" v={`Rs. ${num(R.compositeRate, 0)} /Sq.ft`} /></td></tr>
            </tbody>
          </table>
        </>
      )}
      <h4 className="ctr">Details of Valuation</h4>
      <table className="t list">
        <thead><tr><th>Sr. No.</th><th>Description</th><th>Qty.</th><th>Rate per unit Rs.</th><th>Estimated Value Rs.</th></tr></thead>
        <tbody>
          <tr>
            <td>1</td>
            <td><F k="fd.flat" v={R.underConstruction ? 'As per current stage of work completion the value of the flat' : 'Present value of the flat (incl. car parking, if provided)'} /></td>
            <td><F k="fd.qty" v={plinth ? `${num(plinth)} Sq.ft` : ''} /></td>
            <td><F k="fd.rate" v={R.underConstruction ? '' : num(R.compositeRate, 0)} /></td>
            <td className="r"><F k="fd.value" v={rs(flatValue)} /></td>
          </tr>
          {extras.map((e, i) => (
            <tr key={i}><td>{i + 2}</td><td><F k={`fd.x${i}`} v={e.description || 'Extra item'} /></td><td /><td /><td className="r"><F k={`fd.x${i}.amt`} v={rs(Number(e.amount) || 0)} /></td></tr>
          ))}
          <tr className="total"><td colSpan={4}>Total</td><td className="r"><F k="fd.total" v={rs(flatValue + (R.extras || 0))} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function FlatValuation({ c }) {
  const f = c.d.flat || {};
  const R = c.r.flat;
  return (
    <>
      <h3 className="ctr">PART B - VALUATION OF FLAT ({R.underConstruction ? 'UNDER CONSTRUCTION' : 'COMPOSITE RATE METHOD'})</h3>
      <table className="t grid">
        <tbody>
          <Row n="1" label="Name of the Apartment / Flat No. / Floor" k="fl.name" v={[f.apartmentName, f.flatNo && `Flat ${f.flatNo}`, f.floorOfFlat].filter(Boolean).join(', ')} />
          <Row n="2" label="Plinth area of the flat" k="fl.plinth" v={`${num(f.plinthArea)} Sq.ft`} />
          <Row n="3" label="Carpet area" k="fl.carpet" v={f.carpetArea ? `${num(f.carpetArea)} Sq.ft` : ''} />
          <Row n="4" label="Undivided share of land (UDS)" k="fl.uds" v={`${num(f.uds)} Sq.Yds`} />
          <Row n="5" label="Year of construction / age" k="fl.age" v={R.underConstruction ? 'Under construction' : `${f.yearOfConstruction || ''} / ${R.age ?? ''} years`} />
          <Row n="6" label="Building + services rate (new)" k="fl.brate" v={`Rs. ${num(f.buildingRate, 0)} /Sq.ft`} />
          <Row n="7" label="Land rate for UDS" k="fl.lrate" v={`Rs. ${num(f.landRate, 0)} /Sq.Yd`} />
          {!R.underConstruction && <Row n="8" label={`Depreciated building rate (${R.depreciationPct}% depreciation)`} k="fl.drate" v={`Rs. ${num(R.depreciatedRate, 0)} /Sq.ft`} />}
          {R.underConstruction && <Row n="8" label="Value on completion" k="fl.completion" v={rs(R.completionValue)} />}
          <Row n="9" label="Composite rate" k="fl.composite" v={`Rs. ${num(R.compositeRate, 0)} /Sq.ft`} bold />
          <Row n="10" label="Present value of the flat" k="fl.value" v={rs(R.fairMarketValue)} bold />
        </tbody>
      </table>
    </>
  );
}
