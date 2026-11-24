// Plot map (Property location step, area calculator): Google Maps. Tap to drop numbered pins around the plot, drag a
// pin to move it, tap a pin to remove it (see GoogleBoundaryMap.jsx).
import { MapUnavailable, useGoogleMaps } from '../utils/googleMaps.jsx';
import GoogleBoundaryMap from './GoogleBoundaryMap.jsx';

export default function BoundaryMap(props) {
  const g = useGoogleMaps();
  if (g === undefined) return <div className="bm-map bm-loading">Loading map…</div>;
  if (!g) return <MapUnavailable className="bm-map" />;
  return <GoogleBoundaryMap g={g} {...props} />;
}
