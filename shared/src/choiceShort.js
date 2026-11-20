// Short wording for the input sheet's choices, so each question can be answered with one tap.
// The full sentence is still what is stored and printed in the report; the form only shows these short names
// (and the full sentence of the picked option, so the evaluator sees what will go in the report).

// question key → short question
export const SHORT_QUESTIONS = {
  // site characteristics
  characterLocality: 'Type of locality',
  classificationLocality: 'Zone (master plan)',
  surroundingDevelopment: 'Surrounding development',
  flooding: 'Flooding risk',
  civicAmenities: 'Schools, hospital, bus stop, market',
  landLevel: 'Land level',
  landShape: 'Plot shape',
  permittedUse: 'Can be used for',
  usageRestriction: 'Usage restriction',
  landTenure: 'Tenure of land',
  approvedLayout: 'In an approved layout?',
  drawingApprovalIssue: 'Problem getting drawing approval later?',
  plotPosition: 'Corner or intermittent plot?',
  roadFacilities: 'Road facilities',
  roadType: 'Type of road',
  roadWidth: 'Road width',
  landLocked: 'Land-locked?',
  waterPotentiality: 'Water source',
  sewerage: 'Sewerage',
  powerSupply: 'Power supply',
  // building characteristics
  buildingType: 'Type of building',
  constructionType: 'Type of construction',
  constructionQuality: 'Quality of construction',
  appearance: 'Appearance',
  maintenanceExterior: 'Condition – exterior',
  maintenanceInterior: 'Condition – interior',
  // building approval
  layoutApprovalDate: 'Plan approval date & validity',
  approvalAuthority: 'Plan approved by',
  approvalVerified: 'Plan verified as genuine?',
  approvalComments: "Valuer's comment on the plan",
  approvalDeviations: 'Deviations from the plan',
  // specifications
  floorFinish: 'Flooring',
  superStructure: 'Walls (super structure)',
  roof: 'Roof',
  joinery: 'Doors & windows',
  weatheringCourse: 'Weathering course',
  rccWorks: 'RCC works',
  // electrical
  wiring: 'Wiring',
  fittingsClass: 'Class of fittings',
  lightPoints: 'Light points',
  fanPoints: 'Fan points',
  sparePlugPoints: 'Spare plug points',
  otherProvisions: 'Other electrical items',
  // flat
  buildingMaintenance: 'Maintenance of the building',
  lift: 'Lift',
  protectedWaterSupply: 'Protected water supply',
  undergroundSewerage: 'Underground sewerage',
  carParking: 'Car parking',
  compoundWall: 'Compound wall?',
  pavement: 'Pavement around the building?',
  otherFacility: 'Any other facility',
  flooring: 'Flooring',
  doors: 'Doors',
  windows: 'Windows',
  fittings: 'Fittings',
  finishing: 'Finishing',
  flatMaintenance: 'Maintenance of the flat',
  occupancy: 'Owner-occupied or let out?',
};

// full option sentence → short name (options that are already short are not listed)
export const SHORT_OPTIONS = {
  // type of locality
  'Predominantly residential locality with moderate population density.': 'Residential',
  'Mixed-use locality with residential and small commercial establishments.': 'Mixed use',
  'Prime commercial area with active retail and office spaces.': 'Prime commercial',
  'Semi-urban locality with developing infrastructure and scattered habitation.': 'Semi-urban',
  'Rural/agricultural setting with low development and open surroundings.': 'Rural / agricultural',
  // zone
  'Residential Zone as per Master Plan': 'Residential zone',
  'Mixed residential cum commercial Zone': 'Resi + commercial',
  'Industrial Classification with few residential dwellings nearby': 'Industrial',
  'falls under semi-urban/peri-urban category': 'Semi / peri-urban',
  // surrounding development
  'Surrounding area is well developed with paved roads, houses, and shops.': 'Well developed',
  'Moderately developed area with upcoming residential layouts.': 'Moderately developed',
  'Developing area with few built-up properties and open plots.': 'Developing',
  'Underdeveloped area with limited civic infrastructure': 'Underdeveloped',
  // flooding
  'No history of flooding; land level is higher than adjoining road.': 'No flooding',
  'Minor waterlogging during heavy rains, otherwise safe.': 'Minor waterlogging',
  'Low-lying area prone to temporary stagnation during monsoon': 'Stagnates in monsoon',
  'Located in flood-prone zone; precaution required during heavy rainfall.': 'Flood-prone',
  // civic amenities
  'All major civic amenities are available within 1 km radius.': 'All within 1 km',
  'Schools and shops nearby; hospital and market within moderate distance.': 'Most nearby',
  'Basic amenities available; higher-order facilities at 2–3 km distance.': 'Basic; rest 2–3 km',
  'Limited civic amenities; accessibility depends on private transport.': 'Limited',
  // land level
  'Land is level and matches surrounding ground.': 'Level',
  'Gently sloping terrain with proper drainage.': 'Gentle slope',
  'Slightly elevated land providing good drainage.': 'Slightly raised',
  'Low-lying land requiring filling to match road level.': 'Low-lying',
  // plot shape
  'Regular rectangular plot.': 'Rectangular',
  'Square-shaped plot suitable for efficient development.': 'Square',
  'Irregular shape but usable without much constraint.': 'Irregular, usable',
  'Triangular/narrow plot with some planning limitations.': 'Triangular / narrow',
  // permitted use
  'Suitable for residential construction.': 'Residential',
  'Suitable for residential-cum-commercial use.': 'Resi + commercial',
  'Suitable for industrial/warehouse use.': 'Industrial / warehouse',
  'Suitable for institutional or office building purpose.': 'Institutional / office',
  // usage restriction
  'No known usage restriction as per local authority.': 'None',
  'Subject to residential use only.': 'Residential only',
  'Use restricted as per layout or development control rules.': 'As per layout rules',
  'Within agricultural zone — conversion required for non-agricultural use.': 'Agri zone (NA needed)',
  // approved layout
  'Yes, within approved layout as per local authority.': 'Yes, approved',
  'Not in approved layout but falls in LRS Regularized Area': 'LRS regularised',
  'Unapproved layout; independent site outside planning area': 'Not approved',
  // plot position
  'Intermittent plot with single road frontage.': 'Intermittent',
  'Corner plot with two-side road frontage.': 'Corner',
  'End plot of a road with one open side.': 'End plot',
  'Interior plot with access via internal road.': 'Interior',
  // road facilities
  'Public Road': 'Public road',
  'Private Road': 'Private road',
  'Good road connectivity with public transport access.': 'Good, with bus access',
  'Moderate road width and connectivity.': 'Moderate',
  'Limited road access with narrow approach.': 'Narrow approach',
  // type of road
  'WBM Road': 'WBM', 'CC Road': 'CC', 'BT Road': 'BT', 'Kacha Road': 'Kacha', 'Internal Road': 'Internal',
  // road width
  "Above 20' Wide": 'Above 20 ft',
  'Below 20 Ft Wide': 'Below 20 ft',
  // land-locked
  'No, plot has direct road access.': 'No, direct road',
  'Access available through internal layout road.': 'Via layout road',
  'Indirect access through private pathway / right of way.': 'Via private path',
  'Yes, land-locked without proper approach.': 'Yes, land-locked',
  // water
  'Borewell / open well source available.': 'Borewell / well',
  'Municipal water supply available.': 'Municipal',
  'Both municipal and borewell water sources available': 'Municipal + borewell',
  'No assured water source; to be arranged independently.': 'None assured',
  // sewerage
  'Septic tank system in use; no underground network.': 'Septic tank',
  'Drainage under development by local authority': 'Being laid',
  'Underground drainage system available': 'Underground drainage',
  'No formal drainage; open stormwater drains present.': 'Open drains only',
  // power
  'Power supply available through local electricity board.': 'Available',
  'Power poles in vicinity; connection to be obtained.': 'Poles nearby',
  'No power supply network presently available.': 'Not available',

  // type of building
  'Independent residential house (single-family dwelling)': 'Independent house',
  'Commercial building / shop / office premises': 'Commercial / shop',
  'Apartment / Flat in a multi-storied residential complex': 'Apartment / flat',
  'Industrial / warehouse / factory structure': 'Industrial / warehouse',
  'Mixed-use building (residential with commercial portion': 'Mixed use',
  // type of construction
  'RCC framed structure with brick walls and reinforced concrete roof.': 'RCC framed',
  'Load-bearing structure with brick walls and RCC / slab roofing.': 'Load-bearing',
  'Semi-pucca structure with brick walls and tiled / ACC sheet roof.': 'Semi-pucca',
  'Temporary structure with tin / asbestos roofing and light foundations.': 'Temporary',
  'Steel / pre-engineered industrial shed with sheet roofing.': 'Steel shed',
  // quality
  'Good quality construction with superior materials and workmanship': 'Good',
  'Average quality construction using standard materials': 'Average',
  'Fair quality construction with moderate finishing': 'Fair',
  'Poor quality construction with basic materials and limited finish.': 'Poor',
  'Superior quality with high-end specifications and architectural detailing': 'Superior',
  // appearance
  'Appears neat, well-designed, and aesthetically pleasing.': 'Neat, well designed',
  'Functional and presentable appearance suitable for the locality.': 'Presentable',
  'Moderately appealing, showing minor signs of age or wear.': 'Some wear',
  'Dull / outdated appearance requiring renovation.': 'Needs renovation',
  'Modern elevation with good architectural finish.': 'Modern elevation',
  // maintenance (exterior / interior)
  'Well maintained; in good habitable condition': 'Well maintained',
  'Fairly maintained; minor repairs required': 'Minor repairs needed',
  'Poorly maintained; shows signs of neglect and deterioration': 'Poorly maintained',
  'Recently constructed and in excellent condition': 'New, excellent',
  'Old structure but maintained satisfactorily.': 'Old but maintained',

  // plan approval date
  'As per copy provided by the applicant, layout approval was issued on [insert date]; validity period not mentioned in the plan.': 'Dated, no validity',
  'Approval dated [insert date] valid as per norms of the concerned authority.': 'Dated and valid',
  'Copy of layout approval not furnished; hence validity could not be verified.': 'Copy not given',
  'Layout plan approval not applicable, as the property falls under old developed area without layout sanction requirement.': 'Not needed (old area)',
  // approved by
  'As per copy produced, approval is issued by Municipal Corporation / Town Planning Department / Gram Panchayat / DTCP, etc.': 'Local authority',
  'No approval document was provided for verification.': 'No document given',
  'The plan appears to have been sanctioned by the local authority based on markings and signatures seen on the plan copy.': 'Appears sanctioned',
  'Layout plan submitted is an unapproved sketch and not authenticated by any statutory authority.': 'Unapproved sketch',
  // verified
  'Verified based on the stamped/signed copy furnished by the client.': 'Yes, from signed copy',
  'Physical verification of genuineness with the issuing authority has not been carried out — authenticity assumed based on documents provided.': 'Not verified at office',
  'Could not be verified with the authority due to non-availability of online or official verification mechanism': 'Could not be verified',
  'Document appears genuine in format and content, but no independent cross-verification was possible.': 'Looks genuine',
  // valuer's comment
  'Approval document appears in order and consistent with the property layout observed at site.': 'In order, matches site',
  'The approval plan bears official stamps but genuineness could not be independently confirmed.': 'Stamped, not confirmed',
  'Plan copy does not bear clear reference number or sanction details; hence authenticity could not be confirmed.': 'No reference number',
  'The property layout and construction appear broadly in line with the plan submitted.': 'Broadly matches plan',
  // deviations
  'Building appears to have been constructed as per approved plan; no major deviation noticed.': 'None major',
  'Minor deviations in setbacks and internal room arrangement observed, not materially affecting overall conformity.': 'Minor deviations',
  'Construction differs from approved plan (additional floor/extension); may attract regularization as per local rules.': 'Extra floor/extension',
  'No approval documents available; hence conformity could not be verified. Property may be treated as non-approved construction for valuation.': 'No approval documents',
  'Deviation, if any, is beyond valuer’s scope of measurement verification; authenticity assumed based on visual observation.': 'Visual check only',

  // flooring
  'Vitrified tiles flooring in all rooms; anti-skid ceramic tiles in toilets and balconies.': 'Vitrified tiles',
  'Marble flooring in main areas; ceramic tiles in kitchen and toilets.': 'Marble',
  'Polished Kota stone flooring with cement skirting.': 'Kota stone',
  'Cement concrete flooring finished with red oxide / IPS flooring.': 'Cement / IPS',
  'Granite flooring in living area, vitrified in bedrooms, and ceramic in service areas.': 'Granite + vitrified',
  // walls
  'Brick masonry walls in cement mortar (1:6) for superstructure. 9" Thick for External and 4" Thick for Internal Walls': 'Brick, 9" / 4"',
  'Solid concrete block masonry for external and internal walls.': 'Concrete blocks',
  'Burnt clay brick masonry with RCC framed structure.': 'Burnt clay brick',
  'Laterite / red brick masonry plastered with cement mortar both sides.': 'Laterite / red brick',
  // roof
  'Reinforced Cement Concrete (RCC) flat roof with weathering course.': 'RCC flat roof',
  'RCC slab roof finished with water-proofing treatment.': 'RCC, waterproofed',
  'Sloped roof with Mangalore tile covering on steel / RCC truss.': 'Mangalore tiles',
  'RCC slab roof covered with terrace tiles.': 'RCC, terrace tiles',
  // doors & windows
  'Main Door: Teak wood frame and shutter, polished finish.\nInternal Doors: Sal wood / local hardwood frames with flush shutters.\nWindows: UPVC / Aluminium sliding windows with glass panels.\nFittings: Standard brass / SS fittings.': 'Teak + UPVC/Al windows',
  'Doors: Wooden frames with laminated flush shutters.\nWindows: Steel casement type with glazing and MS grill protection.\nTimber: Teak / country wood used for frames.': 'Flush + steel windows',
  'Doors: Teak frame for main door, others with commercial wood frame and flush shutters.\nWindows: Aluminium sliding with tinted glass.': 'Teak + Al sliding',
  // weathering course
  'PCC laid over roof slab with water-proof coating.': 'PCC + coating',
  'Brick bat coba with lime mortar and tile finish for weather proofing.': 'Brick bat coba',
  'Brick jelly lime concrete with pressed tile finish.': 'Brick jelly lime',
  'Thermoplastic / chemical waterproofing membrane laid over RCC roof.': 'Waterproof membrane',
  // RCC works
  'RCC works carried out with M20 grade concrete using tor steel reinforcement as per structural design.': 'M20, as per design',
  'RCC framed structure with columns, beams and slabs of adequate section as per standards.': 'Adequate sections',
  'Reinforced cement concrete using nominal mix with proper curing and workmanship.': 'Nominal mix',
  'RCC structure observed in good condition with no visible cracks or distress.': 'Good, no cracks',

  // electrical
  'Concealed PVC wiring in rigid conduit': 'Concealed',
  'Surface wiring in casing capping': 'Casing capping',
  'Open wiring with wooden battens': 'Open',
  'Superior – Modular switches (Anchor, Havells, GM, etc.) with concealed boxes': 'Superior',
  'Ordinary – Piano type switches and basic ceiling fittings': 'Ordinary',
  'Poor – Mixed or outdated fittings, temporary wiring, exposed joints': 'Poor',
  'Moderate – 1 per 80–100 sq.ft.': 'Moderate',
  'Sufficient – 1 per 60–80 sq.ft.': 'Sufficient',
  'Extensive – decorative lighting / false ceiling LED system': 'Extensive',
  'One per habitable room': 'One per room',
  'One per room + additional in living/dining': 'Plus living / dining',
  'Ceiling fans with regulators in each major room': 'Each major room',
  'Limited – Only one per room': 'Limited',
  'Adequate – Two per room including kitchen & toilet': 'Adequate',
  'Exhaust fans / Geyser points in kitchen & toilets': 'Exhaust / geyser',
  'A/C points in bedrooms and halls': 'A/C points',
  'Inverter wiring / Solar power provision / UPS backup': 'Inverter / solar / UPS',
  'Provisions for A/C and inverter connection available': 'A/C + inverter',

  // flat
  'Teak Wood Framed, Teak Wood Panel Door': 'Teak panel doors',
  'Teak Wood Framed - Main Door, Inside Flush Doors': 'Teak main + flush',
  'Granite Framed - Flush Doors': 'Granite frame, flush',
  'Teak Wood Framed - Teak wood - Glass Shutters': 'Teak, glass shutters',
  'Fittings of Superior Quality': 'Superior',
  'Fittings of Normal Quality': 'Normal',
};

// dropdown lists shown as buttons: clearer names for the stored value
export const LIST_LABELS = {
  // short and clean, as written in the report (the label of the next field says what to enter)
  salutation: { 'Sri.': 'Sri.', 'Smt.': 'Smt.', 'Miss.': 'Miss', 'M/s.': 'M/s.' },
  relation: { 'S/o.': 'S/o', 'W/o': 'W/o', 'D/o.': 'D/o', 'Rep. By': 'Rep. by' },
  propertyType: {
    'Vacant Land - Residential': 'Vacant land',
    'Existing Building - Residential and Commercial': 'Building – mixed use',
    'Existing Building - Residential': 'Building – residential',
    'Residential Flat': 'Flat',
    'Agri Land': 'Agri land',
    'Residential Villa': 'Villa',
    'Industrial Shed': 'Industrial shed',
  },
};

// purpose of valuation: short names and short group titles (the report prints the full purpose)
export const PURPOSE_SHORT = {
  'For Bank Loan / Mortgage Purpose': 'Bank loan / mortgage',
  'For Collateral Security': 'Collateral security',
  'For Project Finance / Term Loan Appraisal': 'Project / term loan',
  'For NPA / SARFAESI Action': 'NPA / SARFAESI',
  'For Revaluation / Review of Security': 'Revaluation of security',
  'For Takeover / Balance Transfer': 'Takeover / BT',
  'For Purchase / Sale Decision': 'Purchase / sale',
  'For Insurance Purpose': 'Insurance',
  'For Capital Gains / Income Tax': 'Capital gains / IT',
  'For Wealth Tax Declaration': 'Wealth tax',
  'For Family Partition / Settlement': 'Family partition',
  'For Inheritance / Succession': 'Inheritance',
  'For Gift / Transfer of Property': 'Gift / transfer',
  'For Court / Arbitration Cases': 'Court / arbitration',
  'For Government Acquisition / Compensation': 'Govt acquisition',
  'For Audit / Accounting Purpose': 'Audit / accounts',
  'For Amalgamation / Merger': 'Merger',
  'For Lease / Rent Fixation': 'Lease / rent',
  'For Mortgage Redemption': 'Mortgage redemption',
  'For Project Viability / Feasibility': 'Project feasibility',
  'For Construction Finance Monitoring': 'Construction finance',
  'For Builder / Developer Inventory': 'Builder inventory',
  'For Redevelopment Proposal': 'Redevelopment',
  'For Partnership Dissolution': 'Partnership dissolution',
  'For Collateral Top-up / Margin Recheck': 'Collateral top-up',
  'For Internal Records / Asset Management': 'Internal records',
};
export const PURPOSE_GROUP_SHORT = {
  'Banking / Financial Institutions': 'Bank / finance',
  'Individual / Private Purposes': 'Personal',
  'Institutional / Legal / Statutory': 'Legal / statutory',
  'Development / Project Related': 'Development',
  'Miscellaneous': 'Others',
};
