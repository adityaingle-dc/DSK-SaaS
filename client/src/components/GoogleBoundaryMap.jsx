// Google Maps version of the plot map (same behaviour as the free map in BoundaryMap.jsx): tap to drop numbered
// pins around the plot, drag a pin to move it, tap a pin to remove it; the outline and the centre are drawn.
import { useEffect, useRef, useState } from 'react';

const INDIA = { lat: 20.6, lng: 78.9 };
const round7 = (x) => +x.toFixed(7);

export default function GoogleBoundaryMap({ g, points, centre, focus, onChange }) {
  const box = useRef(null);
  const map = useRef(null);
  const drawn = useRef([]);
  const latest = useRef({ points, onChange });
  latest.current = { points, onChange };
  const [base, setBase] = useState('satellite');

  // create the map once
  useEffect(() => {
    const m = new g.Map(box.current, {
      center: centre ? { lat: centre.lat, lng: centre.lon } : INDIA,
      zoom: centre ? 19 : 5,
      mapTypeId: 'hybrid', tilt: 0, gestureHandling: 'greedy', clickableIcons: false,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: true, rotateControl: false,
    });
    map.current = m;
    if (points.length) {
      const b = new g.LatLngBounds();
      points.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }));
      m.fitBounds(b, 40);
    }
    const l = m.addListener('click', (e) => {
      const { points: cur, onChange: change } = latest.current;
      change([...cur, { lat: round7(e.latLng.lat()), lon: round7(e.latLng.lng()) }]);
    });
    return () => g.event.removeListener(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { map.current?.setMapTypeId(base === 'satellite' ? 'hybrid' : 'roadmap'); }, [base]);

  // fly to a point picked outside the map (paste / my location)
  useEffect(() => {
    if (!focus || !map.current) return;
    map.current.setCenter({ lat: focus.lat, lng: focus.lon });
    map.current.setZoom(Math.max(map.current.getZoom() || 0, 19));
  }, [focus]);

  // redraw pins + outline
  useEffect(() => {
    const m = map.current;
    drawn.current.forEach((x) => x.setMap(null));
    drawn.current = [];
    const path = points.map((p) => ({ lat: p.lat, lng: p.lon }));
    const style = { strokeColor: '#facc15', strokeWeight: 2, clickable: false };
    if (path.length >= 3) drawn.current.push(new g.Polygon({ ...style, paths: path, fillColor: '#facc15', fillOpacity: 0.18, map: m }));
    else if (path.length === 2) drawn.current.push(new g.Polyline({ ...style, path, map: m }));
    points.forEach((p, i) => {
      const mk = new g.Marker({
        position: { lat: p.lat, lng: p.lon }, map: m, draggable: true, title: `Point ${i + 1}: tap to remove, drag to move`,
        label: { text: String(i + 1), color: '#422006', fontSize: '11px', fontWeight: '700' },
        icon: { path: g.SymbolPath.CIRCLE, scale: 11, fillColor: '#facc15', fillOpacity: 1, strokeColor: '#422006', strokeWeight: 1.2 },
      });
      mk.addListener('dragend', (e) => {
        const cur = [...latest.current.points];
        cur[i] = { lat: round7(e.latLng.lat()), lon: round7(e.latLng.lng()) };
        latest.current.onChange(cur);
      });
      mk.addListener('click', () => latest.current.onChange(latest.current.points.filter((_, j) => j !== i)));
      drawn.current.push(mk);
    });
    if (centre && path.length >= 3) {
      drawn.current.push(new g.Marker({
        position: { lat: centre.lat, lng: centre.lon }, map: m, clickable: false,
        icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: '#dc2626', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      }));
    }
  }, [points, centre]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = () => {
    if (!points.length) return;
    const b = new g.LatLngBounds();
    points.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }));
    map.current.fitBounds(b, 40);
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
