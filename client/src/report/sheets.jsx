import { catalog, REPORT_TEMPLATES, personName, personRelation, phones } from '@dsk/shared';
import { F, Words, rs } from './Field.jsx';
import KeyPlanMap from './KeyPlanMap.jsx';
import PhotoGrid from './PhotoGrid.jsx';
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
const lines = (...xs) => xs.filter((x) => x !== undefined && x !== null && String(x).trim() !== '').join('\n');
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
export function Sheet({ n, total, c, children, letterhead = false }) {
  return (
    <section className="sheet">
      {c.v.status !== 'approved' && <div className="watermark">{c.v.status === 'rejected' ? 'REJECTED' : 'DRAFT'}</div>}
      {letterhead && <Letterhead />}
      <div className="sheet-body">{children}</div>
      <footer className="sheet-foot">
        <span className="seal">{FIRM.seal.map((l) => <span key={l}>{l}</span>)}</span>
        <span className="foot-note">{FOOTER_NOTE.map((l) => <span key={l}>{l}</span>)}</span>
        <span className="foot-page">
          <span>{n} of {total}</span>
          <span>{c.v.referenceNo} / {c.s.reportTemplate}</span>
        </span>
      </footer>
    </section>
  );
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
  return (
    <div className="sign">
      <div>
        <div>Place: <F k="sig.place" v={c.place} /></div>
        <div>Date: <F k="sig.date" v={c.valuationDate} /></div>
      </div>
      <div className="sign-right">
        <strong>{title}</strong>
        <div>{label}</div>
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
  if (part === 2) return <BasicData2 c={c} sides={sides} loc={loc} />;
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
              <td><F k={`doc.${i}.desc`} v={[doc.type, doc.detail1, doc.detail2, doc.detail3].filter(Boolean).join(' - ')} /></td>
              <td className="split"><F k={`doc.${i}.no`} v={doc.number || 'NA'} /><span className="sp-r"><F k={`doc.${i}.date`} v={`${dmy(doc.date) || 'NA'} ${doc.copy || 'Copy'}`} /></span></td>
            </tr>
          ))}
          <Row n="4" label="Name of the Owner(s) and his/their address with Phone no." k="a.owner" v={lines(c.owner, c.ownerRelation, c.ownerAddress, c.ownerPhones)} />
          <Row n="5" label="Brief description of the property" k="a.brief" v={`The Property is ${c.p.description || ''} over ${c.p.numberType || ''} ${c.p.number || ''}, ${[c.p.street, c.p.village, c.p.localBodyName, c.p.district, c.p.pincode].filter(Boolean).join(', ')}.${c.p.landmark ? ` Land Mark ${c.p.landmark}` : ''}${c.r.land ? ` with total site area of ${num(c.r.land.siteArea)} Sq.Yds` : ''} Belongs to Applicant : ${c.owner}${c.ownerRelation ? `, ${c.ownerRelation}` : ''}`} />
          <tr><td className="c-n" rowSpan={7}>6</td><th>Location of property</th><td><F k="a.loc" v={c.p.description} /></td></tr>
          <tr><th>a) {c.p.numberType || 'Plot No. / H.No.'}</th><td><F k="a.loc.no" v={c.p.number} /></td></tr>
          <tr><th>b) Name of Nagar / Layout</th><td><F k="a.loc.layout" v="NA" /></td></tr>
          <tr><th>c) S.F. No / T.S. No. / R.S. No.</th><td><F k="a.loc.sy" v={c.p.surveyNo || 'NA'} /></td></tr>
          <tr><th>d) Village / Block</th><td><F k="a.loc.village" v={c.p.village} /></td></tr>
          <tr><th>e) Taluk / Ward</th><td><F k="a.loc.taluk" v={c.p.localBodyName} /></td></tr>
          <tr><th>f) Mandal / District / Municipality</th><td><F k="a.loc.district" v={[c.p.localBodyType && c.p.localBodyName ? `${c.p.localBodyName} ${c.p.localBodyType}` : '', c.p.district].filter(Boolean).join(', ')} /></td></tr>
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
  return (
    <table className="t grid">
      <tbody>
          <Row n="11" label="Whether covered under any State / Central Govt. enactment's (e.g., Urban Land Ceiling Act) or notified under agency area / scheduled area / cantonment area." k="a.enactment" v="No" />
          <Row n="12" label="In case it is an agricultural land, any conversion to house site plots is contemplated" k="a.agri" v="No" />
          <tr className="sub-head"><td className="c-n">13</td><th>Boundaries of the property</th><th className="split"><span>As per the Deed</span><span className="sp-r">As per Actuals</span></th></tr>
          {['north', 'south', 'east', 'west'].map((side) => (
            <tr key={side}>
              <td className="c-n" />
              <th className="cap">{side}</th>
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
  const site = c.d.site || {};
  const rows = catalog.siteCharacteristics.filter((x) => site[x.key]);
  return (
    <>
      <h4>II. CHARACTERSTICS OF THE SITE</h4>
      <table className="t grid two">
        <tbody>
          {rows.map((x, i) => (
            <tr key={x.key}><th>{i + 1} {x.label}</th><td><F k={`site.${x.key}`} v={site[x.key]} block /></td></tr>
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
      <h3 className="u ctr">III. VALUATION</h3>
      <h3 className="ctr">PART A - Valuation of Land</h3>
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
          <Row n="(i)" label="Compound wall/fencing" k="l.cw" v={amt(land.compoundWall)} />
          <Row n="(ii)" label="Gate" k="l.gate" v={amt(land.gate)} />
          <Row n="(iii)" label="Power supply" k="l.power" v={amt(land.powerSupply)} />
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
  const floorsLabel = (b.floors || []).map((f) => f.floor).filter(Boolean).join(' and ');
  return (
    <>
      <h3 className="ctr">PART B - Valuation of Building</h3>
      <h4>1 Technical details of the building</h4>
      <table className="t grid two">
        <tbody>
          <Row label="a) Type of Building" k="bt.type" v={b.buildingType} />
          <Row label="b) Type of construction" k="bt.construction" v={b.constructionType} />
          <Row label="Quality of construction" k="bt.quality" v={b.constructionQuality} />
          <Row label="Appearance of Building" k="bt.appearance" v={b.appearance} />
          <Row label="c) Year of Construction" k="bt.year" v={b.yearOfConstruction} />
          <Row label="Age of Building" k="bt.age" v={B.age} />
          <Row label="Expected future life of building" k="bt.future" v={B.age == null ? '' : Math.max(B.life - B.age, 0)} />
          <Row label="Total life of Building" k="bt.life" v={B.life} />
          <Row label="d) Number of floors and height of each floor including basement, if any" k="bt.floors" v={`${floorsLabel ? `${floorsLabel} Floor Building` : ''}, Roof Height = 11' each floor`} />
        </tbody>
      </table>
      <h4>e) Plinth Area <small>As per IS 3861-1975</small></h4>
      <table className="t list">
        <thead><tr><th>Floor</th><th>Year of Construction</th><th>Roof of</th><th>Main Portion A</th><th>Cantilevered Portion B</th><th>Total A+50%B</th></tr></thead>
        <tbody>
          {(b.floors || []).map((f, i) => (
            <tr key={i}>
              <td><F k={`pl.${i}.floor`} v={`${f.floor || ''} Floor`} /></td>
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
      <div className="note"><F k="bt.method" v="Value of building is estimated by adopting suitable unit plinth area rate depending upon the specifications. Depreciation is calculated by straight-line method assuming a salvage value of 10%" block /></div>
    </>
  );
}

function BuildingSpecs({ c }) {
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
    ['Drainage', 'spec.drain', 'NA'],
  ];
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
          <tr><td className="c-n" rowSpan={4}>2</td><th>Compound Wall (R.ft)</th><td><F k="cw.amount" v={c.d.land?.compoundWall ? rs(c.d.land.compoundWall) : ''} /></td></tr>
          <tr><th>Height</th><td><F k="cw.height" v={"4'6\""} /></td></tr>
          <tr><th>Length</th><td><F k="cw.length" v="" /></td></tr>
          <tr><th>Type of construction</th><td><F k="cw.type" v="Brick Masonary with Cement Motor plaster" /></td></tr>
        </tbody>
      </table>
      <table className="t grid">
        <tbody>
          <tr><td className="c-n" rowSpan={8}>3</td><th>Electrical Installation</th><td /></tr>
          {elec.map(([label, key]) => <tr key={key}><th>{label}</th><td><F k={`el.${key}`} v={b[key]} block /></td></tr>)}
          <tr><th>Total Lumsum @ {ePct}% of Civil Works (Part C)</th><td className="r b"><F k="el.total" v={rs(B.services.electricalLumpsum)} /></td></tr>
        </tbody>
      </table>
    </>
  );
}

function BuildingValuationTable({ c }) {
  const b = c.d.building || {};
  const B = c.r.building;
  const pPct = Number(b.plumbingLumpsumPct || 5);
  return (
    <>
      <table className="t grid">
        <tbody>
          <tr><td className="c-n" rowSpan={8}>4</td><th>Plumbing Installation</th><td /></tr>
          <tr><th>a) No. of water closets and their type</th><td><F k="pb.closets" v={[b.closets, b.closetType].filter(Boolean).join(' – ') || 'Attached full bathroom & toilets'} /></td></tr>
          <tr><th>b) No. of wash basins</th><td><F k="pb.basins" v={b.washBasins ?? 'Available'} /></td></tr>
          <tr><th>c) No. of urinals</th><td><F k="pb.urinals" v="NA" /></td></tr>
          <tr><th>d) No. of bath tubs</th><td><F k="pb.tubs" v="NA" /></td></tr>
          <tr><th>e) Water meters, taps etc.</th><td><F k="pb.taps" v="NA" /></td></tr>
          <tr><th>f) Any other fixtures</th><td><F k="pb.other" v={b.otherFixtures} /></td></tr>
          <tr><th>Total Lumsum @ {pPct}% of Civil Works (Part C)</th><td className="r b"><F k="pb.total" v={rs(B.services.plumbingLumpsum)} /></td></tr>
        </tbody>
      </table>
      <h4 className="ctr">Details of Valuation</h4>
      <table className="t list">
        <thead><tr><th>Particulars of item</th><th>Plinth Area</th><th>Estimated replacement rate of construction Rs./Sq.ft</th><th>Age of Building</th><th>Replacement cost Rs.</th><th>Net Value after depreciations Rs.</th></tr></thead>
        <tbody>
          {B.floors.map((f, i) => [
            <tr key={`f${i}`}>
              <td><F k={`dv.${i}.label`} v={`${f.floor || ''} floor (Roof Height 11')`} /></td>
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
      </table>
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
                <td className="r"><F k={`${prefix}.${x.key}`} v={l ? `${l.qty ? `${num(l.qty)}  Rs.${num(l.rate, 0)} /${l.unit}  ` : ''}${rs(l.amount)}` : ''} /></td>
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

function Abstract({ c }) {
  const { r, s } = c;
  const group = (keys) => keys.reduce((sum, k) => sum + (c.amenityLines[k]?.amount || 0), 0);
  const rows = [['A', 'Land', r.land?.glrValue, r.land?.fairMarketValue]];
  if (c.kind === 'building') {
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
      <h3 className="ctr">PART F - ABSTRACT VALUE</h3>
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
          <tr className="total"><td colSpan={3}>Present market value (F)</td><td className="r"><F k="ab.pmv" v={rs(s.fairMarketValue)} /></td></tr>
        </tbody>
      </table>
      <h4>ANY OTHER DETAILS:</h4>
      <div className="note"><F k="ab.otherDetails" v={lines('(Valuation: Here the approved valuer should discuss in detail his approach to valuation of property and Indicate how the value has been arrived at, supported by necessary calculations. Also such aspects as i) Saleability ii) likely rental values in future and iii) any likely income it may generate may be discussed).', c.d.land?.saleability && `Saleability: ${c.d.land.saleability}`, c.d.land?.rentalValue && `Likely rental value: ${c.d.land.rentalValue}`)} block /></div>
      <p>As a result of my appraisal and analysis it is my considered opinion that the present fair market value of the above property in the prevailing condition with aforesaid specifications as of {c.valuationDate} is</p>
      <ValueLines c={c} prefix="ab.final" />
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
        <div className="sign-right"><strong>Signature</strong><div>Name of the Branch Manager</div><div>with Office Seal</div></div>
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
      {loc ? <KeyPlanMap lat={loc.lat} lon={loc.lon} /> : <div className="placeholder">GPS location not captured in the input sheet.</div>}
    </>
  );
}

function Photos({ c }) {
  const images = c.docs.flatMap((d) => (d.files || []).filter((f) => f.type?.startsWith('image/') && !/hei[cf]/.test(f.type)));
  return (
    <>
      <h3 className="ctr">Site Photos (Page 1)</h3>
      {images.length ? <PhotoGrid files={images} /> : <div className="placeholder">No site photos uploaded.<small>Attach photos in the input sheet (Documents produced → Scans / photos).</small></div>}
    </>
  );
}


// Ordered list of sheets for this valuation (mirrors the 17–19 page bank format)
export function sheetsFor(c) {
  const list = [
    { id: 'cert', letterhead: true, el: <Certificate c={c} /> },
    { id: 'basic1', el: <BasicData c={c} part={1} /> },
    { id: 'basic2', el: <><BasicData c={c} part={2} />{c.kind !== 'flat' && <SiteCharacteristics c={c} />}</> },
  ];
  if (c.kind !== 'flat') list.push({ id: 'land', el: <LandValuation c={c} /> });
  if (c.kind === 'building') {
    list.push({ id: 'bld1', el: <BuildingTech c={c} /> });
    list.push({ id: 'bld2', el: <BuildingSpecs c={c} /> });
    list.push({ id: 'bld3', el: <><BuildingValuationTable c={c} /><TierTable c={c} title="PART C – EXTRA ITEMS" sub="(Value after Depreciation)" keys={EXTRA_KEYS} prefix="ex" /></> });
    list.push({ id: 'amen', el: <><TierTable c={c} title="PART D – AMENITIES" keys={AMENITY_KEYS} prefix="am" /><TierTable c={c} title="PART E – MISCELLANEOUS" keys={MISC_KEYS} prefix="mi" /></> });
    list.push({ id: 'services', el: <Services c={c} /> });
  }
  if (c.kind === 'flat') list.push({ id: 'flat', el: <FlatValuation c={c} /> });
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
    { id: 'photos', el: <Photos c={c} /> }
  );
  return list;
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
