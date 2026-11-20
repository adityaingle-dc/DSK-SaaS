import { Duo } from './SectionIcons.jsx';

// Two-tone app icons (page headings, sidebar, tab bar) in the same style as the form section icons.
// Each takes { size } like the outline icons in Icons.jsx, so they can be swapped in directly.

export const DuoHome = ({ size = 20 }) => (
  <Duo size={size}>
    <path className="duo" d="M5 9.5 12 4l7 5.5V20H5z" />
    <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5M10 20v-6h4v6" />
  </Duo>
);

export const DuoList = ({ size = 20 }) => (
  <Duo size={size}>
    <rect className="duo" x="4" y="3" width="16" height="18" rx="2.5" />
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Duo>
);

export const DuoBuilding = ({ size = 20 }) => (
  <Duo size={size}>
    <path className="duo" d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16z" />
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M3 21h18" />
  </Duo>
);

// new / edit valuation: a sheet with a pen
export const DuoSheet = ({ size = 20 }) => (
  <Duo size={size}>
    <path className="duo" d="M6 3h8l4 4v6.5L12.5 19H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M18 11V7l-4-4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 3v4h4M8 11h6M8 14.5h3" />
    <path d="m15 21 .6-2.6 4.3-4.3a1.4 1.4 0 0 1 2 2l-4.3 4.3z" />
  </Duo>
);

export const DuoUsers = ({ size = 20 }) => (
  <Duo size={size}>
    <circle className="duo" cx="9" cy="8" r="3.5" />
    <path className="duo" d="M2.5 20a6.5 6.5 0 0 1 13 0z" />
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </Duo>
);

export const DuoPulse = ({ size = 20 }) => (
  <Duo size={size}>
    <rect className="duo" x="2.5" y="4" width="19" height="16" rx="3" />
    <path d="M3 12h4l3-6 4 12 3-6h4" />
  </Duo>
);

export const DuoKey = ({ size = 20 }) => (
  <Duo size={size}>
    <circle className="duo" cx="8" cy="15" r="4.5" />
    <circle cx="8" cy="15" r="4.5" />
    <path d="m11.2 11.8 8.8-8.8M16.5 6.5l3 3M13.8 9.2l2 2" />
  </Duo>
);

// customers: a contact card
export const DuoContact = ({ size = 20 }) => (
  <Duo size={size}>
    <rect className="duo" x="3" y="4.5" width="18" height="15" rx="2.5" />
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="9" cy="11" r="2.3" />
    <path d="M5.8 16.5a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3" />
  </Duo>
);

// a finished report: a page with a tick
export const DuoReport = ({ size = 20 }) => (
  <Duo size={size}>
    <path className="duo" d="M6 3h8l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zM14 3v4h4M8 10h6M8 13h4" />
    <path d="m9 17 1.6 1.6L14 15.2" />
  </Duo>
);

// area calculator: a plot outline with a measuring corner
export const DuoArea = ({ size = 20 }) => (
  <Duo size={size}>
    <path className="duo" d="M5 7 15 4l4 9-8 7-6-4z" />
    <path d="M5 7 15 4l4 9-8 7-6-4zM5 7v9" />
    <path d="M2.5 21h6M2.5 21v-6M4.5 21v-1.2M6.5 21v-1.2M2.5 19h1.2M2.5 17h1.2" />
  </Duo>
);
