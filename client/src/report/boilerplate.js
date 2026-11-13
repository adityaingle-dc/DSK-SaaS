// Fixed text of the bank report format (transcribed from the approved print format, valuation-print.pdf).
// Every paragraph is rendered through <F>, so the superadmin can still adjust wording per report.

export const FIRM = {
  name: 'Er. Dhondi Sai Krishna',
  qualifications: 'M.Mgmt (IIT Bombay), B.E. Civil, LLB',
  title: 'Approved Valuer & Chartered Engineer',
  registrations: ['A-29665 - Land & Building', 'AM-181753-4 Institute of Engineers (India)'],
  address: ['H.No. 42-881/2/5/402, Kalinga Fort', 'Road No. 4, MJ Colony, Moula Ali', 'Hyderabad - 40'],
  phone: '8333 83 4428',
  email: 'dhondisaikrishna@gmail.com',
  seal: ['DSK', 'A-29665'],
  defaultPlace: 'Armoor',
};

export const FOOTER_NOTE = ['This is a digitally signed report.', 'Physical signature is not required.', 'Authenticity may be verified through e-sign validation'];

export const OPINION_INTRO =
  'Based upon the visual observations and also the particulars provided to me by the owner of the property, detailed valuation report has been furnished here in the following pages';

export const CERTIFICATE_POINTS = (c) => [
  `It is hereby certified that in my opinion`,
  `Number of title deed(s) involved in this property is the relevant document for the subject property in the opinion of this valuer is ${c.titleDeed}`,
  'If this property is offered as collateral security, the concerned financial institution is requested to verify the extent of land shown in this valuation report with respect to the latest legal opinion.',
  'Value varies with the purpose and date of valuation. This report is not to be referred if the purpose is different other than mentioned in I(1).',
  `This property was inspected on ${c.inspectionDate} by in the presence of Manager ${c.bankRef}`,
  'The legal aspects were not considered in this valuation.',
  `This valuation work was / has been undertaken by the valuer based upon the request from ${c.bankRef}`,
];

export const ENCLOSURES = [
  'Key Plan showing the location of the property',
  'Site plan with boundaries',
  'Photograph of owner / representative with property in background',
  'Screen shot of longitude / latitude and co-ordinates of property using GPS/Various apps / Internet sites',
];

export const SRO_REMARKS = [
  'Value varies with the purpose guide line and market value are totally different and they cannot be compare with each other.',
  'Guide line rate is artificial and fixed by non technical person Whereas market value fixed by experienced valuer after making through local enquiries.',
  'The guide line rate is only unit rate of land for which only stamp duties are collected. Whereas the market value is the money the property is fetches sold in open market.',
  'Guide line rate are uniform in a survey number or in one locality irrespective of its location Whereas market value varies its location.',
  'Guide line value may increase or decrease as per the government policy. For example, government of Tamilnadu on June 2017 reduced guide line rate by 33% Whereas market value changes in accordance with the real estate trends.',
  'Guide line rate remains same irrespective of supply and demand. Whereas market value changes in accordance with demand.',
  'Guide line rate may be constant for say for 5 years were as market value may even change on next day.',
  'Guide line rate is same for all properties irrespective of facts whether they are marketable or non marketable.',
  'Guide line rate is the same even of encumbered properties. Whereas market value for such properties will be definitely less.',
  'Guide line rate does not speak about potential values whereas the potential values can be considered for certifying the market values.',
  'In few places market rate can be more than the guide line rate whereas in few places market rate is less than the guide line rate.',
  'Guide line rate is the same for landlocked lands, recess plots, tandem plots, narrow plots, Plots with narrow path ways etc.,. Which shall have less market values.',
];

export const COURT_JUDGEMENTS = [
  'Madras High Court – Sakthi vs. Shree Desigachary dt. 07-04-2006 CRP 3092 OF 1996.',
  'Naganathan vs. Revenue Divisional office, Adilabad A.IR 1983 Supreme Court has clearly given the clarification of SRO value & present market value in Jawaji Naganathan (Adilabad vs REV. DIV Officer (1994) SSC 4 page 595 SC It is clear that the basic valuation register prepared and maintained for the purpose of Collection stamp duty has no statutory base or force It cannot form a foundation to determine the market value mentioned there under in instrument brought for registration Evidence of bonafide sales between willing prudent vendor and vendee of the land acquired or situated near about that land possessing same or similar advantageous features would furnish basis to determine market value.',
  'Collector of Nelagiries vs Mahavir plantations 1982 madras 1381995 (Ii CTC 492 G. Noganatham vs Chenniachettian) Guide line rate and market rate are two different concepts Thansi case-Chennai High court December 2001',
];

export const APPROACH_NOTE = [
  'For Land, I Considered Market Approach. I enquired With Local People / Real Estate Agents / 99 Acres.com Web Sites.',
  'For Building, I Considered Cost Approach by Plinth Area Method, I Calculated Present Value of Building as on Date.',
];

export const DECLARATION_POINTS = (c) => [
  `The information furnished in my valuation report dated ${c.valuationDate} is true and correct to the best of my knowledge and belief and I have made an impartial and true valuation of the property.`,
  'I have no direct or indirect interest in the property valued;',
  `I have personally inspected the property on, ${c.inspectionDate} The work is not sub-contracted to any other valuer and carried out by myself.`,
  'I have not been convicted of any offence and sentenced to a term of imprisonment.',
  'I have not been found guilty of misconduct in my professional capacity.',
  'I have read the Handbook on Policy, Standards and procedure for Real Estate Valuation, 2011 of the IBA and this report is in conformity to the "Standards" enshrined for valuation in the Part-B of the above handbook to the best of my ability.',
  'I have read the International Valuation Standards (IVS) and the report submitted to the Bank for the respective asset class is in conformity to the "Standards" as enshrined for valuation in the IVS in "General Standards" and "Asset Standards" as applicable.',
  'I abide by the Model Code of Conduct for empanelment of valuer in the Bank (Annexure III- A signed copy of same to be taken and kept along with this declaration).',
  'I am registered under Section 34 AB of the Wealth Tax Act, 1957. (Not Applicable)',
  'I am the proprietor / partner / authorized official of the firm / company, who is competent to sign this valuation report.',
  'Further, I hereby provide the following information',
];

export const DECLARATION_TABLE = (c) => [
  ['Background information of the asset being valued', c.background],
  ['Purpose of valuation and appointing authority', `${c.purpose}\n${c.bankRef}`],
  ['Identity of the valuer and any other experts involved in the valuation', 'The valuation has been carried out solely by the undersigned empanelled valuer. No other technical expert has been engaged unless specifically stated.'],
  ['Disclosure of valuer interest or conflict, if any;', 'The above said property is of no interest or conflict to me'],
  ['Date of appointment, valuation date and date of report', `Appointment Date: ${c.appointmentDate}\nValuation Date: ${c.valuationDate}\nDate of Report: ${c.valuationDate}`],
  ['Inspections and/or investigations undertaken', 'Physical inspection of the property was carried out. Measurements were taken on a random/sample basis where accessible. No intrusive or destructive testing was carried out.'],
  ['Nature and sources of the information used or relied upon;', 'The Market Value has been obtained upon the discrete enquiries made in and around the surrounding area regarding the recent transaction prices. However as the transactions were not documented in the Registered Sale Deeds at their actual arms length price and instead were at the Guideline rates, the Supporting Transaction records cannot be submitted as evidence.'],
  ['Procedures adopted in carrying out the valuation and valuation standards followed', c.procedures],
  ['Restrictions on use of the report, if any', 'This report is prepared exclusively for the stated purpose and the use of the appointing Bank. It shall not be used for any other purpose or by any third party without written consent of the valuer.'],
  ['Major factors that were taken into account during the valuation', 'Location, access, land area, building specifications, age, condition, prevailing market rates, legal inputs provided, and demand-supply scenario have been considered.'],
  ['Caveats, limitations and disclaimers to the extent they explain or elucidate the limitations faced by valuer', 'The valuation is subject to limitations of non-verification of title documents, approvals, statutory compliances, soil condition, and hidden defects. These disclosures explain practical limitations faced during valuation and are not intended to limit professional responsibility.'],
];

export const CODE_OF_CONDUCT = [
  ['Integrity and Fairness', [
    'A valuer shall, in the conduct of his/its business, follow high standards of integrity and fairness in all his/its dealings with his/its clients and other valuers.',
    'A valuer shall maintain integrity by being honest, straightforward, and forthright in all professional relationships.',
    'A valuer shall endeavour to ensure that he/it provides true and adequate information and shall not misrepresent any facts or situations.',
    'A valuer shall refrain from being involved in any action that would bring disrepute to the profession.',
    'A valuer shall keep public interest foremost while delivering his services.',
  ]],
  ['Professional Competence and Due Care', [
    'A valuer shall render at all times high standards of service, exercise due diligence, ensure proper care and exercise independent professional judgment.',
    'A valuer shall carry out professional services in accordance with the relevant technical and professional standards that may be specified from time to time.',
    'A valuer shall continuously maintain professional knowledge and skill to provide competent professional service based on up-to-date developments in practice, prevailing regulations/guidelines and techniques.',
    'In the preparation of a valuation report, the valuer shall not disclaim liability for his/its expertise or deny his/its duty of care, except to the extent that the assumptions are based on statements of fact provided by the company or its auditors or consultants or information available in public domain and not generated by the valuer.',
    'A valuer shall not carry out any instruction of the client insofar as they are Incompatible with the requirements of integrity, objectivity and independence.',
    'A valuer shall clearly state to his client the services that he would be competent to provide and the services for which he would be relying on other valuers or professionals or for which the client can have a separate arrangement with other valuers.',
  ]],
  ['Independence and Disclosure of Interest', [
    "A valuer shall act with objectivity in his/its professional dealings by ensuring that his/its decisions are made without the presence of any bias, conflict of interest, coercion, or undue influence of any party, whether directly connected to the valuation assignment or not.",
    'A valuer shall not take up an assignment if he/it or any of his/its relatives or associates is not independent in terms of association to the company.',
    'A valuer shall maintain complete independence in his/its professional relationships and shall conduct the valuation independent of external influences.',
    'A valuer shall wherever necessary disclose to the clients, possible sources of conflicts of duties and interests, while providing unbiased services.',
    'A valuer shall not deal in securities of any subject company after any time when he/it first becomes aware of the possibility of his/its association with the valuation, and in accordance with the Securities and Exchange Board of India (Prohibition of Insider Trading) Regulations, 2015 or till the time the valuation report becomes public, whichever is earlier.',
    "A valuer shall not indulge in 'mandate snatching' or offering 'convenience valuations' in order to cater to a company or client's needs.",
    'As an independent valuer, the valuer shall not charge success fee (Success fees may be defined as a compensation / incentive paid to any third party for successful closure of transaction. In this case, it is approval of credit proposals).',
    'In any fairness opinion or independent expert opinion submitted by a valuer, if there has been a prior engagement in an unconnected transaction, the valuer shall declare the association with the company during the last five years.',
  ]],
  ['Confidentiality', [
    'A valuer shall not use or divulge to other clients or any other party any confidential information about the subject company, which has come to his/its knowledge without proper and specific authority or unless there is a legal or professional right or duty to disclose.',
  ]],
  ['Information Management', [
    'A valuer shall ensure that he/it maintains written contemporaneous records for any decision taken, the reasons for taking the decision, and the information and evidence in support of such decision. This shall be maintained so as to sufficiently enable a reasonable person to take a view on the appropriateness of his/its decisions and actions.',
    'A valuer shall appear, co-operate and be available for inspections and investigations carried out by the authority, any person authorised by the authority, the registered valuers organisation with which he/it is registered or any other statutory regulatory body.',
    "A valuer shall provide all information and records as may be required by the authority, the Tribunal, Appellate Tribunal, the registered valuers' organisation with which he/it is registered, or any other statutory regulatory body.",
    'A valuer while respecting the confidentiality of information acquired during the course of performing professional services shall maintain proper working papers for a period of three years or such longer period as required in its contract for a specific valuation, for production before a regulatory authority or for a peer review. In the event of a pending case before the Tribunal or Appellate Tribunal, the record shall be maintained till the disposal of the case.',
  ]],
  ['Gifts and hospitality:', [
    'A valuer or his/its relative shall not accept gifts or hospitality which undermines or affects his independence as a valuer.',
    'A valuer shall not offer gifts or hospitality or a financial or any other advantage to a public servant or any other person with a view to obtain or retain work for himself/itself, or to obtain or retain an advantage in the conduct of profession for himself/itself.',
  ]],
  ['Remuneration and Costs', [
    'A valuer shall provide services for remuneration which is charged in a transparent manner, is a reasonable reflection of the work necessarily and properly undertaken, and is not inconsistent with the applicable rules.',
    'A valuer shall not accept any fees or charges other than those which are disclosed in a written contract with the person to whom he would be rendering service.',
  ]],
  ['Occupation, employability and restrictions', [
    'A valuer shall refrain from accepting too many assignments, if he/it is unlikely to be able to devote adequate time to each of his/its assignments.',
    'A valuer shall not conduct business which in the opinion of the authority or the registered valuer organisation discredits the profession.',
  ]],
];

export const RELATIVE_NOTE =
  "{Explanation For the purposes of this code the term 'relative' shall have the same meaning as defined in clause (77) of Section 2 of the Companies Act, 2013 (18 of 2013).}";
