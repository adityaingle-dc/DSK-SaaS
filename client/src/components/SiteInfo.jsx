import { propertyAddress } from '@dsk/shared';
import { IconChevron } from './Icons.jsx';
import SectionIcon from './SectionIcons.jsx';

// Where the evaluator has to go: address, landmark and a Google Maps link.

// "18.5602, 73.8076" -> { lat, lon } (or null)
export function parseLatLon(text) {
  const m = String(text || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

// Google Maps directions: exact GPS point when we have it, otherwise the address text
export function directionsUrl({ address, landmark, location } = {}) {
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lon}`;
  }
  const q = [address, landmark].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export const siteFromProperty = (p = {}) => ({ address: propertyAddress(p), landmark: p.landmark || '', location: p.location || null, description: p.description || '' });

export function DirectionsLink({ site, className = 'btn small directions-btn' }) {
  const url = directionsUrl(site);
  if (!url) return null;
  return (
    <a className={className} href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      Directions <IconChevron size={14} />
    </a>
  );
}

// one line: pin · address · landmark · Directions
export function SiteLine({ site, label = 'Site' }) {
  if (!site?.address) return <span className="site-line muted">Site address not given yet</span>;
  return (
    <span className="site-line">
      <span className="site-pin" aria-hidden="true"><SectionIcon section={{ key: 'property' }} size={14} /></span>
      <span><strong>{label}:</strong> {site.address}{site.landmark && <span className="muted"> · Landmark: {site.landmark}</span>}</span>
      <DirectionsLink site={site} className="site-dir" />
    </span>
  );
}

// card for the valuation page
export default function SiteCard({ property }) {
  const site = siteFromProperty(property);
  return (
    <section className="card site-card">
      <div className="card-head"><h2>Site to visit</h2></div>
      {site.address ? (
        <>
          <p className="site-address">{site.address}</p>
          {site.description && <p className="muted small">{site.description}</p>}
          {site.landmark && <p className="small">Landmark: <strong>{site.landmark}</strong></p>}
          <div className="actions left site-actions">
            <DirectionsLink site={site} className="btn primary small directions-btn" />
            {site.location && <span className="muted small">GPS {site.location.lat}, {site.location.lon}</span>}
          </div>
        </>
      ) : (
        <p className="muted small">The site address hasn't been entered yet. It goes in the sheet's "Property location" section.</p>
      )}
    </section>
  );
}
