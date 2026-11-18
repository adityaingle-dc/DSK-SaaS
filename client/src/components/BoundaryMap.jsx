// Satellite map for marking the plot boundary: tap to drop pins around the plot, drag a pin to adjust it,
// tap a pin to remove it. Free imagery (Esri World Imagery) + OpenStreetMap streets, no API key.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const LAYERS = {
  satellite: () =>
    L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 19, maxZoom: 21, opacity: 0.9,
      }),
    ]),
  streets: () =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 19, maxZoom: 21, attribution: '© OpenStreetMap contributors',
    }),
};

const INDIA = { center: [20.6, 78.9], zoom: 5 };
const pinIcon = (n) => L.divIcon({ className: 'bm-pin', html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
const centreIcon = L.divIcon({ className: 'bm-centre', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });

export default function BoundaryMap({ points, centre, focus, onChange }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const shapes = useRef(null);
  const latest = useRef({ points, onChange });
  latest.current = { points, onChange };
  const [base, setBase] = useState('satellite');

  // create the map once
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, tap: true });
    map.current = m;
    m.attributionControl.setPrefix('Leaflet');
    shapes.current = L.layerGroup().addTo(m);
    if (points.length) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 20 });
    else if (centre) m.setView([centre.lat, centre.lon], 19);
    else m.setView(INDIA.center, INDIA.zoom);
    m.on('click', (e) => {
      const { points: cur, onChange: change } = latest.current;
      change([...cur, { lat: +e.latlng.lat.toFixed(7), lon: +e.latlng.lng.toFixed(7) }]);
    });
    // the map sits in a form that may still be laying out
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => { clearTimeout(t); m.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // base layer
  useEffect(() => {
    const m = map.current;
    if (layer.current) m.removeLayer(layer.current);
    layer.current = LAYERS[base]().addTo(m);
    layer.current.bringToBack?.();
  }, [base]);

  // fly to a point picked outside the map (paste / my location)
  useEffect(() => {
    if (focus && map.current) map.current.setView([focus.lat, focus.lon], Math.max(map.current.getZoom(), 19));
  }, [focus]);

  // redraw pins + outline
  useEffect(() => {
    const g = shapes.current;
    g.clearLayers();
    const ll = points.map((p) => [p.lat, p.lon]);
    if (ll.length >= 3) L.polygon(ll, { color: '#facc15', weight: 2, fillColor: '#facc15', fillOpacity: 0.18 }).addTo(g);
    else if (ll.length === 2) L.polyline(ll, { color: '#facc15', weight: 2 }).addTo(g);
    points.forEach((p, i) => {
      const mk = L.marker([p.lat, p.lon], { icon: pinIcon(i + 1), draggable: true, title: `Point ${i + 1}: tap to remove, drag to move` }).addTo(g);
      mk.on('dragend', () => {
        const at = mk.getLatLng();
        const cur = [...latest.current.points];
        cur[i] = { lat: +at.lat.toFixed(7), lon: +at.lng.toFixed(7) };
        latest.current.onChange(cur);
      });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        latest.current.onChange(latest.current.points.filter((_, j) => j !== i));
      });
    });
    if (centre && ll.length >= 3) L.marker([centre.lat, centre.lon], { icon: centreIcon, interactive: false, keyboard: false }).addTo(g);
  }, [points, centre]);

  const fit = () => {
    if (points.length) map.current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 20 });
  };

  return (
    <div className="bm">
      <div ref={box} className="bm-map" />
      <div className="bm-tools">
        <div className="bm-seg" role="group" aria-label="Map type">
          <button type="button" className={base === 'satellite' ? 'on' : ''} onClick={() => setBase('satellite')}>Satellite</button>
          <button type="button" className={base === 'streets' ? 'on' : ''} onClick={() => setBase('streets')}>Streets</button>
        </div>
        {points.length > 0 && <button type="button" className="bm-btn" onClick={fit}>Fit plot</button>}
      </div>
    </div>
  );
}
