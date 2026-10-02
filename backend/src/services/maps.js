// Layanan peta berbasis OpenStreetMap — TANPA Google Maps API key
// Routing : OSRM (Project-OSRM public demo instance)
// Geocoding: Nominatim (OSM)
// Search   : Nominatim search
// Semua request dilakukan dari backend agar User-Agent dapat diatur dengan benar.

const OSRM  = 'https://router.project-osrm.org';
const NOMI  = 'https://nominatim.openstreetmap.org';
const UA    = 'ANJEM-KampusApp/1.0 (demo-presentasi)';

const fail = (m, s) => { throw Object.assign(new Error(m), { status: s || 502 }); };

// Helper fetch dengan timeout 10 detik
async function get(url, qs = {}) {
  const u = new URL(url);
  Object.entries(qs).forEach(([k, v]) => u.searchParams.set(k, v));
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(u.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'id,en;q=0.8' }
    });
    if (!r.ok) fail(`HTTP ${r.status} dari ${u.hostname}`, 502);
    return r.json();
  } finally {
    clearTimeout(tid);
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────
// Mengambil rute mengemudi dari titik A ke B via OSRM.
// Mengembalikan { distance_km, duration_min, polyline }
// polyline = array koordinat [[lat,lng], ...] untuk Leaflet L.polyline()
exports.route = async (a, b) => {
  // OSRM format: /route/v1/driving/{lon1},{lat1};{lon2},{lat2}
  const url = `${OSRM}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}`;
  let j;
  try {
    j = await get(url, { overview: 'full', geometries: 'geojson', steps: 'false' });
  } catch (e) {
    // Fallback jika OSRM tidak reachable: hitung haversine + estimasi kasar
    const km = haversine(a.lat, a.lng, b.lat, b.lng);
    const min = Math.max(1, Math.round(km / 0.4)); // asumsi ~24 km/h
    return { distance_km: +km.toFixed(2), duration_min: min, polyline: [[a.lat, a.lng], [b.lat, b.lng]] };
  }
  if (j.code !== 'Ok' || !j.routes?.[0]) fail('Rute tidak dapat ditemukan. Coba lokasi lain.', 422);
  const rt = j.routes[0];
  // GeoJSON coordinates: [[lng, lat], ...] → balik ke [[lat, lng]] untuk Leaflet
  const polyline = rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return {
    distance_km : +(rt.distance / 1000).toFixed(2),
    duration_min: Math.max(1, Math.round(rt.duration / 60)),
    polyline
  };
};

// ─── Search ───────────────────────────────────────────────────────────────────
// Mencari lokasi berdasarkan query teks, dibiaskan ke area sekitar {lat, lng}.
// Mengembalikan [{ name, address, lat, lng }]
exports.search = async (q, p) => {
  let j;
  try {
    j = await get(`${NOMI}/search`, {
      q,
      format         : 'jsonv2',
      addressdetails : 1,
      limit          : 7,
      'accept-language': 'id',
      viewbox        : `${p.lng - 0.1},${p.lat + 0.1},${p.lng + 0.1},${p.lat - 0.1}`,
      bounded        : 0  // 0 = tetap cari di luar viewbox jika kurang hasil
    });
  } catch {
    return [];
  }
  if (!Array.isArray(j)) return [];
  return j.map(x => ({
    name   : x.name || x.display_name?.split(',')[0] || '',
    address: x.display_name || '',
    lat    : parseFloat(x.lat),
    lng    : parseFloat(x.lon)
  }));
};

// ─── Reverse Geocode ──────────────────────────────────────────────────────────
// Menerjemahkan koordinat ke nama alamat.
// Mengembalikan string alamat, atau "lat, lng" sebagai fallback.
exports.geocode = async (lat, lng) => {
  try {
    const j = await get(`${NOMI}/reverse`, {
      lat,
      lon             : lng,
      format          : 'jsonv2',
      addressdetails  : 1,
      'accept-language': 'id'
    });
    return j.display_name || `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
  } catch {
    return `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
  }
};

// ─── Haversine (fallback) ─────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
