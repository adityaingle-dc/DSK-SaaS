// One pin for the site (Add customer → site address): the typed address is found on the map, and a tap or a drag puts
// the pin exactly on the plot. Google Maps when a key is set (GoogleSitePinMap.jsx); otherwise the free imagery of the
// plot map (Esri satellite + OpenStreetMap streets).
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LAYERS } from './BoundaryMap.jsx';
import { useGoogleMaps } from '../utils/googleMaps.js';
import GoogleSitePinMap from './GoogleSitePinMap.jsx';

const INDIA = { center: [20.6, 78.9], zoom: 5 };
const siteIcon = L.divIcon({ className: 'sp-pin', html: '<span></span>', iconSize: [28, 38], iconAnchor: [14, 36] });

// pin: { lat, lon } | null · focus: { lat, lon, zoom } to move the view to (e.g. the address found) · onChange(pin)
// Google Maps when a key is set and Google accepts it; otherwise the free map below
export default function SitePinMap(props) {
  const g = useGoogleMaps();
  if (g === undefined) return <div className="bm-map sp-map bm-loading">Loading map…</div>;
  return g ? <GoogleSitePinMap g={g} {...props} /> : <LeafletSitePinMap {...props} />;
}

function LeafletSitePinMap({ pin, focus, onChange }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const marker = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const [base, setBase] = useState('satellite');

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, tap: true });
    map.current = m;
    m.attributionControl.setPrefix('Leaflet');
    if (pin) m.setView([pin.lat, pin.lon], 18);
    else m.setView(INDIA.center, INDIA.zoom);
    m.on('click', (e) => latest.current({ lat: +e.latlng.lat.toFixed(7), lon: +e.latlng.lng.toFixed(7) }));
    const t = setTimeout(() => m.invalidateSize(), 150); // the dialog may still be laying out
    return () => { clearTimeout(t); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (layer.current) m.removeLayer(layer.current);
    layer.current = LAYERS[base]().addTo(m);
  }, [base]);

  // the pin: draggable; follows the value
  useEffect(() => {
    const m = map.current;
    if (!pin) { if (marker.current) { m.removeLayer(marker.current); marker.current = null; } return; }
    if (!marker.current) {
      marker.current = L.marker([pin.lat, pin.lon], { icon: siteIcon, draggable: true, keyboard: false }).addTo(m);
      marker.current.on('dragend', (e) => { const p = e.target.getLatLng(); latest.current({ lat: +p.lat.toFixed(7), lon: +p.lng.toFixed(7) }); });
    } else marker.current.setLatLng([pin.lat, pin.lon]);
  }, [pin?.lat, pin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // move the view (address found, my location)
  useEffect(() => {
    if (focus) map.current.setView([focus.lat, focus.lon], focus.zoom || 18);
  }, [focus]);

  return (
    <div className="bm sp">
      <div ref={box} className="bm-map sp-map" />
      <div className="bm-tools">
        <div className="bm-seg" role="group" aria-label="Map type">
          <button type="button" className={base === 'satellite' ? 'on' : ''} onClick={() => setBase('satellite')}>Satellite</button>
          <button type="button" className={base === 'streets' ? 'on' : ''} onClick={() => setBase('streets')}>Streets</button>
        </div>
      </div>
    </div>
  );
}
