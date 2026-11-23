// Google Maps version of the one-pin site map (Add customer → site address): tap or drag puts the pin on the plot.
import { useEffect, useRef, useState } from 'react';

const INDIA = { lat: 20.6, lng: 78.9 };
const round7 = (x) => +x.toFixed(7);

export default function GoogleSitePinMap({ g, pin, focus, onChange }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const [base, setBase] = useState('satellite');

  useEffect(() => {
    const m = new g.Map(box.current, {
      center: pin ? { lat: pin.lat, lng: pin.lon } : INDIA,
      zoom: pin ? 18 : 5,
      mapTypeId: 'hybrid', tilt: 0, gestureHandling: 'greedy', clickableIcons: false,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: true, rotateControl: false,
    });
    map.current = m;
    const l = m.addListener('click', (e) => latest.current({ lat: round7(e.latLng.lat()), lon: round7(e.latLng.lng()) }));
    return () => g.event.removeListener(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { map.current?.setMapTypeId(base === 'satellite' ? 'hybrid' : 'roadmap'); }, [base]);

  useEffect(() => {
    if (!pin) { marker.current?.setMap(null); marker.current = null; return; }
    if (!marker.current) {
      marker.current = new g.Marker({ position: { lat: pin.lat, lng: pin.lon }, map: map.current, draggable: true, title: 'Site: drag to move' });
      marker.current.addListener('dragend', (e) => latest.current({ lat: round7(e.latLng.lat()), lon: round7(e.latLng.lng()) }));
    } else marker.current.setPosition({ lat: pin.lat, lng: pin.lon });
  }, [pin?.lat, pin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus || !map.current) return;
    map.current.setCenter({ lat: focus.lat, lng: focus.lon });
    map.current.setZoom(focus.zoom || 18);
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
