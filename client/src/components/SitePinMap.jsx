// One pin for the site (Add customer → site address): Google Maps. The typed address is found on the map, and a tap or
// a drag puts the pin exactly on the plot (see GoogleSitePinMap.jsx).
// pin: { lat, lon } | null · focus: { lat, lon, zoom } to move the view to (e.g. the address found) · onChange(pin)
import { MapUnavailable, useGoogleMaps } from '../utils/googleMaps.jsx';
import GoogleSitePinMap from './GoogleSitePinMap.jsx';

export default function SitePinMap(props) {
  const g = useGoogleMaps();
  if (g === undefined) return <div className="bm-map sp-map bm-loading">Loading map…</div>;
  if (!g) return <MapUnavailable className="bm-map sp-map" />;
  return <GoogleSitePinMap g={g} {...props} />;
}
