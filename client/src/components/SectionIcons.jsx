// Two-tone icons for the valuation form sections: a soft filled shape (.duo) under a crisp outline.
// Colour comes from currentColor, so the same icon works on white and on the solid blue tiles.
export const Duo = ({ size = 18, children }) => (
  <svg className="duo-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ICONS = {
  // Valuation & bank details
  general: (
    <>
      <path className="duo" d="M3 9.5 12 4l9 5.5z" />
      <path d="M3 9.5 12 4l9 5.5z" />
      <path d="M5.5 12v5.5M10 12v5.5M14 12v5.5M18.5 12v5.5M3 20.5h18" />
    </>
  ),
  // Applicant / owner
  applicant: (
    <>
      <circle className="duo" cx="12" cy="8" r="4" />
      <path className="duo" d="M4 21a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  // Intending vendor
  vendor: (
    <>
      <circle className="duo" cx="9" cy="8" r="3.5" />
      <path className="duo" d="M2.5 20a6.5 6.5 0 0 1 13 0z" />
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  // Property location
  property: (
    <>
      <path className="duo" d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  // Boundaries & dimensions
  boundaries: (
    <>
      <path className="duo" d="M5 5h14v14H5z" />
      <path d="M5 5h14v14H5z" />
      <circle cx="5" cy="5" r="2" fill="currentColor" />
      <circle cx="19" cy="5" r="2" fill="currentColor" />
      <circle cx="19" cy="19" r="2" fill="currentColor" />
      <circle cx="5" cy="19" r="2" fill="currentColor" />
    </>
  ),
  // Documents produced
  documents: (
    <>
      <path className="duo" d="M9 3h6l4 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9 3h6l4 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M15 3v4h4M10 11.5h5M10 14.5h3.5M4 7.5V19a2 2 0 0 0 2 2h8.5" />
    </>
  ),
  // Land valuation
  land: (
    <>
      <path className="duo" d="M9 3.5 15 6.5v14l-6-3z" />
      <path d="m3 6.5 6-3 6 3 6-3v14l-6 3-6-3-6 3z" />
      <path d="M9 3.5v14M15 6.5v14" />
    </>
  ),
  // Site characteristics
  site: (
    <>
      <path className="duo" d="M12 3 6.5 11h3L6 16.5h12L14.5 11h3z" />
      <path d="M12 3 6.5 11h3L6 16.5h12L14.5 11h3zM12 16.5V21" />
    </>
  ),
  // Building valuation
  building: (
    <>
      <path className="duo" d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16z" />
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18" />
    </>
  ),
  // Building characteristics & specifications
  buildingDetails: (
    <>
      <path className="duo" d="m12 3.5 9 5-9 5-9-5z" />
      <path d="m12 3.5 9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5" />
    </>
  ),
  // Amenities, extra items & services
  amenities: (
    <>
      <path className="duo" d="M12 3.5 13.8 9l5.7.2-4.5 3.5 1.6 5.5-4.6-3.3-4.6 3.3 1.6-5.5-4.5-3.5L10.2 9z" />
      <path d="M12 3.5 13.8 9l5.7.2-4.5 3.5 1.6 5.5-4.6-3.3-4.6 3.3 1.6-5.5-4.5-3.5L10.2 9z" />
    </>
  ),
  // Flat valuation (composite rate)
  flat: (
    <>
      <rect className="duo" x="5" y="3" width="14" height="18" rx="1.5" />
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15M10.5 21v-2.5h3V21" />
    </>
  ),
  // Apartment & flat details
  flatDetails: (
    <>
      <path className="duo" d="M6.5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17z" />
      <path d="M6.5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M3.5 21h17" />
      <circle cx="14" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  // Construction stage progress
  progress: (
    <>
      <path className="duo" d="M4 17a8 8 0 1 1 16 0z" />
      <path d="M4 17a8 8 0 1 1 16 0M12 17l4-5" />
      <circle cx="12" cy="17" r="1.3" fill="currentColor" />
    </>
  ),
  // Proposed building (estimate inputs)
  proposed: (
    <>
      <path className="duo" d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
    </>
  ),
};

const FALLBACK = ICONS.documents;

export default function SectionIcon({ section, size = 18 }) {
  return <Duo size={size}>{ICONS[section.key] || FALLBACK}</Duo>;
}
